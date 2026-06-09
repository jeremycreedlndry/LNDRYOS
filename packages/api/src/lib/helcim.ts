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

  // Some endpoints (e.g. POST /devices/{code}/payment/purchase) return 202 with an empty body
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}

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
// GET /card-terminals/ → array of CardTerminal objects
// GET /devices/        → array of registered hardware devices (code + dateCreated)
//
// We use card-terminals for display (id, nickname, status) and devices for the
// 4-char code needed to initiate a hardware purchase.

export interface HelcimTerminal {
  terminalId:   number | string  // card-terminal id
  terminalName: string           // nickname
  status:       string           // ACTIVE | INACTIVE
  currency:     string
}

export interface HelcimDevice {
  code: string  // 4-char alphanumeric, used as path param for /devices/{code}/payment/purchase
  dateCreated: string
}

export async function listTerminals(): Promise<HelcimTerminal[]> {
  const res = await helcimFetch<Array<{ id: number; nickname: string; status: string; currency: string }>>('/card-terminals/')
  return (res ?? []).map(t => ({
    terminalId:   t.id,
    terminalName: t.nickname,
    status:       t.status,
    currency:     t.currency,
  }))
}

export async function listDevices(): Promise<HelcimDevice[]> {
  const res = await helcimFetch<HelcimDevice[]>('/devices/')
  return res ?? []
}

// ─── Terminal purchase (card-present, physical device) ───────────────────────
// POST /devices/{code}/payment/purchase
// {code} is the 4-char device code (e.g. "AYAB") from GET /devices/
// Helcim wakes the terminal; poll getTransaction() for the result.

export async function purchaseWithTerminal(params: {
  amountCents:    number
  deviceCode:     string   // 4-char code from listDevices()
  idempotencyKey: string
  currency?:      string
  invoiceNumber?: string
  customerCode?:  string
}): Promise<HelcimChargeResult> {
  return helcimFetch<HelcimChargeResult>(`/devices/${params.deviceCode}/payment/purchase`, {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      currency:          params.currency ?? 'CAD',
      transactionAmount: +(params.amountCents / 100).toFixed(2),
      ...(params.invoiceNumber ? { invoiceNumber: params.invoiceNumber } : {}),
      ...(params.customerCode  ? { customerCode:  params.customerCode  } : {}),
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

// Poll for a transaction by invoiceNumber — used after a device purchase (202 no body)
export async function getTransactionByInvoice(invoiceNumber: string): Promise<HelcimTransaction | null> {
  const res = await helcimFetch<HelcimTransaction[]>(
    `/card-transactions/?invoiceNumber=${encodeURIComponent(invoiceNumber)}&limit=1`
  )
  return Array.isArray(res) && res.length > 0 ? res[0] : null
}

// ─── Terminal card verification (zero-dollar, captures token) ────────────────

export async function verifyWithTerminal(params: {
  deviceCode:     string
  idempotencyKey: string
  invoiceNumber?: string
}): Promise<void> {
  // 202 empty body — same as purchaseWithTerminal
  await helcimFetch(`/devices/${params.deviceCode}/payment/verify`, {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      currency: 'CAD',
      ...(params.invoiceNumber ? { invoiceNumber: params.invoiceNumber } : {}),
    }),
  })
}

// ─── Refund a card transaction ────────────────────────────────────────────────
// POST /card-transactions/{transactionId}/refund
// amount is in dollars (e.g. 49.50), not cents

export async function refundTransaction(params: {
  transactionId:  string | number
  amountCents:    number
  idempotencyKey: string
}): Promise<HelcimChargeResult> {
  return helcimFetch<HelcimChargeResult>(
    `/card-transactions/${params.transactionId}/refund`,
    {
      method: 'POST',
      idempotencyKey: params.idempotencyKey,
      body: JSON.stringify({
        amount: +(params.amountCents / 100).toFixed(2),
      }),
    }
  )
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
  paymentType?:  'purchase' | 'verify'
}): Promise<HelcimPaySession> {
  return helcimFetch<HelcimPaySession>('/helcim-pay/initialize', {
    method: 'POST',
    body: JSON.stringify({
      paymentType:  params.paymentType ?? 'purchase',
      amount:       +(params.amountCents / 100).toFixed(2),
      currency:     params.currency ?? 'CAD',
      ...(params.customerCode ? { customerCode: params.customerCode } : {}),
    }),
  })
}
