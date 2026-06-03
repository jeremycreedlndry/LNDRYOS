'use client'

import { useState } from 'react'
import { Plus, X, ChevronLeft, ChevronRight, MapPin, Phone, Clock, Calendar, Truck, Check, RotateCcw, ArrowUpCircle, ArrowDownCircle, Smartphone, CheckCircle, XCircle, Pencil } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ScheduleModal } from '@/components/pickups/ScheduleModal'
import { CustomerModal } from '@/components/customers/CustomerModal'

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
    photo_url: string | null
    bag_count: number | null
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
      {(stop.status === 'completed' || stop.status === 'skipped') && (
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

  // ── All state first so mutations/queries can reference setters freely ─────
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'stops' | 'requests' | 'schedules'>('stops')
  const [selectedZone, setSelectedZone] = useState<string | undefined>()
  const [dropOffCustomer, setDropOffCustomer] = useState<CustomerStub>(null)
  const [customerModalId, setCustomerModalId] = useState<string | null>(null)
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState({
    scheduled_date: '', time_start: '', time_end: '', notes: '',
    delivery_date: '', delivery_time_start: '', delivery_time_end: '',
  })
  const [skippedOpen, setSkippedOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'pickup' | 'delivery'>('all')

  const { data: zones = [] } = trpc.deliveryZones.list.useQuery()
  const { data: stops = [], isLoading: stopsLoading } = trpc.pickupStops.listByDate.useQuery(
    { date: selectedDate, zone_id: selectedZone }
  )
  // All unapproved customer-app requests across all future dates — shown as an inbox
  const { data: pendingRequests = [] } = trpc.pickupStops.listPendingRequests.useQuery()
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

  const approveStop = trpc.pickupStops.approveStop.useMutation({
    onSuccess: () => {
      utils.pickupStops.listByDate.invalidate()
      utils.pickupStops.listPendingRequests.invalidate()
      toast.success('Pickup request approved')
    },
    onError: (e) => toast.error(e.message),
  })
  const patchStop = trpc.pickupStops.patchStop.useMutation({
    onSuccess: () => { utils.pickupStops.listByDate.invalidate(); utils.pickupStops.listPendingRequests.invalidate(); toast.success('Stop updated'); setEditId(null) },
    onError: (e) => toast.error(e.message),
  })
  // Second instance — patches delivery stop without triggering close/toast (handled by patchStop's onSuccess)
  const patchDeliveryStop = trpc.pickupStops.patchStop.useMutation({
    onError: (e) => toast.error(e.message),
  })

  const declineStop = trpc.pickupStops.declineStop.useMutation({
    onSuccess: () => {
      utils.pickupStops.listByDate.invalidate()
      utils.pickupStops.listPendingRequests.invalidate()
      toast.success('Request declined')
      setDeclineId(null)
      setDeclineReason('')
    },
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

  const { data: customerForModal } = trpc.customers.getById.useQuery(
    { id: customerModalId! },
    { enabled: !!customerModalId }
  )
  // Customer-app requests: source=customer_app AND not yet approved
  const requests   = (stops as (typeof stops[0] & { source?: string; approved_at?: string | null })[])
    .filter((s) => s.source === 'customer_app' && !s.approved_at && s.status !== 'skipped')
  const requestIds = new Set(requests.map((r) => r.id))
  // Approved/staff stops only
  const pickups    = (stops as typeof stops).filter((s) => s.type === 'pickup'  && s.status !== 'skipped' && !requestIds.has(s.id))
  const deliveries = (stops as typeof stops).filter((s) => s.type === 'delivery' && s.status !== 'skipped' && !requestIds.has(s.id))
  const skipped    = (stops as typeof stops).filter((s) => s.status === 'skipped')

  const showPickups    = typeFilter === 'all' || typeFilter === 'pickup'
  const showDeliveries = typeFilter === 'all' || typeFilter === 'delivery'

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
        {([
          { key: 'stops',     label: "Today's Stops" },
          { key: 'requests',  label: 'Requests' },
          { key: 'schedules', label: 'Recurring Schedules' },
        ] as { key: 'stops' | 'requests' | 'schedules'; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={cn('relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {label}
            {key === 'requests' && pendingRequests.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'stops' && (
          <div className="space-y-4 max-w-4xl">
            {/* Type filter */}
            <div className="flex gap-2">
              {([
                { key: 'all',      label: `All · ${(stops as typeof stops).filter(s => s.status !== 'skipped').length}` },
                { key: 'pickup',   label: `↑ Pickups · ${pickups.length}` },
                { key: 'delivery', label: `↓ Deliveries · ${deliveries.length}` },
              ] as { key: 'all' | 'pickup' | 'delivery'; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors',
                    typeFilter === key
                      ? key === 'pickup'   ? 'bg-blue-600 text-white border-blue-600'
                      : key === 'delivery' ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

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

            {showPickups && pickups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 mb-3">
                  <ArrowUpCircle className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-700">Pickups · {pickups.length}</p>
                    <p className="text-xs text-blue-500">Driver collects dirty laundry from customer</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(pickups as Parameters<typeof StopCard>[0]['stop'][]).map((s) => (
                    <StopCard key={s.id} stop={s} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}

            {showDeliveries && deliveries.length > 0 && (
              <div>
                <div className="flex items-center gap-2 rounded-xl bg-purple-50 border border-purple-200 px-4 py-2.5 mb-3">
                  <ArrowDownCircle className="h-5 w-5 text-purple-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-purple-700">Deliveries · {deliveries.length}</p>
                    <p className="text-xs text-purple-500">Driver drops off clean laundry to customer</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(deliveries as Parameters<typeof StopCard>[0]['stop'][]).map((s) => (
                    <StopCard key={s.id} stop={s} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}

            {skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setSkippedOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', skippedOpen && 'rotate-90')} />
                  Skipped · {skipped.length}
                </button>
                {skippedOpen && (
                  <div className="grid gap-2 sm:grid-cols-2 mt-2">
                    {(skipped as Parameters<typeof StopCard>[0]['stop'][]).map((s) => (
                      <StopCard key={s.id} stop={s} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-4 max-w-4xl">
            {pendingRequests.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
                <Smartphone className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">No pending requests</p>
                <p className="text-xs text-gray-400 mt-1">New customer app bookings will appear here for review</p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {pendingRequests.map((s) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const c = s.customer as any
                const name = c
                  ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown'
                  : 'Unknown'
                const address = [c?.address_street, c?.address_city].filter(Boolean).join(', ')
                return (
                  <div key={s.id} className="rounded-xl border border-amber-200 bg-white p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                          {c?.id && (
                            <button
                              onClick={() => setCustomerModalId(c.id)}
                              className="text-gray-400 hover:text-brand-600 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 mt-1 inline-block">
                          <Smartphone className="inline h-3 w-3 mr-0.5" />App Request
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-amber-600">
                          ↑ {fmtDate(s.scheduled_date)}
                          {s.time_start ? ` · ${fmtTime(s.time_start)}${s.time_end ? `–${fmtTime(s.time_end)}` : ''}` : ''}
                        </p>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(s as any).delivery && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            ↓ {fmtDate((s as any).delivery.scheduled_date)}
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(s as any).delivery.time_start ? ` · ${fmtTime((s as any).delivery.time_start)}${(s as any).delivery.time_end ? `–${fmtTime((s as any).delivery.time_end)}` : ''}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      {address && <p className="text-xs text-gray-500"><MapPin className="inline h-3 w-3 mr-0.5" />{address}</p>}
                      {c?.phone && <p className="text-xs text-gray-500"><Phone className="inline h-3 w-3 mr-0.5" />{c.phone}</p>}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(s as any).order?.notes && <p className="text-xs text-gray-500 mt-1">{(s as any).order.notes}</p>}
                      {s.notes && <p className="text-xs text-gray-400 mt-0.5 italic">"{s.notes}"</p>}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(s as any).driver_notes && <p className="text-xs text-amber-700 mt-0.5 italic">Driver: "{(s as any).driver_notes}"</p>}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(s as any).photo_url && (
                        <a href={(s as any).photo_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={(s as any).photo_url} alt="Proof of delivery" className="rounded-lg max-h-32 object-cover border border-gray-200" />
                          <p className="text-[10px] text-gray-400 mt-0.5">📷 Proof of delivery</p>
                        </a>
                      )}
                    </div>
                    {editId === s.id ? (
                      <div className="space-y-3 pt-1">
                        {/* Pickup section */}
                        <div>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1.5">↑ Pickup</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="col-span-2">
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date</label>
                              <input
                                type="date"
                                value={editFields.scheduled_date}
                                onChange={(e) => setEditFields((f) => ({ ...f, scheduled_date: e.target.value }))}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">From</label>
                              <input
                                type="time"
                                value={editFields.time_start}
                                onChange={(e) => setEditFields((f) => ({ ...f, time_start: e.target.value }))}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">To</label>
                              <input
                                type="time"
                                value={editFields.time_end}
                                onChange={(e) => setEditFields((f) => ({ ...f, time_end: e.target.value }))}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                              />
                            </div>
                          </div>
                        </div>
                        {/* Delivery section */}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(s as any).delivery && (
                          <div>
                            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide mb-1.5">↓ Delivery</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div className="col-span-2">
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date</label>
                                <input
                                  type="date"
                                  value={editFields.delivery_date}
                                  onChange={(e) => setEditFields((f) => ({ ...f, delivery_date: e.target.value }))}
                                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">From</label>
                                <input
                                  type="time"
                                  value={editFields.delivery_time_start}
                                  onChange={(e) => setEditFields((f) => ({ ...f, delivery_time_start: e.target.value }))}
                                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">To</label>
                                <input
                                  type="time"
                                  value={editFields.delivery_time_end}
                                  onChange={(e) => setEditFields((f) => ({ ...f, delivery_time_end: e.target.value }))}
                                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Notes */}
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Notes</label>
                          <textarea
                            value={editFields.notes}
                            onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-300 resize-none"
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditId(null)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const deliveryId = (s as any).delivery?.id
                              if (deliveryId) {
                                await patchDeliveryStop.mutateAsync({
                                  id: deliveryId,
                                  scheduled_date: editFields.delivery_date || undefined,
                                  time_start: editFields.delivery_time_start || null,
                                  time_end: editFields.delivery_time_end || null,
                                })
                              }
                              patchStop.mutate({ id: s.id, scheduled_date: editFields.scheduled_date || undefined, time_start: editFields.time_start || null, time_end: editFields.time_end || null, notes: editFields.notes || null })
                            }}
                            disabled={patchStop.isPending || patchDeliveryStop.isPending}
                            className="flex-1 rounded-lg border border-brand-200 bg-brand-50 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : declineId === s.id ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          placeholder="Reason for declining (required)…"
                          rows={2}
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-300 resize-none"
                        />
                        <div className="flex gap-1.5">
                          <button onClick={() => { setDeclineId(null); setDeclineReason('') }}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                            Cancel
                          </button>
                          <button
                            onClick={() => declineStop.mutate({ id: s.id, reason: declineReason })}
                            disabled={!declineReason.trim() || declineStop.isPending}
                            className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">
                            <XCircle className="inline h-3 w-3 mr-1" />Send Decline
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={() => approveStop.mutate({ id: s.id })}
                          disabled={approveStop.isPending}
                          className="flex-1 rounded-lg border border-green-200 bg-green-50 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50">
                          <CheckCircle className="inline h-3 w-3 mr-1" />Approve
                        </button>
                        <button
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onClick={() => { setEditId(s.id); setEditFields({ scheduled_date: (s as any).scheduled_date ?? '', time_start: s.time_start ?? '', time_end: s.time_end ?? '', notes: s.notes ?? '', delivery_date: (s as any).delivery?.scheduled_date ?? '', delivery_time_start: (s as any).delivery?.time_start ?? '', delivery_time_end: (s as any).delivery?.time_end ?? '' }) }}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          Edit
                        </button>
                        <button
                          onClick={() => { setDeclineId(s.id); setDeclineReason('') }}
                          disabled={declineStop.isPending}
                          className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">
                          <XCircle className="inline h-3 w-3 mr-1" />Decline
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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

      {customerModalId && customerForModal && (
        <CustomerModal
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customer={customerForModal as any}
          onClose={() => setCustomerModalId(null)}
          onSaved={() => { setCustomerModalId(null); utils.pickupStops.listPendingRequests.invalidate() }}
        />
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
