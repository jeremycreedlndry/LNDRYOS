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
    const msg = json?.errors?.[0]?.message ?? json?.message ?? `HTTP ${res.status}`
    throw new Error(`Helcim ${path}: ${msg}`)
  }
  return json as T
}

// ─── HelcimPay.js initialization ─────────────────────────────────────────────

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

// ─── Charge a saved card token (server-side, no customer interaction) ─────────

export interface HelcimChargeResult {
  transactionId: number | string
  status:        string
  approvalCode?: string
  cardToken?:    string
  cardNumber?:   string   // last 4
  cardType?:     string   // visa, mastercard, etc.
  amount?:       number
}

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

// ─── Fetch a transaction (for server-side verification) ────────────────────────

export async function getTransaction(transactionId: string | number) {
  return helcimFetch(`/card-transactions/${transactionId}`)
}
