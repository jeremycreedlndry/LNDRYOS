'use client'

import { useState, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { Clock, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

function durationMinutes(inIso: string, outIso: string | null): number {
  if (!outIso) return Math.floor((Date.now() - new Date(inIso).getTime()) / 60_000)
  return Math.floor((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60_000)
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}

// ─── Staff Hours Report ───────────────────────────────────────────────────────

export default function ReportsPage() {
  const today = toLocalDateString(new Date())
  // Default: current week (Mon → today)
  const monday = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1 - day)
    d.setDate(d.getDate() + diff)
    return toLocalDateString(d)
  }, [])

  const [dateFrom, setDateFrom] = useState(monday)
  const [dateTo,   setDateTo]   = useState(today)
  const [filterUserId, setFilterUserId] = useState<string>('all')

  const { data: entries = [], isLoading } = trpc.staff.timeEntries.useQuery(
    { date_from: dateFrom, date_to: dateTo },
    { staleTime: 30_000 },
  )

  const { data: staffList = [] } = trpc.staff.list.useQuery()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Entry = typeof entries[number] & { member?: any }

  const filtered: Entry[] = filterUserId === 'all'
    ? entries
    : entries.filter((e) => e.user_id === filterUserId)

  // Group by staff member for the summary row
  const byStaff = useMemo(() => {
    const map = new Map<string, { name: string; totalMin: number; shifts: number }>()
    for (const e of filtered) {
      const mins = durationMinutes(e.clocked_in_at, e.clocked_out_at)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = (e as any).member
      const name = member?.display_name ?? member?.email ?? e.user_id
      const existing = map.get(e.user_id) ?? { name, totalMin: 0, shifts: 0 }
      map.set(e.user_id, { name, totalMin: existing.totalMin + mins, shifts: existing.shifts + 1 })
    }
    return [...map.values()].sort((a, b) => b.totalMin - a.totalMin)
  }, [filtered])

  const totalMinutes = byStaff.reduce((sum, s) => sum + s.totalMin, 0)

  // CSV export
  const handleExport = () => {
    const rows = [
      ['Staff', 'Clock In', 'Clock Out', 'Duration (hrs)', 'Status'],
      ...filtered.map((e) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const member = (e as any).member
        const name = member?.display_name ?? member?.email ?? e.user_id
        const mins = durationMinutes(e.clocked_in_at, e.clocked_out_at)
        return [
          name,
          formatDateTime(e.clocked_in_at),
          e.clocked_out_at ? formatDateTime(e.clocked_out_at) : 'Active',
          formatDecimalHours(mins),
          e.clocked_out_at ? 'Complete' : 'Active',
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hours_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Staff Hours ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Staff Hours</h2>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
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
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Staff</label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-brand-400 focus:outline-none"
              >
                <option value="all">All staff</option>
                {staffList
                  .filter((s) => s.role === 'staff')
                  .map((s) => (
                    <option key={s.id} value={s.user_id ?? s.id}>
                      {s.display_name ?? s.email}
                    </option>
                  ))}
              </select>
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
                disabled={filtered.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {byStaff.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[140px]">
                <p className="text-xs text-gray-500 mb-0.5">Total hours</p>
                <p className="text-2xl font-bold text-gray-900">{formatDuration(totalMinutes)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[140px]">
                <p className="text-xs text-gray-500 mb-0.5">Shifts</p>
                <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
              </div>
              {byStaff.length > 1 && byStaff.map((s) => (
                <div key={s.name} className="rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[140px]">
                  <p className="text-xs text-gray-500 mb-0.5 truncate max-w-[160px]">{s.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{formatDuration(s.totalMin)}</p>
                  <p className="text-[10px] text-gray-400">{s.shifts} shift{s.shifts !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          )}

          {/* Entries table */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {isLoading ? (
              <p className="text-center text-sm text-gray-400 py-12">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">No entries for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Clock In</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Clock Out</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((e) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const member = (e as any).member
                    const name = member?.display_name ?? member?.email ?? 'Unknown'
                    const mins = durationMinutes(e.clocked_in_at, e.clocked_out_at)
                    const isActive = !e.clocked_out_at

                    return (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateTime(e.clocked_in_at)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            formatDateTime(e.clocked_out_at!)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {formatDuration(mins)}
                          <span className="text-gray-400 text-xs ml-1">({formatDecimalHours(mins)}h)</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500',
                          )}>
                            {isActive ? 'On shift' : 'Complete'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Totals footer */}
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Total — {filtered.length} shift{filtered.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                        {formatDuration(totalMinutes)}
                        <span className="text-gray-500 text-xs ml-1 font-normal">({formatDecimalHours(totalMinutes)}h)</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
