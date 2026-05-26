'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, AlertCircle, Shirt, CreditCard } from 'lucide-react'

// Read the ?t= token directly from the browser URL — avoids Next.js useSearchParams
// rendering issues where the hook can return empty params on server/hydration pass.
function getPayToken(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('t') ?? ''
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderLine {
  name:       string
  quantity:   number
  unit_label: string
  unit_price: number
  line_total: number
}

interface OrderData {
  id:             string
  order_number:   string
  total_amount:   number
  paid_amount:    number
  payment_status: string
  subtotal:       number
  tax_amount:     number
  discount_amount?: number
  notes?:         string | null
  lines:          OrderLine[]
  tenant:         { name: string; settings?: Record<string, unknown> } | null
  customer:       { first_name: string; last_name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

// ─── Helcim script loader ─────────────────────────────────────────────────────

function useHelcimScript() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (document.getElementById('helcim-pay-script')) { setReady(true); return }
    const s = document.createElement('script')
    s.id  = 'helcim-pay-script'
    s.src = 'https://secure.helcim.app/helcim-pay/services/start.js'
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])
  return ready
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayPage() {
  const { orderId }    = useParams<{ orderId: string }>()
  const helcimReady    = useHelcimScript()

  const [order,     setOrder]     = useState<OrderData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [paid,      setPaid]      = useState(false)
  const [saveCard,  setSaveCard]  = useState(false)
  const [paying,    setPaying]    = useState(false)
  const [payError,  setPayError]  = useState<string | null>(null)

  // Store checkout token so we can match the message event
  const checkoutTokenRef = useRef<string | null>(null)

  // ── Load order details ────────────────────────────────────────────────────
  useEffect(() => {
    const token = getPayToken()
    if (!orderId || !token) { setError('Invalid payment link'); setLoading(false); return }


    fetch(`/api/pay/order-details?id=${orderId}&t=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else {
          setOrder(data)
          if (data.payment_status === 'paid') setPaid(true)
          // Update browser tab title once order is loaded
          const storeName = data.tenant?.name ?? 'The LNDRY Co.'
          document.title = `${storeName}: ${data.order_number}`
        }
      })
      .catch(() => setError('Failed to load order'))
      .finally(() => setLoading(false))
  }, [orderId])

  // ── Listen for HelcimPay.js completion event ──────────────────────────────
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const ct = checkoutTokenRef.current
      if (!ct) return
      if (event.data?.eventName !== `helcim-pay-js-${ct}`) return

      const { eventStatus, eventMessage } = event.data

      if (eventStatus === 'ABORTED') {
        setPaying(false)
        setPayError('Payment cancelled.')
        checkoutTokenRef.current = null
        return
      }

      if (eventStatus === 'SUCCESS') {
        // Helcim sends eventMessage as a JSON string; parse it first.
        // Actual transaction data is at: JSON.parse(eventMessage).data.data.*
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: any    = typeof eventMessage === 'string' ? JSON.parse(eventMessage) : (eventMessage ?? {})
        const txn            = parsed?.data?.data ?? {}
        const transactionId  = txn.transactionId
        const amountCents    = txn.amount ? Math.round(parseFloat(String(txn.amount)) * 100) : null
        const cardToken      = txn.cardToken
        const cardLast4      = txn.cardNumber?.slice(-4) ?? null  // F6L4 → last 4
        const cardBrand      = txn.cardType ?? null

        // Confirm server-side
        const res = await fetch('/api/pay/helcim-confirm', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id:       orderId,
            payment_token:  getPayToken(),
            transaction_id: transactionId,
            amount_cents:   amountCents,
            card_token:     cardToken,
            card_last4:     cardLast4,
            card_brand:     cardBrand,
            save_card:      saveCard,
          }),
        })
        const result = await res.json()
        if (result.error) {
          setPayError(result.error)
          setPaying(false)
        } else {
          setPaid(true)
          setPaying(false)
        }
        checkoutTokenRef.current = null
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [orderId, saveCard])

  // ── Handle Pay click ─────────────────────────────────────────────────────
  async function handlePay() {
    if (!helcimReady || !order) return
    setPaying(true)
    setPayError(null)

    // Initialize Helcim checkout session
    const res = await fetch('/api/pay/helcim-init', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, payment_token: getPayToken() }),
    })
    const { checkoutToken, error: initErr } = await res.json()
    if (initErr) { setPayError(initErr); setPaying(false); return }

    // Store token for event matching
    checkoutTokenRef.current = checkoutToken

    // Render HelcimPay.js modal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).appendHelcimPayIframe?.(checkoutToken)
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const storeName    = (order?.tenant?.name) ?? 'The LNDRY Co.'
  const storePhone   = (order?.tenant?.settings as Record<string, string> | undefined)?.phone
  const balance      = order ? (order.total_amount - (order.paid_amount ?? 0)) : 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-sm">

        {/* Store header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-900 mb-3">
            <Shirt className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{storeName}</h1>
          {storePhone && <p className="text-sm text-gray-400 mt-0.5">{storePhone}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Loading */}
          {loading && (
            <div className="px-6 py-14 text-center text-sm text-gray-400">Loading…</div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="px-6 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">{error}</p>
            </div>
          )}

          {/* Paid */}
          {!loading && !error && paid && (
            <div className="px-6 py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-gray-900 mb-1">Paid — thank you!</h2>
              <p className="text-sm text-gray-500">
                Order #{order?.order_number} · {fmt(order?.total_amount ?? 0)}
              </p>
            </div>
          )}

          {/* Unpaid */}
          {!loading && !error && !paid && order && (
            <>
              {/* Order header */}
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Invoice</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">#{order.order_number}</p>
                {order.customer && (
                  <p className="text-sm text-gray-500">
                    {order.customer.first_name} {order.customer.last_name}
                  </p>
                )}
              </div>

              {/* Line items */}
              <div className="border-t border-gray-100">
                {order.lines.map((l, i) => (
                  <div key={i} className="flex items-start justify-between px-5 py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{l.name}</p>
                      {l.unit_label !== 'item' && (
                        <p className="text-xs text-gray-400">
                          {l.quantity % 1 === 0 ? l.quantity : l.quantity.toFixed(1)} {l.unit_label} × {fmt(l.unit_price)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 ml-4 shrink-0">{fmt(l.line_total)}</p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 space-y-1.5">
                {order.tax_amount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Tax (HST)</span><span>{fmt(order.tax_amount)}</span>
                    </div>
                  </>
                )}
                {(order.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span><span>−{fmt(order.discount_amount!)}</span>
                  </div>
                )}
                {(order.paid_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Paid</span><span>−{fmt(order.paid_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200 mt-1">
                  <span>Total due</span>
                  <span>{fmt(balance)}</span>
                </div>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{order.notes}</p>
                </div>
              )}

              {/* Save card */}
              <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveCard}
                    onChange={e => setSaveCard(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Save card for future orders</p>
                    <p className="text-xs text-gray-400">We&apos;ll auto-charge when your order is ready</p>
                  </div>
                </label>
              </div>

              {/* Error */}
              {payError && (
                <div className="mx-5 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p className="text-sm text-red-600">{payError}</p>
                </div>
              )}

              {/* Pay button */}
              <div className="px-5 pb-5">
                <button
                  onClick={handlePay}
                  disabled={paying || !helcimReady}
                  className="w-full rounded-xl bg-gray-900 px-6 py-4 text-white font-bold text-base hover:bg-gray-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  {paying ? 'Processing…' : `Pay ${fmt(balance)} securely`}
                </button>
                <p className="text-center text-xs text-gray-400 mt-3">
                  Secured with SSL · Powered by Helcim
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

