'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, Truck, Clock, Package, Home } from 'lucide-react'

type TrackData = {
  id: string
  type: 'pickup' | 'delivery'
  status: 'pending' | 'en_route' | 'completed' | 'skipped' | 'failed'
  scheduled_date: string
  time_start: string | null
  time_end: string | null
  completed_at: string | null
  driver_lat: number | null
  driver_lng: number | null
  driver_updated_at: string | null
  customer_lat: number | null
  customer_lng: number | null
  customer_address: string | null
  customer_first: string | null
  store_name: string
}

function fmtTime(t: string | null | undefined) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

// ─── Map component ────────────────────────────────────────────────────────────

function DriverMap({ data }: { data: TrackData }) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverMarkerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerMarkerRef = useRef<any>(null)
  const [eta, setEta] = useState<string | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || !mapRef.current) return
    if ((window as unknown as Record<string, unknown>).google) { initMap(); return }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`
    script.async = true
    script.onload = initMap
    document.head.appendChild(script)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  const initMap = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    if (!mapRef.current || !google) return

    // Center on driver or customer or default
    const center = data.driver_lat && data.driver_lng
      ? { lat: data.driver_lat, lng: data.driver_lng }
      : data.customer_lat && data.customer_lng
        ? { lat: data.customer_lat, lng: data.customer_lng }
        : { lat: 44.5667, lng: -80.9500 } // Owen Sound default

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
    })

    updateMarkers()
  }

  const updateMarkers = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    const map = mapInstanceRef.current
    if (!google || !map) return

    // Driver marker (truck emoji)
    if (data.driver_lat && data.driver_lng) {
      const driverPos = { lat: data.driver_lat, lng: data.driver_lng }
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setPosition(driverPos)
      } else {
        driverMarkerRef.current = new google.maps.Marker({
          position: driverPos,
          map,
          title: 'Driver',
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
              '<circle cx="20" cy="20" r="18" fill="#2563eb" stroke="white" stroke-width="2"/>' +
              '<text x="20" y="26" text-anchor="middle" font-size="18">🚗</text></svg>'
            ),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
          },
          zIndex: 2,
        })
      }
    }

    // Customer marker (house/package)
    if (data.customer_lat && data.customer_lng) {
      const custPos = { lat: data.customer_lat, lng: data.customer_lng }
      if (!customerMarkerRef.current) {
        customerMarkerRef.current = new google.maps.Marker({
          position: custPos,
          map,
          title: 'Your location',
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
              '<circle cx="20" cy="20" r="18" fill="#16a34a" stroke="white" stroke-width="2"/>' +
              '<text x="20" y="26" text-anchor="middle" font-size="18">📍</text></svg>'
            ),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
          },
          zIndex: 1,
        })
      }
    }

    // Fit bounds to show both markers
    if (data.driver_lat && data.driver_lng && data.customer_lat && data.customer_lng) {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend({ lat: data.driver_lat, lng: data.driver_lng })
      bounds.extend({ lat: data.customer_lat, lng: data.customer_lng })
      map.fitBounds(bounds, 60)
    }

    // Get ETA via Directions API
    if (data.driver_lat && data.driver_lng && (data.customer_lat || data.customer_address)) {
      const service = new google.maps.DistanceMatrixService()
      const dest = data.customer_lat && data.customer_lng
        ? { lat: data.customer_lat, lng: data.customer_lng }
        : data.customer_address!
      service.getDistanceMatrix({
        origins: [{ lat: data.driver_lat, lng: data.driver_lng }],
        destinations: [dest],
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result: unknown, status: string) => {
        if (status === 'OK') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = (result as any)?.rows?.[0]?.elements?.[0]
          if (row?.status === 'OK') {
            const mins = Math.round(row.duration.value / 60)
            const arrival = new Date(Date.now() + row.duration.value * 1000)
            const arrivalStr = arrival.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
            setEta(mins <= 1 ? 'Arriving now' : `~${mins} min · arrives around ${arrivalStr}`)
          }
        }
      })
    }
  }, [data])

  // Update markers when driver location changes
  useEffect(() => {
    updateMarkers()
  }, [data.driver_lat, data.driver_lng, updateMarkers])

  if (!apiKey) return null

  return (
    <div className="w-full max-w-sm">
      <div ref={mapRef} className="w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 240 }} />
      {eta && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <Truck className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-sm font-semibold text-blue-700">{eta}</p>
        </div>
      )}
    </div>
  )
}

// ─── Status components ────────────────────────────────────────────────────────

function StatusIndicator({ status, type }: { status: TrackData['status']; type: TrackData['type'] }) {
  const isPickup = type === 'pickup'

  if (status === 'completed') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>
        <p className="text-lg font-bold text-green-700">
          {isPickup ? 'Laundry Picked Up!' : 'Delivered!'}
        </p>
      </div>
    )
  }

  if (status === 'en_route') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`h-20 w-20 rounded-full flex items-center justify-center ${isPickup ? 'bg-blue-100' : 'bg-purple-100'}`}>
          <Truck className={`h-10 w-10 ${isPickup ? 'text-blue-500' : 'text-purple-500'} animate-pulse`} />
        </div>
        <p className={`text-lg font-bold ${isPickup ? 'text-blue-700' : 'text-purple-700'}`}>
          Driver is on the way
        </p>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center">
          {isPickup
            ? <Package className="h-10 w-10 text-gray-400" />
            : <Home className="h-10 w-10 text-gray-400" />
          }
        </div>
        <p className="text-lg font-bold text-gray-600">Scheduled</p>
      </div>
    )
  }

  return null
}

function Steps({ status, type }: { status: TrackData['status']; type: TrackData['type'] }) {
  const isPickup = type === 'pickup'
  const steps = isPickup
    ? ['Scheduled', 'Driver En Route', 'Picked Up']
    : ['Ready to Deliver', 'Driver En Route', 'Delivered']

  const activeStep =
    status === 'pending'   ? 0 :
    status === 'en_route'  ? 1 :
    status === 'completed' ? 2 : -1

  return (
    <div className="w-full mt-6">
      <div className="flex items-center">
        {steps.map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex items-center w-full">
              {i > 0 && (
                <div className={`flex-1 h-0.5 ${i <= activeStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
              )}
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                i < activeStep  ? 'bg-brand-500 border-brand-500 text-white' :
                i === activeStep ? 'bg-brand-600 border-brand-600 text-white ring-4 ring-brand-100' :
                'bg-white border-gray-300 text-gray-400'
              }`}>
                {i < activeStep ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < activeStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
              )}
            </div>
            <span className={`text-[10px] font-semibold text-center leading-tight px-1 ${
              i === activeStep ? 'text-brand-700' : i < activeStep ? 'text-gray-500' : 'text-gray-300'
            }`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const { stopId } = useParams<{ stopId: string }>()
  const [data, setData] = useState<TrackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${stopId}`)
      if (!res.ok) { setError(true); return }
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [stopId])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, data?.status === 'en_route' ? 30_000 : 60_000)
    return () => clearInterval(interval)
  }, [fetchStatus, data?.status])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-gray-500 font-medium">Tracking link not found</p>
          <p className="text-gray-400 text-sm mt-1">This link may have expired or is invalid.</p>
        </div>
      </div>
    )
  }

  const isPickup = data.type === 'pickup'
  const timeWindow = data.time_start
    ? `${fmtTime(data.time_start)}${data.time_end ? ` – ${fmtTime(data.time_end)}` : ''}`
    : null
  const showMap = data.status === 'en_route' && data.driver_lat && data.driver_lng

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10 gap-4">
      {/* Store header */}
      <div className="w-full max-w-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{data.store_name}</p>
        <h1 className="text-2xl font-bold text-gray-900">
          {isPickup ? 'Laundry Pickup' : 'Laundry Delivery'}
        </h1>
        {data.customer_first && (
          <p className="text-gray-500 text-sm mt-1">Hi {data.customer_first} 👋</p>
        )}
      </div>

      {/* Status card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col items-center">
          <StatusIndicator status={data.status} type={data.type} />
          <Steps status={data.status} type={data.type} />
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <span>{fmtDate(data.scheduled_date)}</span>
          </div>
          {timeWindow && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="h-4 w-4" />
              <span>Expected window: <span className="font-semibold">{timeWindow}</span></span>
            </div>
          )}
          {data.status === 'en_route' && (
            <p className="text-xs text-gray-400 mt-1">
              {isPickup ? 'Your driver is on the way. Please have your laundry ready.' : 'Your driver is on the way with your clean laundry.'}
            </p>
          )}
          {data.status === 'completed' && data.completed_at && (
            <p className="text-xs text-gray-400 mt-1">
              Completed at {new Date(data.completed_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
          )}
        </div>
      </div>

      {/* Live map — below status card, only when driver has location */}
      {showMap && <DriverMap data={data} />}

      {data.status !== 'completed' && data.status !== 'skipped' && (
        <p className="text-xs text-gray-400">
          Updates automatically · Last checked {lastRefresh.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </p>
      )}
    </div>
  )
}
