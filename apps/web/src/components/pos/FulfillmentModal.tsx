'use client'

import { useState } from 'react'
import { X, Truck, Store, ChevronLeft, ChevronRight } from 'lucide-react'

export type FulfillmentType = 'in_store' | 'delivery' | 'pickup' | 'both'

export interface FulfillmentValue {
  type: FulfillmentType
  date1: string      // yyyy-mm-dd — order/pickup date ("comes in")
  time1: string      // HH:MM or ''  (start; for pickup this is the window start)
  time1End: string   // HH:MM or ''  (pickup window end — only used for truck/window fields)
  date2: string      // yyyy-mm-dd — ready/delivery date ("goes out")
  time2: string
  time2End: string   // delivery window end
}

// Pickup & delivery (truck) fields use a time *window* (start–end); the store-side
// fields (drop-off, ready-by) use a single time.
function isWindow(type: FulfillmentType, field: 'date1' | 'date2') {
  if (field === 'date1') return type === 'pickup' || type === 'both'
  return type === 'delivery' || type === 'both'
}
function addHour(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const TYPE_OPTIONS: { value: FulfillmentType; label: string }[] = [
  { value: 'in_store', label: 'In-Store' },
  { value: 'pickup',   label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'both',     label: 'Pickup & Delivery' },
]

// Labels + icons for the two date fields, which flip based on the type.
function fieldMeta(type: FulfillmentType) {
  const d1 = (type === 'pickup' || type === 'both')
    ? { label: 'Pickup', Icon: Truck }
    : { label: 'Drop-off', Icon: Store }
  const d2 = (type === 'delivery' || type === 'both')
    ? { label: 'Delivery', Icon: Truck }
    : { label: 'Ready by', Icon: Store }
  return { d1, d2 }
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(iso: string, n: number) {
  const d = fromIso(iso); d.setDate(d.getDate() + n); return isoOf(d)
}
function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
}
function fmtChip(iso: string, time: string) {
  if (!iso) return 'Select date'
  const day = fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  return time ? `${day} · ${fmtTime(time)}` : day
}

interface Props {
  initial: FulfillmentValue
  defaultDueDays: number
  onApply: (v: FulfillmentValue) => void
  onClose: () => void
}

export function FulfillmentModal({ initial, defaultDueDays, onApply, onClose }: Props) {
  const today = isoOf(new Date())
  const [type, setType] = useState<FulfillmentType>(initial.type)
  const [date1, setDate1] = useState(initial.date1 || today)
  const [time1, setTime1] = useState(initial.time1)
  const [time1End, setTime1End] = useState(initial.time1End)
  const [date2, setDate2] = useState(initial.date2 || addDays(initial.date1 || today, defaultDueDays))
  const [time2, setTime2] = useState(initial.time2 || '17:00')
  const [time2End, setTime2End] = useState(initial.time2End)
  // Whether the user has manually set date2 — if not, it tracks date1 + defaultDueDays.
  const [date2Touched, setDate2Touched] = useState(!!initial.date2)
  // Focus the field that actually matters: pickup date for pickup types,
  // otherwise the ready/delivery date (drop-off is "now" at the counter).
  const [active, setActive] = useState<'date1' | 'date2'>(isWindow(initial.type, 'date1') ? 'date1' : 'date2')

  const { d1, d2 } = fieldMeta(type)
  const activeIso = active === 'date1' ? date1 : date2
  const [view, setView] = useState(() => {
    const d = activeIso ? fromIso(activeIso) : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const setActiveDate = (iso: string) => {
    if (active === 'date1') {
      setDate1(iso)
      if (!date2Touched) setDate2(addDays(iso, defaultDueDays))
    } else {
      setDate2(iso)
      setDate2Touched(true)
    }
  }

  // Calendar cells (Monday-first to match the design)
  const first = new Date(view.year, view.month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 })
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 })

  const DateBox = ({ id, meta, iso, time }: {
    id: 'date1' | 'date2'; meta: { label: string; Icon: typeof Truck }; iso: string; time: string
  }) => (
    <button
      onClick={() => { setActive(id); if (iso) { const d = fromIso(iso); setView({ year: d.getFullYear(), month: d.getMonth() }) } }}
      className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active === id ? 'border-brand-500 ring-1 ring-brand-300' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <meta.Icon className="h-4 w-4 text-brand-500" /> {meta.label}
      </span>
      <span className={`mt-0.5 block text-sm font-medium ${iso ? 'text-gray-900' : 'text-gray-400'}`}>
        {fmtChip(iso, time)}
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header: type dropdown */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <select value={type} onChange={(e) => setType(e.target.value as FulfillmentType)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-400">
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Two date fields */}
          <div className="flex gap-2">
            <DateBox id="date1" meta={d1} iso={date1} time={time1} />
            <DateBox id="date2" meta={d2} iso={date2} time={time2} />
          </div>

          {/* Calendar for the active field */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <button onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-semibold text-gray-800">{MONTHS[view.month]} {view.year}</span>
              <button onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w, i) => <div key={i} className="py-1 text-[11px] font-medium text-gray-400">{w}</div>)}
              {cells.map((d, i) => {
                if (d == null) return <div key={i} />
                const iso = isoOf(new Date(view.year, view.month, d))
                const isPast = iso < today
                const isSel = iso === activeIso
                return (
                  <button key={i} disabled={isPast} onClick={() => setActiveDate(iso)}
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                      isSel ? 'bg-brand-600 font-semibold text-white'
                        : isPast ? 'cursor-not-allowed text-gray-300'
                        : 'text-gray-700 hover:bg-gray-100'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time for the active field — a window (start–end) for pickup/delivery, single otherwise */}
          {(() => {
            // Drop-off (store-side date1 for in-store/delivery) is "now" — no time field.
            const isDropoff = active === 'date1' && (type === 'in_store' || type === 'delivery')
            if (isDropoff) {
              return <p className="text-xs text-gray-400">Dropped off at the store — no time needed.</p>
            }
            const window = isWindow(type, active)
            const label = active === 'date1' ? d1.label : d2.label
            const start = active === 'date1' ? time1 : time2
            const end = active === 'date1' ? time1End : time2End
            const setStart = (v: string) => {
              if (active === 'date1') { setTime1(v); if (window && !time1End) setTime1End(addHour(v)) }
              else { setTime2(v); if (window && !time2End) setTime2End(addHour(v)) }
            }
            const setEnd = (v: string) => active === 'date1' ? setTime1End(v) : setTime2End(v)
            return (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">{label} {window ? 'window' : 'time'}</label>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400" />
                {window && (
                  <>
                    <span className="text-gray-400">–</span>
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  </>
                )}
              </div>
            )
          })()}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onApply({ type, date1, time1, time1End, date2, time2, time2End })} disabled={!date1 || !date2}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Apply</button>
        </div>
      </div>
    </div>
  )
}
