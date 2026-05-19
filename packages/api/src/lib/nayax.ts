// ─── Nayax Lynx API client ────────────────────────────────────────────────────
// Used for gift card balance lookup and fund loading.
// Docs: https://devzone.nayax.com
//
// ─── TODO: Future migration ───────────────────────────────────────────────────
// Import existing gift card ownership data from the Nayax ADMIN portal.
// Each card (CardDisplayNumber / CardUniqueIdentifier) needs to be linked to
// the customer who owns it so staff can see a customer's card(s) on their
// profile and we can track reload history against an order/customer record.
//
// Steps when ready:
//   1. Export card holder list from Nayax ADMIN (CSV or via GET /v1/cards).
//   2. Match CardHolderName / Email / MobileNumber against our customers table.
//   3. Insert into a new `customer_gift_cards` table:
//        customer_id, tenant_id, card_display_number, card_unique_identifier,
//        card_id (Nayax int), imported_at, notes
//   4. Surface cards on the CustomerModal "Gift Cards" tab so staff can see
//      current balance and reload history without re-entering the card number.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NAYAX_API_BASE_URL ?? 'https://lynx.nayax.com/operational'

function getToken() {
  const token = process.env.NAYAX_API_TOKEN
  if (!token) throw new Error('NAYAX_API_TOKEN is not configured')
  return token
}

function nayaxHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function nayaxFetch(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { ...nayaxHeaders(), ...options.headers },
  })
  const text = await res.text()
  console.log(`[nayax] ${options.method ?? 'GET'} ${url} → ${res.status}: ${text.slice(0, 200)}`)
  return { status: res.status, ok: res.ok, text }
}

// ─── Last machine used by card ───────────────────────────────────────────────

export interface NayaxLastTransaction {
  machineName:       string | null
  amount:            number | null
  authorizedAt:      string | null  // ISO datetime
}

/**
 * Query the most recent transaction(s) for a card number.
 * Nayax requires the card number as a SHA1 hash, base64-encoded.
 * Docs: POST /v1/cards/query?minutes={n}
 */
export async function getLastTransactionByCard(
  cardNumber: string,
  minutes = 1440   // default: last 24 hours
): Promise<NayaxLastTransaction | null> {
  // SHA1 hash the card number, then base64-encode it
  const { createHash } = await import('crypto')
  const sha1   = createHash('sha1').update(cardNumber).digest()
  const hashed = sha1.toString('base64')

  const { ok, status, text } = await nayaxFetch(
    `/v1/cards/query?minutes=${minutes}`,
    { method: 'POST', body: JSON.stringify(hashed) }
  )

  if (!ok) throw new Error(`Nayax card query failed (${status}): ${text.slice(0, 200)}`)

  let results: Record<string, unknown>[]
  try { results = JSON.parse(text) } catch { return null }
  if (!Array.isArray(results) || results.length === 0) return null

  // Sort by most recent and return first
  results.sort((a, b) => {
    const da = new Date((a.AuthorizationDate ?? a.authorizedAt ?? '') as string).getTime()
    const db = new Date((b.AuthorizationDate ?? b.authorizedAt ?? '') as string).getTime()
    return db - da
  })

  const latest = results[0]
  return {
    machineName:  (latest.MachineName  ?? latest.machineName  ?? null) as string | null,
    amount:       (latest.AmountValue  ?? latest.amountValue  ?? null) as number | null,
    authorizedAt: (latest.AuthorizationDate ?? latest.authorizedAt ?? null) as string | null,
  }
}

// ─── Card lookup ──────────────────────────────────────────────────────────────

export interface NayaxCard {
  CardID: number | null
  CardUniqueIdentifier: string
  CardDisplayNumber: string
  CardHolderName: string | null
  CardStatus: number | null
}

/**
 * Look up a card by its display number.
 * Primary: GET /v1/cards/displayNumber/{number}
 * Fallback (on 409): GET /v1/cards?CardDisplayNumber={number}
 */
