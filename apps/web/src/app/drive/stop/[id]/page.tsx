'use client'

import { useState, Suspense, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Phone, Navigation, AlertTriangle, Camera,
  Package, CheckCircle, XCircle, ChevronRight, User, MinusCircle
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

function fmtTime(t: string | null | undefined) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

function formatPhone(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return phone
}

function parsePrefs(prefs: unknown): Array<{ label: string; value: string }> {
  if (!prefs || typeof prefs !== 'object') return []
  return Object.entries(prefs as Record<string, string>).map(([k, v]) => ({
    label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: v,
  }))
}

function mapsUrl(stop: {
  customer: {
    address_street: string | null
    address_apt?: string | null
    address_city: string | null
    address_postal_code?: string | null
    lat?: number | null
    lng?: number | null
  } | null
}) {
  const c = stop.customer
  if (!c) return null
  if (c.lat && c.lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  }
  const addr = [c.address_street, c.address_apt, c.address_city, c.address_postal_code]
    .filter(Boolean).join(', ')
  if (!addr) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`
}

// ─── Pickup-after-delivery prompt ────────────────────────────────────────────
function PickupPromptModal({ onYes, onNo }: { onYes: (bagCount: number | null, note: string) => void; onNo: () => void }) {
  const [bags, setBags] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pick up laundry here?</p>
              <p className="text-sm text-gray-500">While you're at this address</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Is there laundry to pick up from this customer while you're here?
          </p>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Bags picked up (optional)</label>
          <input
            type="number" inputMode="numeric" min={0} value={bags}
            onChange={(e) => setBags(e.target.value)}
            placeholder="e.g. 2"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="block text-xs font-semibold text-gray-500 mb-1">Note for store (optional)</label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="e.g. delicates, comforter…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-3">
            <button onClick={onNo}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">
              No, skip
            </button>
            <button onClick={() => onYes(bags.trim() ? parseInt(bags) : null, note.trim())}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm">
              Yes, pick up
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Issue modal ──────────────────────────────────────────────────────────────
function IssueModal({ onSubmit, onCancel }: {
  onSubmit: (notes: string) => void
  onCancel: () => void
}) {
  const [notes, setNotes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden">
        <div className="p-5">
          <p className="font-semibold text-gray-900 mb-3">Report an issue</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Describe the issue (no access, wrong address, customer not home…)"
            className="w-full border border-gray-200 rounded-xl p-3 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            autoFocus
          />
          <div className="flex gap-3 mt-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">
              Cancel
            </button>
            <button onClick={() => onSubmit(notes)}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm">
              Mark Failed
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Nothing to pickup modal ──────────────────────────────────────────────────
const NOTHING_REASONS = [
  { id: 'nothing_here', label: 'Nothing to pick up', emoji: '📦' },
  { id: 'not_home',     label: 'Not home / no answer', emoji: '🚪' },
] as const

function NothingToPickupModal({ onSubmit, onCancel }: {
  onSubmit: (reason: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden">
        <div className="p-5">
          <p className="font-semibold text-gray-900 mb-4">Nothing to pick up</p>
          <div className="space-y-2 mb-5">
            {NOTHING_REASONS.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-colors',
                  selected === r.id
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-gray-200 bg-white'
                )}
              >
                <span className="text-xl">{r.emoji}</span>
                <span className={cn(
                  'text-sm font-semibold',
                  selected === r.id ? 'text-brand-700' : 'text-gray-800'
                )}>{r.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">
              Cancel
            </button>
            <button
              onClick={() => selected && onSubmit(NOTHING_REASONS.find(r => r.id === selected)!.label)}
              disabled={!selected}
              className="flex-1 py-3 rounded-xl bg-gray-800 text-white font-semibold text-sm disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── GPS broadcaster — only mounted when status is confirmed en_route ────────
function GPSBroadcaster({ stopId }: { stopId: string }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const send = () => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition((pos) => {
        fetch(`/api/track/${stopId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {})
      }, () => {}, { enableHighAccuracy: true, timeout: 10000 })
    }
    send()
    intervalRef.current = setInterval(send, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [stopId])
  return null // invisible — just broadcasts location
}

