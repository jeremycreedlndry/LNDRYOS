/**
 * Helcim API client
 * https://devdocs.helcim.com/
 */

const BASE = 'https://api.helcim.com/v2'

function getToken() {
  const t = process.env.HELCIM_API_TOKEN
  if (!t) throw new Error('HELCIM_API_TOKEN is not set')
  return t
}

async function helcimFetch<T = unknown>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const { idempotencyKey, ...init } = options
  const headers: Record<string, string> = {
    accept:         'application/json',
    'content-type': 'application/json',
    'api-token':    getToken(),
  }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const json = await res.json()
  if (!res.ok) {
    // Helcim errors can be array, object, or string
    let msg: string
    if (json?.errors) {
      if (Array.isArray(json.errors)) {
        msg = json.errors.map((e: { message?: string } | string) =>
          typeof e === 'string' ? e : e.message
        ).join(', ')
      } else if (typeof json.errors === 'object') {
        msg = Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(', ')
      } else {
        msg = String(json.errors)
      }
    } else {
      msg = json?.message ?? json?.error ?? `HTTP ${res.status}`
    }
    console.error(`[Helcim] ${path} ${res.status}:`, JSON.stringify(json))
    throw new Error(`Helcim: ${msg}`)
  }
  return json as T
}

// ─── Shared result type ───────────────────────────────────────────────────────

export interface HelcimChargeResult {
  transactionId:  number | string
  status:         string   // 'APPROVED' | 'DECLINED' | 'PENDING' | etc.
  approvalCode?:  string
  cardToken?:     string
  cardNumber?:    string   // last 4 digits
  cardType?:      string   // visa, mastercard, etc.
  amount?:        number
}

// ─── List terminals ───────────────────────────────────────────────────────────

export interface HelcimTerminal {
  terminalId:   number | string
  terminalName: string
  status:       string
  currency:     string
}

export async function listTerminals(): Promise<HelcimTerminal[]> {
  const res = await helcimFetch<{ terminals?: HelcimTerminal[] }>('/terminals')
  return res.terminals ?? []
}

// ─── Keyed card entry (card-not-present, sandbox/phone orders) ────────────────

export async function purchaseWithCard(params: {
  amountCents:    number
  cardNumber:     string
  cardExpiry:     string   // MMYY
  cardCVV:        string
  cardHolderName?: string
  saveCard?:      boolean
  customerCode?:  string
  idempotencyKey: string
  currency?:      string
  ipAddress?:     string
}): Promise<HelcimChargeResult> {
  return helcimFetch<HelcimChargeResult>('/payment/purchase', {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      ipAddress:    params.ipAddress ?? '127.0.0.1',
      currency:     params.currency ?? 'CAD',
      amount:       +(params.amountCents / 100).toFixed(2),
      ...(params.saveCard ? { saveCard: 1 } : {}),
      ...(params.customerCode ? { customerCode: params.customerCode } : {}),
      cardData: {
        cardNumber:     params.cardNumber.replace(/\s/g, ''),
        cardExpiry:     params.cardExpiry.replace(/\D/g, ''),
        cardCVV:        params.cardCVV,
        ...(params.cardHolderName ? { cardHolderName: params.cardHolderName } : {}),
      },
    }),
  })
}

// ─── Terminal purchase (card-present, physical device) ───────────────────────
// Helcim activates the terminal; poll getTransaction() for the result.

export async function purchaseWithTerminal(params: {
  amountCents:    number
  terminalId:     string | number
  idempotencyKey: string
  currency?:      string
}): Promise<HelcimChargeResult> {
  return helcimFetch<HelcimChargeResult>('/payment/purchase', {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      currency:   params.currency ?? 'CAD',
      amount:     +(params.amountCents / 100).toFixed(2),
      terminalId: Number(params.terminalId),
    }),
  })
}

// ─── Charge a saved card token ────────────────────────────────────────────────

export async function chargeCardToken(params: {
  amountCents:    number
  cardToken:      string
  idempotencyKey: string
  currency?:      string
  ipAddress?:     string
}): Promise<HelcimChargeResult> {
  return helcimFetch<HelcimChargeResult>('/payment/purchase', {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      ipAddress:  params.ipAddress ?? '127.0.0.1',
      currency:   params.currency ?? 'CAD',
      amount:     +(params.amountCents / 100).toFixed(2),
      cardData: {
        cardToken: params.cardToken,
      },
    }),
  })
}

// ─── Fetch / poll a transaction ───────────────────────────────────────────────

export interface HelcimTransaction {
  transactionId: number | string
  status:        string
  approvalCode?: string
  cardToken?:    string
  cardNumber?:   string
  cardType?:     string
  amount?:       number
}

export async function getTransaction(transactionId: string | number): Promise<HelcimTransaction> {
  return helcimFetch<HelcimTransaction>(`/card-transactions/${transactionId}`)
}

// ─── HelcimPay.js initialization (kept for reference) ────────────────────────

export interface HelcimPaySession {
  checkoutToken: string
  secretToken:   string
}

export async function initializeHelcimPay(params: {
  amountCents:   number
  currency?:     string
  customerCode?: string
}): Promise<HelcimPaySession> {
  return helcimFetch<HelcimPaySession>('/helcim-pay/initialize', {
    method: 'POST',
    body: JSON.stringify({
      paymentType:  'purchase',
      amount:       +(params.amountCents / 100).toFixed(2),
      currency:     params.currency ?? 'CAD',
      ...(params.customerCode ? { customerCode: params.customerCode } : {}),
    }),
  })
}
