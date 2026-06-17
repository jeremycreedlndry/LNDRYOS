'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Menu, ChevronRight, AlertTriangle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

function fmtTime(t: string | null | undefined) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function isoOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDateLabel(iso: string): string {
  const today = isoToday()
  const tomorrow = isoOffset(1)
  if (iso === today) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

type Stop = {
  id: string
  type: string
  status: string
  scheduled_date: string
  time_start: string | null
  time_end: string | null
  driver_user_id: string | null
  claimed_at: string | null
  sequence_order: number
  customer: {
    id: string
    first_name: string
    last_name: string
    address_street: string | null
    address_city: string | null
  } | null
  zone: { name: string; color: string } | null
  order: { order_number: string } | null
}

function StopRow({ stop, currentUserId, onPress }: {
  stop: Stop
  currentUserId: string
  onPress: () => void
}) {
  const isMine = stop.driver_user_id === currentUserId
  const isTaken = !!stop.driver_user_id && !isMine
  const isComplete = stop.status === 'completed'
  const isPastDue = stop.scheduled_date < isoToday()
  const isPickup = stop.type === 'pickup'

  const address = [stop.customer?.address_street, stop.customer?.address_city]
    .filter(Boolean).join(', ')

  const timeLabel = [fmtTime(stop.time_start), fmtTime(stop.time_end)]
    .filter(Boolean).join('–')

  return (
    <button
      onClick={onPress}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 bg-white active:bg-gray-50 text-left',
        'border-l-4',
        isPickup ? 'border-l-green-500' : 'border-l-purple-500'
      )}
    >
      {/* Type icon */}
      <div className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
        isPickup ? 'bg-green-100' : 'bg-purple-100'
      )}>
        {isPickup
          ? <ArrowUpCircle className="h-6 w-6 text-green-600" />
          : <ArrowDownCircle className="h-6 w-6 text-purple-600" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
            isPickup ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
          )}>
            {isPickup ? '↑ Pickup' : '↓ Delivery'}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {stop.order?.order_number ?? '—'}
          </span>
          {isComplete && (
            <span className="text-xs font-semibold text-green-600">Complete</span>
          )}
          {isTaken && (
            <span className="text-xs font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Taken</span>
          )}
          {isMine && stop.status === 'en_route' && (
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">En Route</span>
          )}
          {isPastDue && !isComplete && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-gray-800 font-medium truncate">
          {stop.customer?.first_name} {stop.customer?.last_name}
        </p>
        <p className="text-xs text-gray-400 truncate">{address}</p>
      </div>

      {/* Time + chevron */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {timeLabel && <span className="text-xs text-gray-500">{timeLabel}</span>}
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  )
}

type TypeFilter = 'all' | 'pickup' | 'delivery'

function RouteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const zoneParam = params.get('zones') ?? ''
  const zoneIds = zoneParam ? zoneParam.split(',').filter(id => id !== 'unassigned') : []
  const today = isoToday()
  const tomorrow = isoOffset(1)

  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(today)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const { data: me } = trpc.staff.myRole.useQuery()
  const { data: stops, isLoading, refetch } = trpc.pickupStops.listForDriver.useQuery({
    zone_ids: zoneIds,
    date: selectedDate,
  }, { refetchInterval: 30_000 })

  const pastDue = stops?.pastDue ?? []
  const allDateStops = stops?.today ?? []
  const currentUserId = me?.userId ?? ''

  // Filter by type
  const dateStops = typeFilter === 'all'
    ? allDateStops
    : allDateStops.filter(s => s.type === typeFilter)

  const pickupCount  = allDateStops.filter(s => s.type === 'pickup').length
  const deliveryCount = allDateStops.filter(s => s.type === 'delivery').length

  const zoneName = zoneParam
    ? `Zones: ${zoneParam.split(',').length}`
    : 'All Zones'

  return (
    <div className="flex flex-col min-h-screen">

      {/* Header */}
      <div className="bg-brand-600 text-white px-4 pt-12 pb-3 safe-top">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setMenuOpen(true)} className="p-1">
            <Menu className="h-6 w-6" />
          </button>
          <button onClick={() => router.push('/drive')} className="flex-1 text-left">
            <span className="font-bold text-base">{zoneName}</span>
            <span className="text-brand-200 text-xs ml-2">▾</span>
          </button>
          <span className="text-xs text-brand-200">{fmtDateLabel(selectedDate)}</span>
        </div>
        {/* Date selector */}
        <div className="flex items-center gap-2 mb-3">
          {/* Quick pills */}
          {[
            { label: 'Past Due', value: isoOffset(-1) },
            { label: 'Today', value: today },
            { label: 'Tomorrow', value: tomorrow },
          ].map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setSelectedDate(value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                selectedDate === value ? 'bg-white text-brand-700' : 'bg-brand-500 text-white'
              )}
            >
              {label}
              {label === 'Past Due' && pastDue.length > 0 && selectedDate >= today && (
                <span className="ml-1 bg-amber-400 text-amber-900 rounded-full px-1.5 text-[10px]">
                  {pastDue.length}
                </span>
              )}
            </button>
          ))}
          {/* Full date picker */}
          <input
            type="date"
            value={selectedDate}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            className="flex-1 min-w-0 rounded-full bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 border-none focus:outline-none focus:ring-2 focus:ring-white [color-scheme:dark]"
          />
        </div>
        {/* Type filter pills */}
        <div className="flex gap-2">
          {([
            { key: 'all',      label: `All · ${allDateStops.length}` },
            { key: 'pickup',   label: `↑ Pickups · ${pickupCount}` },
            { key: 'delivery', label: `↓ Deliveries · ${deliveryCount}` },
          ] as { key: TypeFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                typeFilter === key
                  ? key === 'pickup'   ? 'bg-blue-400 text-white'
                  : key === 'delivery' ? 'bg-purple-400 text-white'
                  : 'bg-white text-brand-700'
                  : 'bg-brand-500 text-white opacity-70'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading stops…</div>
        ) : (
          <>
            {/* Past due section — only show when viewing today */}
            {selectedDate === today && pastDue.length > 0 && (
              <>
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Past Due</span>
                </div>
                {pastDue
                  .filter(s => typeFilter === 'all' || s.type === typeFilter)
                  .map(stop => (
                    <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                      onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
                  ))}
              </>
            )}

            {/* Selected date stops */}
            {dateStops.length === 0 && (selectedDate !== today || pastDue.length === 0) ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm">No {typeFilter !== 'all' ? typeFilter + 's' : 'stops'} for {fmtDateLabel(selectedDate).toLowerCase()}.</p>
                <button onClick={() => refetch()} className="mt-3 text-brand-600 text-sm font-medium">
                  Refresh
                </button>
              </div>
            ) : (
              <>
                {/* Split into pickups section then deliveries section */}
                {typeFilter === 'all' ? (
                  <>
                    {/* Pickups section */}
                    {allDateStops.filter(s => s.type === 'pickup').length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                          <ArrowUpCircle className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                            Pickups · {allDateStops.filter(s => s.type === 'pickup').length}
                          </span>
                          <span className="text-xs text-blue-400 ml-1">collecting laundry</span>
                        </div>
                        {allDateStops.filter(s => s.type === 'pickup').map(stop => (
                          <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                            onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
                        ))}
                      </>
                    )}
                    {/* Deliveries section */}
                    {allDateStops.filter(s => s.type === 'delivery').length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                          <ArrowDownCircle className="h-3.5 w-3.5 text-purple-600" />
                          <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                            Deliveries · {allDateStops.filter(s => s.type === 'delivery').length}
                          </span>
                          <span className="text-xs text-purple-400 ml-1">dropping off clean laundry</span>
                        </div>
                        {allDateStops.filter(s => s.type === 'delivery').map(stop => (
                          <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                            onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
                        ))}
                      </>
                    )}
                    {allDateStops.length === 0 && (selectedDate !== today || pastDue.length === 0) && (
                      <div className="p-12 text-center">
                        <p className="text-gray-400 text-sm">No stops for {fmtDateLabel(selectedDate).toLowerCase()}.</p>
                        <button onClick={() => refetch()} className="mt-3 text-brand-600 text-sm font-medium">Refresh</button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {dateStops.length > 0 && (
                      <div className={cn(
                        'px-4 py-2 border-b flex items-center gap-2',
                        typeFilter === 'pickup' ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'
                      )}>
                        {typeFilter === 'pickup'
                          ? <ArrowUpCircle className="h-3.5 w-3.5 text-blue-600" />
                          : <ArrowDownCircle className="h-3.5 w-3.5 text-purple-600" />
                        }
                        <span className={cn(
                          'text-xs font-bold uppercase tracking-wide',
                          typeFilter === 'pickup' ? 'text-blue-700' : 'text-purple-700'
                        )}>
                          {typeFilter === 'pickup' ? 'Pickups' : 'Deliveries'} · {dateStops.length}
                        </span>
                      </div>
                    )}
                    {dateStops.map(stop => (
                      <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                        onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Slide-out menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-brand-600 flex flex-col pt-12 pb-8">
            <div className="px-5 pb-6 border-b border-brand-500">
              <p className="text-white font-bold text-lg">LNDRYOS</p>
              <p className="text-brand-200 text-xs">Driver App</p>
            </div>
            <nav className="flex-1 px-4 pt-4 space-y-1">
              {[
                { label: 'Route', href: `/drive/route${zoneParam ? `?zones=${zoneParam}` : ''}` },
                { label: 'Past Due', action: () => { setMenuOpen(false) } },
                { label: 'Change Zones', href: '/drive' },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => { setMenuOpen(false); if (item.href) router.push(item.href); item.action?.() }}
                  className="w-full text-left px-3 py-3 rounded-xl text-white font-medium hover:bg-brand-500"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="px-4">
              <button
                onClick={() => { setMenuOpen(false); router.push('/') }}
                className="w-full text-left px-3 py-3 rounded-xl text-brand-200 font-medium"
              >
                ← Back to Admin
              </button>
            </div>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}
    </div>
  )
}

export default function RoutePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>}>
      <RouteInner />
    </Suspense>
  )
}