export async function lookupCardByDisplayNumber(displayNumber: string): Promise<NayaxCard> {
  // Primary path
  const primary = await nayaxFetch(`/v1/cards/displayNumber/${encodeURIComponent(displayNumber)}`)

  if (primary.ok) {
    const data = JSON.parse(primary.text)
    return {
      CardID:                data.CardID ?? null,
      CardUniqueIdentifier:  data.CardUniqueIdentifier,
      CardDisplayNumber:     data.CardDisplayNumber ?? displayNumber,
      CardHolderName:        data.CardHolderName ?? null,
      CardStatus:            data.CardStatus ?? null,
    }
  }

  // Fallback for 409 (card exists but direct lookup not supported)
  if (primary.status === 409) {
    const fallback = await nayaxFetch(`/v1/cards?CardDisplayNumber=${encodeURIComponent(displayNumber)}`)
    if (!fallback.ok) throw new Error(`Nayax card lookup failed (${fallback.status})`)

    const list = JSON.parse(fallback.text)
    const matches: Record<string, unknown>[] = Array.isArray(list) ? list : []
    const match =
      matches.find((item) => {
        const d = (item.CardDetails as Record<string, unknown> | undefined) ?? {}
        return String(d.CardDisplayNumber ?? '') === displayNumber
      }) ?? matches[0]

    if (!match) throw new Error('Card not found')

    const details = (match.CardDetails as Record<string, unknown> | undefined) ?? {}
    const holder  = (match.CardHolderDetails as Record<string, unknown> | undefined) ?? {}
    return {
      CardID:                (details.CardID as number) ?? null,
      CardUniqueIdentifier:  String(details.CardUniqueIdentifier ?? ''),
      CardDisplayNumber:     String(details.CardDisplayNumber ?? displayNumber),
      CardHolderName:        (holder.CardHolderName as string) ?? null,
      CardStatus:            (details.Status as number) ?? null,
    }
  }

  throw new Error(`Nayax card lookup failed (${primary.status}): ${primary.text.slice(0, 200)}`)
}

// ─── Balance check ────────────────────────────────────────────────────────────

/**
 * Get the credit balance for a card.
 * Uses CardUniqueIdentifier (string), NOT the numeric CardID.
 * Endpoint: GET /v1/cards/{uid}/credit
 * Response: { value: number } or { Value: number } etc.
 */
export async function getCardBalance(cardUniqueIdentifier: string): Promise<number> {
  const { ok, status, text } = await nayaxFetch(`/v1/cards/${encodeURIComponent(cardUniqueIdentifier)}/credit`)
  if (!ok) throw new Error(`Nayax balance check failed (${status})`)
  const data = JSON.parse(text)
  const raw = data?.value ?? data?.Value ?? data?.credit ?? data?.Credit ?? 0
  return Number(raw)
}

// ─── Load funds ───────────────────────────────────────────────────────────────

/**
 * Add credit to a card.
 * @param cardUniqueIdentifier - The card's GUID-style unique identifier
 * @param amountDollars        - Dollar amount (not cents) to load
 * @param remarks              - Optional note (e.g. order number)
 * @returns The new card balance in dollars
 */
export async function addCreditToCard(
  cardUniqueIdentifier: string,
  amountDollars: number,
  remarks = 'Reload via LNDRY Co'
): Promise<number> {
  const params = new URLSearchParams({
    CardCredit: amountDollars.toString(),
    CreditChangeRemarks: encodeURIComponent(remarks),
  })
  const { ok, status, text } = await nayaxFetch(
    `/v1/cards/${encodeURIComponent(cardUniqueIdentifier)}/credit/add?${params}`,
    { method: 'POST' }
  )
  if (!ok) throw new Error(`Nayax credit load failed (${status}): ${text.slice(0, 200)}`)
  const data = JSON.parse(text)
  const raw = data?.value ?? data?.Value ?? data?.credit ?? data?.Credit ?? 0
  return Number(raw)
}
