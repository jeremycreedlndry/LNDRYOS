'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CheckCircle, ShoppingBag, AlertCircle } from 'lucide-react'

interface OrderLine {
  name: string
  quantity: number
  unit_label: string
  unit_price: number
  line_total: number
}

interface OrderData {
  id: string
  order_number: string
  total_amount: number
  paid_amount: number
  payment_status: string
  subtotal: number
  tax_amount: number
  notes?: string | null
  lines: OrderLine[]
  tenant: { name: string; settings?: Record<string, unknown> } | null
  customer: { first_name: string; last_name: string } | null
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function PayPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const searchParams = useSearchParams()
  const token = searchParams.get('t') ?? ''

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!orderId || !token) { setError('Invalid link'); setLoading(false); return }

    fetch(`/api/pay/order-details?id=${orderId}&t=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setOrder(data)
      })
      .catch(() => setError('Failed to load order'))
      .finally(() => setLoading(false))
  }, [orderId, token])

  async function handlePay() {
    setPaying(true)
    try {
      const res = await fetch('/api/pay/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, payment_token: token }),
      })
      const { url, error: err } = await res.json()
      if (err) { alert(err); setPaying(false); return }
      window.location.href = url
    } catch {
      alert('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  const storeName = order?.tenant?.name ?? 'Laundry'
  const balance = order ? order.total_amount - order.paid_amount : 0

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-3">
            <ShoppingBag className="h-6 w-6 text-blue-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{storeName}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading && (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading…</div>
          )}

          {error && (
            <div className="px-6 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">{error}</p>
            </div>
          )}

          {order && order.payment_status === 'paid' && (
            <div className="px-6 py-10 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-gray-900 mb-1">Paid in full</h2>
              <p className="text-sm text-gray-500">Order #{order.order_number} — {fmt(order.total_amount)}</p>
            </div>
          )}

          {order && order.payment_status !== 'paid' && (
            <>
              <div className="px-6 pt-6 pb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Order</p>
                <p className="text-lg font-bold text-gray-900">#{order.order_number}</p>
                {order.customer && (
                  <p className="text-sm text-gray-500">{order.customer.first_name} {order.customer.last_name}</p>
                )}
              </div>

              {/* Line items */}
              <div className="border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Item</th>
                      <th className="px-6 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {order.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-6 py-3 text-gray-700">
                          {l.name}
                          {l.unit_label !== 'item' && (
                            <span className="text-gray-400 text-xs block">{l.quantity} {l.unit_label} × {fmt(l.unit_price)}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-gray-900">{fmt(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    {order.tax_amount > 0 && (
                      <tr>
                        <td className="px-6 py-2 text-sm text-gray-500">Subtotal</td>
                        <td className="px-6 py-2 text-right text-sm text-gray-500">{fmt(order.subtotal)}</td>
                      </tr>
                    )}
                    {order.tax_amount > 0 && (
                      <tr>
                        <td className="px-6 py-2 text-sm text-gray-500">Tax</td>
                        <td className="px-6 py-2 text-right text-sm text-gray-500">{fmt(order.tax_amount)}</td>
                      </tr>
                    )}
                    {order.paid_amount > 0 && (
                      <tr>
                        <td className="px-6 py-2 text-sm text-gray-500">Paid</td>
                        <td className="px-6 py-2 text-right text-sm text-green-600">−{fmt(order.paid_amount)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-6 py-3 font-bold text-gray-900">Balance due</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-900 text-lg">{fmt(balance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="px-6 pb-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{order.notes}</p>
                </div>
              )}

              {/* Pay button */}
              <div className="px-6 pb-6 pt-2">
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full rounded-xl bg-blue-700 px-6 py-4 text-white font-bold text-base hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  {paying ? 'Redirecting…' : `Pay ${fmt(balance)} securely`}
                </button>
                <p className="text-center text-xs text-gray-400 mt-3">Powered by Stripe · Secured with SSL</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
