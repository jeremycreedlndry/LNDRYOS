'use client'

import { useState } from 'react'
import { Search, RotateCcw, X } from 'lucide-react'
import { skipToken } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { formatCurrency, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { OrderDetailModal } from '@/app/(dashboard)/orders/OrderDetailModal'
import type { OrderStatus } from '@laundry/db'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending',   label: 'Detail' },
  { value: 'cleaning',  label: 'Cleaning' },
  { value: 'ready',     label: 'Ready' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  cleaning:  'warning',
  ready:     'success',
  picked_up: 'default',
  delivered: 'default',
  cancelled: 'destructive',
  pending:   'secondary',
  in_progress: 'warning',
}

const METHOD_LABEL: Record<string, string> = {
  cash:              'Cash',
  card_present:      'Card Terminal',
  card_online:       'Card Online',
  account_credit:    'Account Credit',
  saved_card:        'Saved Card',
  pay_on_collection: 'On Collection',
  check:             'Check',
  direct_deposit:    'Direct Deposit',
  invoice:           'Invoice',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function summarizeLines(lines: { name: string; category: string; quantity: number; unit_label: string }[]) {
  const groups: Record<string, { qty: number; unit: string }> = {}
  for (const l of lines) {
    if (l.category === 'upcharge') continue
    const key = l.name.includes('· Bag') ? 'Wash & Fold' : l.name
    if (!groups[key]) groups[key] = { qty: 0, unit: l.unit_label }
    groups[key].qty += l.quantity
  }
  return Object.entries(groups)
    .map(([name, { qty, unit }]) =>
      unit === 'lb' ? `${name} ${qty % 1 === 0 ? qty : qty.toFixed(1)}lb`
        : qty === 1 ? name : `${name} ×${qty}`)
    .join(', ') || '—'
}

function formatPrefs(prefs: Record<string, string> | null | undefined) {
  if (!prefs) return ''
  const LABELS: Record<string, string> = {
    bleach: 'Bleach', dryer_sheets: 'Dryer Sheets',
    detergent_type: 'Detergent', fabric_softener: 'Fabric Softener',
    wash_temperature: 'Temp',
  }
  return Object.entries(prefs).filter(([, v]) => v)
    .map(([k, v]) => `${LABELS[k] ?? k}: ${v}`).join(', ')
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchParams {
  query?: string
  status?: OrderStatus
  payment_status?: 'paid' | 'unpaid' | 'partial'
  created_after?: string
  created_before?: string
  ready_after?: string
  ready_before?: string
  limit: number
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query,          setQuery]         = useState('')
  const [status,         setStatus]        = useState('')
  const [paymentStatus,  setPaymentStatus] = useState('')
  const [createdAfter,   setCreatedAfter]  = useState('')
  const [createdBefore,  setCreatedBefore] = useState('')
  const [readyAfter,     setReadyAfter]    = useState('')
  const [readyBefore,    setReadyBefore]   = useState('')
  const [activeParams,   setActiveParams]  = useState<SearchParams | null>(null)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)

  const { data: members = [] } = trpc.tenants.getMembers.useQuery()
  const memberName = (uid: string | null | undefined) =>
    uid ? (members.find((m) => m.user_id === uid)?.display_name ?? null) : null

  const { data: results, isFetching, isError, error } =
    trpc.orders.search.useQuery(activeParams ?? skipToken)

  const hasAny = !!(query || status || paymentStatus || createdAfter || createdBefore || readyAfter || readyBefore)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setActiveParams({
      query:          query         || undefined,
      status:         (status       || undefined) as OrderStatus | undefined,
      payment_status: (paymentStatus || undefined) as 'paid' | 'unpaid' | 'partial' | undefined,
      created_after:  createdAfter  || undefined,
      created_before: createdBefore || undefined,
      ready_after:    readyAfter    || undefined,
      ready_before:   readyBefore   || undefined,
      limit: 200,
    })
  }

  function handleReset() {
    setQuery(''); setStatus(''); setPaymentStatus('')
    setCreatedAfter(''); setCreatedBefore(''); setReadyAfter(''); setReadyBefore('')
    setActiveParams(null)
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px]">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Search</h1>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 mb-6">

        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name, Phone, or Order #">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Jeremy Creed or ORD-001"
                className={`${inputCls} pl-9`} autoFocus
              />
              {query && (
                <button type="button" onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Payment">
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              <option value="">Any</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Placed After">
            <input type="date" value={createdAfter} onChange={(e) => setCreatedAfter(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Placed Before">
            <input type="date" value={createdBefore} onChange={(e) => setCreatedBefore(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cleaned After">
            <input type="date" value={readyAfter} onChange={(e) => setReadyAfter(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cleaned Before">
            <input type="date" value={readyBefore} onChange={(e) => setReadyBefore(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button type="submit"
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            <Search className="h-4 w-4" /> Search
          </button>
          {hasAny && (
            <button type="button" onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </form>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {activeParams !== null && (
        <>
          {isFetching && (
            <p className="text-sm text-gray-400 text-center py-12">Searching…</p>
          )}

          {!isFetching && isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-semibold text-red-600">Search failed</p>
              <p className="text-xs text-red-400 mt-1">{String((error as unknown as Error)?.message ?? error)}</p>
            </div>
          )}

          {!isFetching && !isError && results?.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
              <p className="text-sm font-medium text-gray-500">No orders found</p>
              <p className="text-xs text-gray-400 mt-1">Try different search terms or filters</p>
            </div>
          )}

          {!isFetching && !isError && results && results.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Order #', 'Placed', 'Due', 'Customer', 'Contact', 'Items', 'Staff', 'Status', 'Notes', 'Payment', 'Total'].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((order, i) => {
                      type Customer = { id: string; first_name: string; last_name: string; phone?: string | null; email?: string | null; address_street?: string | null; address_city?: string | null; order_preferences?: Record<string, string> | null }
                      type Payment  = { id: string; amount: number; method: string; processed_at: string; processed_by: string }
                      type Line     = { id: string; name: string; category: string; quantity: number; unit_label: string; unit_price: number }

                      const c        = order.customer as unknown as Customer | null
                      const payments = (order.payments as unknown as Payment[]) ?? []
                      const lines    = (order.lines    as unknown as Line[])    ?? []
                      const prefs    = formatPrefs(c?.order_preferences as Record<string, string> | null)
                      const summary  = summarizeLines(lines)

                      return (
                        <tr key={order.id}
                          onClick={() => setViewingOrderId(order.id)}
                          className={cn(
                            'cursor-pointer border-b border-gray-100 hover:bg-brand-50/40 transition-colors align-top',
                            i % 2 === 1 && 'bg-gray-50/40'
                          )}>

                          {/* Order # */}
                          <td className="px-3 py-3 font-mono font-bold text-brand-600 whitespace-nowrap">
                            {order.order_number}
                          </td>

                          {/* Placed */}
                          <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                            {fmtDate(order.created_at)}
                          </td>

                          {/* Due */}
                          <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                            {fmtDate(order.due_date)}
                          </td>

                          {/* Customer */}
                          <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">
                            {c ? `${c.first_name} ${c.last_name}` : '—'}
                          </td>

                          {/* Contact */}
                          <td className="px-3 py-3 text-gray-500 min-w-[110px]">
                            {c?.phone && <div>{c.phone}</div>}
                            {c?.address_street && (
                              <div className="text-gray-400 text-[11px] mt-0.5">
                                {[c.address_street, c.address_city].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </td>

                          {/* Items */}
                          <td className="px-3 py-3 text-gray-700 min-w-[110px] max-w-[180px]">
                            {summary}
                          </td>

                          {/* Staff + timestamps */}
                          <td className="px-3 py-3 text-gray-500 min-w-[130px]">
                            {memberName(order.created_by as string | null) && (
                              <div>
                                <span className="font-medium text-gray-700">{memberName(order.created_by as string | null)}</span>
                              </div>
                            )}
                            {(order.ready_at as string | null) && (
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                Cleaned {fmtDateTime(order.ready_at as string)}
                              </div>
                            )}
                            {(order.picked_up_at as string | null) && (
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                Picked up {fmtDateTime(order.picked_up_at as string)}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <Badge variant={STATUS_BADGE[order.status] ?? 'secondary'} className="text-[10px]">
                              {order.status.replace('_', ' ')}
                            </Badge>
                          </td>

                          {/* Notes */}
                          <td className="px-3 py-3 text-gray-500 min-w-[140px] max-w-[200px]">
                            {prefs && <div className="text-[11px]">{prefs}</div>}
                            {order.notes && (
                              <div className={cn('text-[11px] text-gray-400 italic', prefs && 'mt-0.5')}>
                                {order.notes as string}
                              </div>
                            )}
                            {!prefs && !order.notes && <span className="text-gray-300">—</span>}
                          </td>

                          {/* Payment */}
                          <td className="px-3 py-3 min-w-[130px]">
                            {payments.length === 0 ? (
                              <span className="text-amber-500 font-semibold">Unpaid</span>
                            ) : (
                              payments.map((p) => (
                                <div key={p.id} className="mb-1 last:mb-0">
                                  <div className="font-medium text-gray-700">
                                    {METHOD_LABEL[p.method] ?? p.method}
                                  </div>
                                  <div className="text-[11px] text-gray-400">
                                    {fmtDateTime(p.processed_at)}
                                    {memberName(p.processed_by) && (
                                      <span className="ml-1">· {memberName(p.processed_by)}</span>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </td>

                          {/* Total */}
                          <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap text-right">
                            {formatCurrency(order.total_amount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {viewingOrderId && (
        <OrderDetailModal orderId={viewingOrderId} onClose={() => setViewingOrderId(null)} />
      )}
    </div>
  )
}
