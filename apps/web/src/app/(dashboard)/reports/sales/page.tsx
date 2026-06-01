'use client'

import { useState, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { DollarSign, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequirePermission } from '@/components/layout/RequirePermission'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  return date.toLocaleDateString('en-CA')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

// ─── Sales Report ─────────────────────────────────────────────────────────────

function SalesReportContent() {
  const today = toLocalDateString(new Date())
  const monday = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1 - day)
    d.setDate(d.getDate() + diff)
    return toLocalDateString(d)
  }, [])

  const [dateFrom, setDateFrom] = useState(monday)
  const [dateTo,   setDateTo]   = useState(today)

  const { data: orders = [], isLoading } = trpc.orders.salesReport.useQuery(
    { date_from: dateFrom, date_to: dateTo },
    { staleTime: 30_000 },
  )

  // Summary stats
  const totalRevenue  = useMemo(() => orders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0), [orders])
  const totalCollected = useMemo(() => orders.reduce((sum, o) => sum + (o.paid_amount ?? 0), 0), [orders])
  const totalOutstanding = totalRevenue - totalCollected

  const handleExport = () => {
    const rows = [
      ['Order #', 'Date', 'Customer', 'Status', 'Payment', 'Total', 'Collected'],
      ...orders.map((o) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cust = (o as any).customer
        const customerName = (o.customer_name
          ?? (cust ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim() : ''))
          || '—'
        return [
          o.order_number ?? o.id.slice(0, 8),
          formatDateTime(o.created_at),
          customerName,
          o.status,
          o.payment_status,
          formatCurrency(o.total_amount ?? 0),
          formatCurrency(o.paid_amount ?? 0),
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-bold text-gray-900">Sales</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-brand-400 focus:outline-none"
            />
          </div>

          {/* Quick range shortcuts */}
          <div className="flex gap-1.5 ml-auto">
            {[
              { label: 'This week', from: monday, to: today },
              {
                label: 'Last 7d',
                from: toLocalDateString(new Date(Date.now() - 6 * 86_400_000)),
                to: today,
              },
              {
                label: 'This month',
                from: toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
                to: today,
              },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => { setDateFrom(s.from); setDateTo(s.to) }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  dateFrom === s.from && dateTo === s.to
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={handleExport}
              disabled={orders.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {orders.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[140px]">
              <p className="text-xs text-gray-500 mb-0.5">Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[160px]">
              <p className="text-xs text-gray-500 mb-0.5">Total revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[160px]">
              <p className="text-xs text-gray-500 mb-0.5">Collected</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totalCollected)}</p>
            </div>
            {totalOutstanding > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 min-w-[160px]">
                <p className="text-xs text-amber-600 mb-0.5">Outstanding</p>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalOutstanding)}</p>
              </div>
            )}
          </div>
        )}

        {/* Orders table */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {isLoading ? (
            <p className="text-center text-sm text-gray-400 py-12">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">No orders for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cust = (o as any).customer
                  const customerName = (o.customer_name
                    ?? (cust ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim() : ''))
                    || '—'
                  const isPaid = o.payment_status === 'paid'
                  const isPartial = o.payment_status === 'partial'

                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-700 font-medium">
                        #{o.order_number ?? o.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-3 text-gray-900">{customerName}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                          o.status === 'ready'     ? 'bg-green-100 text-green-700' :
                          o.status === 'complete'  ? 'bg-gray-100 text-gray-500' :
                          o.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                                                     'bg-blue-100 text-blue-700',
                        )}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">
                        {formatCurrency(o.total_amount ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-mono',
                          isPaid    ? 'text-green-700' :
                          isPartial ? 'text-amber-600' :
                                      'text-gray-400',
                        )}>
                          {formatCurrency(o.paid_amount ?? 0)}
                        </span>
                        {!isPaid && (
                          <span className={cn(
                            'ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            isPartial ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500',
                          )}>
                            {isPartial ? 'Partial' : 'Unpaid'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {orders.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Total — {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                      {formatCurrency(totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                      {formatCurrency(totalCollected)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SalesReportPage() {
  return (
    <RequirePermission permission="reports">
      <SalesReportContent />
    </RequirePermission>
  )
}
