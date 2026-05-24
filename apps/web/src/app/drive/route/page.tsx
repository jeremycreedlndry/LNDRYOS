'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Menu, ChevronRight, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

function fmtTime(t: string | null | undefined) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
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

  const address = [stop.customer?.address_street, stop.customer?.address_city]
    .filter(Boolean).join(', ')

  const timeLabel = [fmtTime(stop.time_start), fmtTime(stop.time_end)]
    .filter(Boolean).join('–')

  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 bg-white active:bg-gray-50 text-left"
    >
      {/* Type badge */}
      <div className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
        stop.type === 'pickup' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
      )}>
        {stop.type === 'pickup' ? 'P' : 'D'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
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

function RouteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const zoneParam = params.get('zones') ?? ''
  const zoneIds = zoneParam ? zoneParam.split(',').filter(id => id !== 'unassigned') : []
  const today = isoToday()

  const [menuOpen, setMenuOpen] = useState(false)

  const { data: me } = trpc.staff.myRole.useQuery()
  const { data: stops, isLoading, refetch } = trpc.pickupStops.listForDriver.useQuery({
    zone_ids: zoneIds,
    date: today,
  }, { refetchInterval: 30_000 }) // auto-refresh every 30s

  const pastDue = stops?.pastDue ?? []
  const todayStops = stops?.today ?? []
  const currentUserId = me?.userId ?? ''

  const zoneName = zoneParam
    ? `Zones: ${zoneParam.split(',').length}`
    : 'All Zones'

  return (
    <div className="flex flex-col min-h-screen">

      {/* Header */}
      <div className="bg-brand-600 text-white px-4 pt-12 pb-3 safe-top flex items-center gap-3">
        <button onClick={() => setMenuOpen(true)} className="p-1">
          <Menu className="h-6 w-6" />
        </button>
        <button onClick={() => router.push('/drive')} className="flex-1 text-left">
          <span className="font-bold text-base">{zoneName}</span>
          <span className="text-brand-200 text-xs ml-2">▾</span>
        </button>
        <span className="text-xs text-brand-200">
          {new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading stops…</div>
        ) : (
          <>
            {/* Past due */}
            {pastDue.length > 0 && (
              <>
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Past Due</span>
                </div>
                {pastDue.map(stop => (
                  <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                    onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
                ))}
              </>
            )}

            {/* Today */}
            {todayStops.length === 0 && pastDue.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm">No stops for today.</p>
                <button onClick={() => refetch()} className="mt-3 text-brand-600 text-sm font-medium">
                  Refresh
                </button>
              </div>
            ) : (
              todayStops.map(stop => (
                <StopRow key={stop.id} stop={stop as Stop} currentUserId={currentUserId}
                  onPress={() => router.push(`/drive/stop/${stop.id}${zoneParam ? `?zones=${zoneParam}` : ''}`)} />
              ))
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
