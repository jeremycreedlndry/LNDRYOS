'use client'

import { useState } from 'react'
import { Plus, X, ChevronLeft, ChevronRight, MapPin, Phone, Clock, Truck, Check, RotateCcw } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ScheduleModal } from '@/components/pickups/ScheduleModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const FREQ_LABELS: Record<string, string> = { once: 'One-time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  en_route:  'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-600',
  skipped:   'bg-gray-100 text-gray-400',
}

// ─── Drop-off prompt ──────────────────────────────────────────────────────────

function DropOffPrompt({
  customer,
  date,
  onConfirm,
  onDismiss,
}: {
  customer: { id: string; first_name: string; last_name: string } | null
  date: string
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Also pick up?</h2>
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-gray-600">
          Pick up new laundry from{' '}
          <span className="font-medium">{customer?.first_name} {customer?.last_name}</span>{' '}
          while delivering today ({fmtDate(date)})?
        </p>
        <div className="flex gap-2">
          <button onClick={onDismiss}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            No
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Yes, create pickup
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stop card ────────────────────────────────────────────────────────────────

function StopCard({ stop, onStatusChange }: {
  stop: {
    id: string; type: string; status: string; time_start: string | null; time_end: string | null
    customer: { id: string; first_name: string; last_name: string; phone: string | null; address_street: string | null; address_city: string | null; driver_instructions: string | null } | null
    zone: { name: string; color: string } | null
    driver_notes: string | null
  }
  onStatusChange: (id: string, status: string, customer: typeof stop['customer']) => void
}) {
  const c = stop.customer
  const name = c ? `${c.first_name} ${c.last_name}` : 'Unknown'
  const address = [c?.address_street, c?.address_city].filter(Boolean).join(', ')

  return (
    <div className={cn('rounded-xl border bg-white p-3.5 space-y-2',
      stop.status === 'completed' ? 'border-green-200 opacity-60' :
      stop.status === 'en_route'  ? 'border-blue-200' : 'border-gray-200')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
            stop.type === 'pickup' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
            {stop.type === 'pickup' ? '↑ Pickup' : '↓ Delivery'}
          </span>
          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', STATUS_STYLE[stop.status] ?? '')}>
            {stop.status.replace('_', ' ')}
          </span>
        </div>
        {stop.time_start && (
          <span className="text-xs text-gray-500 shrink-0">
            <Clock className="inline h-3 w-3 mr-0.5" />
            {fmtTime(stop.time_start)}{stop.time_end ? `–${fmtTime(stop.time_end)}` : ''}
          </span>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        {address && <p className="text-xs text-gray-500"><MapPin className="inline h-3 w-3 mr-0.5" />{address}</p>}
        {c?.phone && <p className="text-xs text-gray-500"><Phone className="inline h-3 w-3 mr-0.5" />{c.phone}</p>}
        {c?.driver_instructions && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">{c.driver_instructions}</p>
        )}
      </div>

      {stop.status !== 'completed' && stop.status !== 'skipped' && (
        <div className="flex gap-1.5 pt-1">
          {stop.status === 'pending' && (
            <button onClick={() => onStatusChange(stop.id, 'en_route', stop.customer)}
              className="flex-1 rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
              <Truck className="inline h-3 w-3 mr-1" />En Route
            </button>
          )}
          <button onClick={() => onStatusChange(stop.id, 'completed', stop.customer)}
            className="flex-1 rounded-lg border border-green-200 bg-green-50 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100">
            <Check className="inline h-3 w-3 mr-1" />{stop.type === 'delivery' ? 'Delivered' : 'Picked Up'}
          </button>
          <button onClick={() => onStatusChange(stop.id, 'skipped', stop.customer)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
            Skip
          </button>
        </div>
      )}
      {stop.status === 'completed' && (
        <button onClick={() => onStatusChange(stop.id, 'pending', stop.customer)}
          className="text-xs text-gray-400 hover:text-gray-600">
          <RotateCcw className="inline h-3 w-3 mr-1" />Undo
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type CustomerStub = { id: string; first_name: string; last_name: string } | null

export default function PickupsPage() {
  const utils = trpc.useUtils()
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'stops' | 'schedules'>('stops')
  const [selectedZone, setSelectedZone] = useState<string | undefined>()

  // Drop-off prompt state
  const [dropOffCustomer, setDropOffCustomer] = useState<CustomerStub>(null)

  const { data: zones = [] } = trpc.deliveryZones.list.useQuery()
  const { data: stops = [], isLoading: stopsLoading } = trpc.pickupStops.listByDate.useQuery(
    { date: selectedDate, zone_id: selectedZone }
  )
  const { data: schedules = [], isLoading: schedulesLoading } = trpc.pickupSchedules.list.useQuery()
  const { data: staff = [] } = trpc.staff.list.useQuery()

  const updateStatus = trpc.pickupStops.updateStatus.useMutation({
    onSuccess: () => utils.pickupStops.listByDate.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const createPickup = trpc.orders.createPickup.useMutation({
    onSuccess: () => utils.orders.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const createOneOff = trpc.pickupStops.createOneOff.useMutation({
    onSuccess: () => utils.pickupStops.listByDate.invalidate(),
    onError: (e) => toast.error(e.message),
  })

const assignDriver = trpc.pickupStops.assignDriver.useMutation({
    onSuccess: () => utils.pickupStops.listByDate.invalidate(),
    onError: (e) => toast.error(e.message),
  })
  const cancelSchedule = trpc.pickupSchedules.cancel.useMutation({
    onSuccess: () => { utils.pickupSchedules.list.invalidate(); toast.success('Schedule cancelled') },
    onError: (e) => toast.error(e.message),
  })

  type StopCustomer = { id: string; first_name: string; last_name: string; phone: string | null; address_street: string | null; address_city: string | null; driver_instructions: string | null } | null

  const handleStatusChange = (id: string, status: string, customer: StopCustomer) => {
    const validStatus = status as 'pending' | 'en_route' | 'completed' | 'failed' | 'skipped'
    // For completing a delivery stop, prompt for a simultaneous pickup (drop-off)
    const stop = (stops as { id: string; type: string }[]).find((s) => s.id === id)
    if (validStatus === 'completed' && stop?.type === 'delivery') {
      updateStatus.mutate({ id, status: validStatus }, {
        onSuccess: () => {
          utils.pickupStops.listByDate.invalidate()
          if (customer) setDropOffCustomer(customer)
        },
      })
      return
    }
    updateStatus.mutate({ id, status: validStatus })
  }

  const pickups    = (stops as typeof stops).filter((s) => s.type === 'pickup')
  const deliveries = (stops as typeof stops).filter((s) => s.type === 'delivery')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Pickups & Deliveries</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Add Schedule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 bg-white px-6 shrink-0">
        {(['stops', 'schedules'] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {t === 'stops' ? "Today's Stops" : 'Recurring Schedules'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'stops' && (
          <div className="space-y-4 max-w-4xl">
            {/* Date nav + zone filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white">
                <button onClick={() => setSelectedDate(isoDate(addDays(new Date(selectedDate + 'T12:00:00'), -1)))}
                  className="p-2 text-gray-400 hover:text-gray-600"><ChevronLeft className="h-4 w-4" /></button>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-2 py-1.5 text-sm font-medium text-gray-900 bg-transparent border-0 focus:outline-none" />
                <button onClick={() => setSelectedDate(isoDate(addDays(new Date(selectedDate + 'T12:00:00'), 1)))}
                  className="p-2 text-gray-400 hover:text-gray-600"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setSelectedZone(undefined)}
                  className={cn('rounded-full px-3 py-1 text-xs font-medium border',
                    !selectedZone ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
                  All zones
                </button>
                {(zones as { id: string; name: string; color: string }[]).map((z) => (
                  <button key={z.id} onClick={() => setSelectedZone(selectedZone === z.id ? undefined : z.id)}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                      selectedZone === z.id ? 'text-white border-transparent' : 'bg-white text-gray-600 hover:bg-gray-50')}
                    style={selectedZone === z.id ? { background: z.color, borderColor: z.color } : { borderColor: z.color, color: z.color }}>
                    {z.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Zone driver assignment */}
            {zones.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                {(zones as { id: string; name: string; color: string }[])
                  .filter((z) => !selectedZone || z.id === selectedZone)
                  .map((z) => (
                    <div key={z.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: z.color }} />
                      <span className="text-xs font-medium text-gray-700">{z.name}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => assignDriver.mutate({ zone_id: z.id, date: selectedDate, driver_user_id: e.target.value || null })}
                        className="text-xs text-gray-600 border-0 bg-transparent focus:outline-none cursor-pointer">
                        <option value="">Unassigned</option>
                        {(staff as { user_id: string; display_name: string }[]).map((m) => (
                          <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            )}

            {stopsLoading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}
            {!stopsLoading && stops.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
                <p className="text-sm text-gray-400">No stops for {fmtDate(selectedDate)}</p>
              </div>
            )}

            {pickups.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Pickups · {pickups.length}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(pickups as Parameters<typeof StopCard>[0]['stop'][]).map((s) => (
                    <StopCard key={s.id} stop={s} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}

            {deliveries.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Deliveries · {deliveries.length}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(deliveries as Parameters<typeof StopCard>[0]['stop'][]).map((s) => (
                    <StopCard key={s.id} stop={s} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedules' && (
          <div className="max-w-2xl space-y-2">
            {schedulesLoading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}
            {!schedulesLoading && schedules.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
                <p className="text-sm text-gray-400">No active schedules. Add one to get started.</p>
              </div>
            )}
            {(schedules as {
              id: string; frequency: string; day_of_week: number | null; next_pickup_date: string | null
              end_date: string | null; pickup_start: string | null; pickup_end: string | null
              status: string; notes: string | null
              customer: { first_name: string; last_name: string; phone: string | null; address_street: string | null } | null
              zone: { name: string; color: string } | null
            }[]).map((s) => {
              const c = s.customer
              return (
                <div key={s.id} className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{c ? `${c.first_name} ${c.last_name}` : '—'}</p>
                      {s.zone && (
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 text-white"
                          style={{ background: s.zone.color }}>{s.zone.name}</span>
                      )}
                    </div>
                    {c?.address_street && <p className="text-xs text-gray-500">{c.address_street}</p>}
                    <p className="text-xs text-gray-500">
                      {FREQ_LABELS[s.frequency]}{s.day_of_week != null ? ` · ${DAY_NAMES[s.day_of_week]}` : ''}
                      {s.pickup_start ? ` · ${fmtTime(s.pickup_start)}${s.pickup_end ? `–${fmtTime(s.pickup_end)}` : ''}` : ''}
                    </p>
                    {s.next_pickup_date && <p className="text-xs text-brand-600">Next: {fmtDate(s.next_pickup_date)}</p>}
                    {s.end_date && <p className="text-xs text-gray-400">Ends: {fmtDate(s.end_date)}</p>}
                  </div>
                  <button onClick={() => cancelSchedule.mutate({ id: s.id })}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Cancel
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <ScheduleModal onClose={() => setShowModal(false)} onSaved={() => setShowModal(false)} />
      )}

      {dropOffCustomer && (
        <DropOffPrompt
          customer={dropOffCustomer}
          date={selectedDate}
          onConfirm={() => {
            if (!dropOffCustomer) return
            // Create a pending order for detailing later
            createPickup.mutate(
              { customer_id: dropOffCustomer.id, scheduled_date: selectedDate, skip_stop: true },
              {
                onSuccess: (order) => {
                  // Record the pickup as already completed — driver just collected it
                  createOneOff.mutate({
                    customer_id: dropOffCustomer.id,
                    type: 'pickup',
                    scheduled_date: selectedDate,
                    order_id: order.id as string,
                    status: 'completed',
                  })
                  setDropOffCustomer(null)
                },
              }
            )
          }}
          onDismiss={() => setDropOffCustomer(null)}
        />
      )}
    </div>
  )
}