// ─── Main stop detail ─────────────────────────────────────────────────────────
function StopDetailInner() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const stopId = params.id as string
  const zonesParam = searchParams.get('zones') ?? ''

  const [driverNotes, setDriverNotes] = useState('')
  const [bagCount, setBagCount] = useState<string>('')
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [showNothingModal, setShowNothingModal] = useState(false)
  const [showPickupPrompt, setShowPickupPrompt] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const { createBrowserClient } = await import('@/lib/supabase-client')
      const supabase = createBrowserClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `driver/${stopId}_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('order-issues').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('order-issues').getPublicUrl(path)
      setPhotoUrl(data.publicUrl)
      toast.success('Photo attached')
    } catch {
      toast.error('Photo upload failed')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const { data: me } = trpc.staff.myRole.useQuery()
  const { data: stop, refetch, isLoading } = trpc.pickupStops.getStop.useQuery({ id: stopId })

  const { data: driverMeta } = trpc.pickupStops.getDriverName.useQuery(
    { user_id: stop?.driver_user_id ?? '' },
    { enabled: !!stop?.driver_user_id && stop.driver_user_id !== me?.userId }
  )

  const claimStop = trpc.pickupStops.claimStop.useMutation({
    onSuccess: () => { refetch(); toast.success('Stop claimed — en route!') },
    onError: (e) => toast.error(e.message),
  })

  const completeStop = trpc.pickupStops.completeStop.useMutation({
    onSuccess: () => { refetch() },
    onError: (e) => { toast.error(e.message); setCompleting(false) },
  })

  // NOTE: these must stay above the early `if (isLoading || !stop) return` below —
  // all hooks have to run in the same order on every render (React error #310).
  const createPickupStop = trpc.pickupStops.createOneOff.useMutation({
    onSuccess: () => {
      toast.success('Picked up — order sent to Detail for weighing')
      router.push(backHref)
    },
    onError: () => {
      toast.success('Delivery complete!')
      router.push(backHref)
    },
  })
  const createPickupOrder = trpc.orders.createPickup.useMutation()

  const currentUserId = me?.userId ?? ''

  if (isLoading || !stop) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading stop…
      </div>
    )
  }

  const isMine = stop.driver_user_id === currentUserId
  const isTaken = !!stop.driver_user_id && !isMine
  const isUnclaimed = !stop.driver_user_id
  const isComplete = stop.status === 'completed' || stop.status === 'failed' || stop.status === 'skipped'
  const isDelivery = stop.type === 'delivery'

  const customer = stop.customer as {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    address_street: string | null
    address_apt?: string | null
    address_city: string | null
    address_postal_code?: string | null
    lat?: number | null
    lng?: number | null
    driver_instructions?: string | null
    order_preferences?: unknown
  } | null

  const address = [customer?.address_street, customer?.address_apt, customer?.address_city]
    .filter(Boolean).join(', ')

  const timeLabel = [fmtTime(stop.time_start as string), fmtTime(stop.time_end as string)]
    .filter(Boolean).join(' – ')

  const navUrl = mapsUrl({ customer: customer ?? null })
  const prefs = parsePrefs(customer?.order_preferences)

  const order = stop.order as {
    id: string
    order_number: string
    status: string
    payment_status: string
    total_amount: number | null
    paid_amount: number | null
  } | null

  const backHref = `/drive/route${zonesParam ? `?zones=${zonesParam}` : ''}`
  const isEnRoute = stop.status === 'en_route'

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleClaim = () => claimStop.mutate({ id: stopId })

  const handleComplete = async () => {
    setCompleting(true)
    await completeStop.mutateAsync({
      id: stopId,
      status: 'completed',
      driver_notes: driverNotes || null,
      bag_count: bagCount ? parseInt(bagCount) : null,
      photo_url: photoUrl ?? null,
    })
    setCompleting(false)

    if (isDelivery) {
      setShowPickupPrompt(true)
    } else {
      toast.success('Stop completed!')
      router.push(backHref)
    }
  }

  const handleFailed = (notes: string) => {
    setShowIssueModal(false)
    completeStop.mutate({
      id: stopId,
      status: 'failed',
      driver_notes: notes || null,
    })
    toast.success('Issue reported')
    router.push(backHref)
  }

  const handleNothingToPickup = (reason: string) => {
    setShowNothingModal(false)
    completeStop.mutate({
      id: stopId,
      status: 'failed',
      driver_notes: reason,
    })
    toast.success('Stop recorded')
    router.push(backHref)
  }

  const handlePickupYes = async (bagCount: number | null, note: string) => {
    setShowPickupPrompt(false)
    const customer = stop.customer as { id: string } | null
    if (!customer?.id) {
      toast.success('Delivery complete!')
      router.push(backHref)
      return
    }
    const today = new Date().toISOString().split('T')[0]
    const detail = [
      'Picked up by driver during delivery',
      bagCount != null ? `${bagCount} bag${bagCount === 1 ? '' : 's'}` : null,
      note || null,
    ].filter(Boolean).join(' — ')
    try {
      // 1) Create a pending order in the "Detail" queue so the picked-up items
      //    can be weighed and detailed when they get back to the store.
      const order = await createPickupOrder.mutateAsync({
        customer_id: customer.id,
        scheduled_date: today,
        notes: detail,
        skip_stop: true, // we create the (already-completed) stop ourselves below
      })
      // 2) Record the pickup as already completed, linked to that order.
      createPickupStop.mutate({
        customer_id: customer.id,
        type: 'pickup',
        scheduled_date: today,
        zone_id: stop.zone_id as string ?? null,
        order_id: order.id as string,
        status: 'completed',
        bag_count: bagCount,
        notes: detail,
      })
    } catch {
      toast.success('Delivery complete!')
      router.push(backHref)
    }
  }

  const handlePickupNo = () => {
    setShowPickupPrompt(false)
    toast.success('Delivery complete!')
    router.push(backHref)
  }

  // ── Status banner colour ─────────────────────────────────────────────────
  const statusColors = {
    completed: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
    skipped: 'bg-gray-100 text-gray-500',
    en_route: 'bg-blue-50 text-blue-700',
    pending: 'bg-amber-50 text-amber-700',
  }
  const statusLabel = {
    completed: 'Completed',
    failed: 'Failed',
    skipped: 'Skipped',
    en_route: 'En Route',
    pending: 'Pending',
  }
  const statusKey = (stop.status as string) in statusColors
    ? stop.status as keyof typeof statusColors
    : 'pending'

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* GPS broadcaster — only active when en_route, invisible */}
      {isEnRoute && <GPSBroadcaster stopId={stopId} />}

      {/* Header */}
      <div className="bg-brand-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(backHref)} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                isDelivery ? 'bg-purple-400/30 text-purple-100' : 'bg-blue-400/30 text-blue-100'
              )}>
                {isDelivery ? 'DELIVERY' : 'PICKUP'}
              </span>
              <span className="font-bold text-base">{order?.order_number ?? '—'}</span>
            </div>
            {timeLabel && (
              <p className="text-brand-200 text-xs mt-0.5">{timeLabel}</p>
            )}
          </div>
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="p-2">
              <Phone className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-32">

        {/* Status badge */}
        {isComplete && (
          <div className={cn('px-4 py-2 text-sm font-semibold text-center', statusColors[statusKey])}>
            {statusLabel[statusKey]}
          </div>
        )}

        {/* Customer card */}
        <div className="bg-white mx-4 mt-4 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">
                  {customer?.first_name} {customer?.last_name}
                </p>
                {customer?.phone && (
                  <p className="text-sm text-gray-500">{formatPhone(customer.phone)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Address row */}
          {address && (
            <button
              onClick={() => navUrl && window.open(navUrl, '_blank')}
              className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 text-left active:bg-gray-50"
              disabled={!navUrl}
            >
              <Navigation className={cn('h-5 w-5 flex-shrink-0', navUrl ? 'text-brand-600' : 'text-gray-300')} />
              <div className="flex-1">
                <p className="text-sm text-gray-800">{address}</p>
                {navUrl && <p className="text-xs text-brand-600 font-medium">Tap to navigate</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          )}
        </div>

        {/* Driver instructions */}
        {customer?.driver_instructions && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Driver Instructions</p>
                <p className="text-sm text-amber-800">{customer.driver_instructions}</p>
              </div>
            </div>
          </div>
        )}

        {/* Order / payment info */}
        {order && (
          <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Order #</span>
              <span className="font-medium text-gray-900">{order.order_number}</span>
            </div>
            {order.total_amount != null && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total</span>
                <span className="font-medium text-gray-900">
                  ${(order.total_amount / 100).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Payment</span>
              <span className={cn(
                'font-semibold',
                order.payment_status === 'paid' ? 'text-green-600' :
                order.payment_status === 'partial' ? 'text-amber-600' : 'text-gray-500'
              )}>
                {order.payment_status === 'paid' ? 'Paid' :
                 order.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
              </span>
            </div>
          </div>
        )}

        {/* Preferences */}
        {prefs.length > 0 && (
          <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Preferences</p>
            <div className="flex flex-wrap gap-2">
              {prefs.map(p => (
                <div key={p.label} className="bg-gray-100 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-gray-500">{p.label}: </span>
                  <span className="text-xs font-semibold text-gray-800">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claim / taken status */}
        {!isComplete && (
          <div className="mx-4 mt-3">
            {isUnclaimed && (
              <button
                onClick={handleClaim}
                disabled={claimStop.isPending}
                className="w-full bg-brand-600 text-white font-semibold py-4 rounded-2xl text-base active:bg-brand-700 disabled:opacity-60"
              >
                {claimStop.isPending ? 'Claiming…' : `Claim ${isDelivery ? 'Delivery' : 'Pickup'}`}
              </button>
            )}
            {isTaken && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                <p className="text-sm font-semibold text-red-700">
                  Claimed by {driverMeta?.name ?? driverMeta?.email ?? 'another driver'}
                </p>
                <p className="text-xs text-red-500 mt-0.5">This stop has been taken</p>
              </div>
            )}
          </div>
        )}

        {/* Driver actions — only when I've claimed it */}
        {isMine && !isComplete && (
          <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Complete Stop</p>

            {/* Bag count — pickups only, not needed for deliveries */}
            {!isDelivery && <div>
              <label className="text-sm text-gray-600 font-medium block mb-1.5">
                Bags picked up
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBagCount(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)))}
                  className="h-10 w-10 rounded-full border border-gray-200 text-gray-700 text-xl font-bold flex items-center justify-center"
                >−</button>
                <input
                  type="number"
                  min={0}
                  value={bagCount}
                  onChange={e => setBagCount(e.target.value)}
                  placeholder="0"
                  className="flex-1 text-center border border-gray-200 rounded-xl py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button
                  onClick={() => setBagCount(prev => String((parseInt(prev) || 0) + 1))}
                  className="h-10 w-10 rounded-full border border-gray-200 text-gray-700 text-xl font-bold flex items-center justify-center"
                >+</button>
              </div>
            </div>}

            {/* Notes */}
            <div>
              <label className="text-sm text-gray-600 font-medium block mb-1.5">Driver notes</label>
              <textarea
                value={driverNotes}
                onChange={e => setDriverNotes(e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            {/* Photo — proof of delivery */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />
            {photoUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Proof of delivery" className="w-full object-cover max-h-48" />
                <button
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-gray-400 text-sm active:bg-gray-50"
              >
                <Camera className="h-5 w-5" />
                {uploadingPhoto ? 'Uploading…' : 'Add proof of delivery photo'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar — claim/complete */}
      {isMine && !isComplete && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-bottom">
          {/* Primary action */}
          <div className="px-4 pt-3 pb-2">
            <button
              onClick={handleComplete}
              disabled={completing || completeStop.isPending}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white font-semibold py-4 rounded-2xl text-base active:bg-brand-700 disabled:opacity-60"
            >
              <CheckCircle className="h-5 w-5" />
              {completing ? 'Saving…' : isDelivery ? 'Mark Delivered' : 'Mark Picked Up'}
            </button>
          </div>
          {/* Secondary actions */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => setShowNothingModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50"
            >
              <MinusCircle className="h-4 w-4" />
              Nothing to Pick Up
            </button>
            <button
              onClick={() => setShowIssueModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-sm active:bg-red-50"
            >
              <XCircle className="h-4 w-4" />
              Issue
            </button>
          </div>
        </div>
      )}

      {/* Completed state — back button */}
      {isComplete && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 safe-bottom">
          <button
            onClick={() => router.push(backHref)}
            className="w-full bg-gray-100 text-gray-700 font-semibold py-4 rounded-2xl text-base"
          >
            ← Back to Route
          </button>
        </div>
      )}

      {/* Modals */}
      {showIssueModal && (
        <IssueModal onSubmit={handleFailed} onCancel={() => setShowIssueModal(false)} />
      )}
      {showNothingModal && (
        <NothingToPickupModal onSubmit={handleNothingToPickup} onCancel={() => setShowNothingModal(false)} />
      )}
      {showPickupPrompt && (
        <PickupPromptModal onYes={handlePickupYes} onNo={handlePickupNo} />
      )}
    </div>
  )
}

export default function StopDetailPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>}>
      <StopDetailInner />
    </Suspense>
  )
}
