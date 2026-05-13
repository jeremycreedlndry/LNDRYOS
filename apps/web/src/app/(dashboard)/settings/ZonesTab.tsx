'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, Pencil, Check, X, MapPin } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { loadGoogleMaps } from '@/lib/googleMaps'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

const ZONE_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16']

export function ZonesTab() {
  const utils = trpc.useUtils()
  const mapRef   = useRef<HTMLDivElement>(null)
  const mapObjRef = useRef<google.maps.Map | null>(null)
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map())
  const drawingMgrRef = useRef<google.maps.drawing.DrawingManager | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [pendingCoords, setPendingCoords] = useState<[number, number][] | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(ZONE_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: zones = [] } = trpc.deliveryZones.list.useQuery()

  const create = trpc.deliveryZones.create.useMutation({
    onSuccess: () => { utils.deliveryZones.list.invalidate(); setPendingCoords(null); setNewName(''); toast.success('Zone saved') },
    onError: (e) => toast.error(e.message),
  })
  const update = trpc.deliveryZones.update.useMutation({
    onSuccess: () => { utils.deliveryZones.list.invalidate(); setEditingId(null); toast.success('Updated') },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.deliveryZones.delete.useMutation({
    onSuccess: () => { utils.deliveryZones.list.invalidate(); toast.success('Zone removed') },
    onError: (e) => toast.error(e.message),
  })

  // Init map
  useEffect(() => {
    if (!mapRef.current) return
    loadGoogleMaps().then(() => {
      const map = new google.maps.Map(mapRef.current!, {
        center: { lat: 43.65, lng: -79.38 }, // Toronto — overridden by zones
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })
      mapObjRef.current = map

      const dm = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false,
        polygonOptions: { fillColor: newColor, fillOpacity: 0.25, strokeColor: newColor, strokeWeight: 2, editable: true },
      })
      dm.setMap(map)
      drawingMgrRef.current = dm
      setMapReady(true)

      google.maps.event.addListener(dm, 'polygoncomplete', (polygon: google.maps.Polygon) => {
        dm.setDrawingMode(null)
        setDrawing(false)
        const coords = polygon.getPath().getArray().map((ll) => [ll.lng(), ll.lat()] as [number, number])
        setPendingCoords(coords)
        polygon.setMap(null) // remove temp polygon; re-draw after save
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Render saved zones on map
  useEffect(() => {
    if (!mapReady || !mapObjRef.current) return
    // Clear old polygons
    polygonsRef.current.forEach((p) => p.setMap(null))
    polygonsRef.current.clear()

    const bounds = new google.maps.LatLngBounds()
    zones.forEach((zone) => {
      const coords = (zone.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }))
      if (coords.length < 3) return
      const poly = new google.maps.Polygon({
        paths: coords,
        fillColor: zone.color,
        fillOpacity: 0.2,
        strokeColor: zone.color,
        strokeWeight: 2,
      })
      poly.setMap(mapObjRef.current!)
      polygonsRef.current.set(zone.id, poly)
      coords.forEach((c) => bounds.extend(c))
    })
    if (!bounds.isEmpty()) mapObjRef.current.fitBounds(bounds)
  }, [zones, mapReady])

  const startDrawing = () => {
    if (!drawingMgrRef.current) return
    drawingMgrRef.current.setOptions({
      polygonOptions: { fillColor: newColor, fillOpacity: 0.25, strokeColor: newColor, strokeWeight: 2, editable: true },
    })
    drawingMgrRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON)
    setDrawing(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Delivery Zones</h2>
        <p className="text-sm text-gray-500 mt-0.5">Draw geographic zones on the map. Customers are auto-assigned based on their address.</p>
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-xl border border-gray-200" style={{ height: 400 }}>
        <div ref={mapRef} className="h-full w-full" />

        {/* Draw controls overlay */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {!pendingCoords && (
            <>
              {/* Color picker */}
              <div className="flex gap-1 rounded-xl bg-white/90 backdrop-blur p-1.5 shadow border border-gray-200">
                {ZONE_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={cn('h-5 w-5 rounded-full transition-transform', newColor === c && 'scale-125 ring-2 ring-white ring-offset-1')}
                    style={{ background: c }} />
                ))}
              </div>
              <button
                onClick={drawing ? () => { drawingMgrRef.current?.setDrawingMode(null); setDrawing(false) } : startDrawing}
                className={cn('rounded-xl px-4 py-2 text-sm font-semibold shadow border transition-colors',
                  drawing
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    : 'bg-white border-gray-200 text-brand-600 hover:bg-brand-50'
                )}
              >
                {drawing ? 'Cancel drawing' : '+ Draw zone'}
              </button>
            </>
          )}
          {pendingCoords && (
            <div className="flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur p-2 shadow border border-gray-200">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Zone name (e.g. North Route)"
                className="h-8 w-48 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && newName && create.mutate({ name: newName, color: newColor, coordinates: pendingCoords })}
              />
              <button
                onClick={() => create.mutate({ name: newName, color: newColor, coordinates: pendingCoords! })}
                disabled={!newName || create.isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                Save
              </button>
              <button onClick={() => setPendingCoords(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Zone list */}
      {zones.length > 0 && (
        <div className="space-y-2">
          {zones.map((zone) => (
            <div key={zone.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <div className="h-3 w-3 rounded-full shrink-0" style={{ background: zone.color }} />
              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              {editingId === zone.id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="h-7 flex-1 text-sm" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') update.mutate({ id: zone.id, name: editName }); if (e.key === 'Escape') setEditingId(null) }}
                  />
                  <button onClick={() => update.mutate({ id: zone.id, name: editName })} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-800">{zone.name}</span>
                  <button onClick={() => { setEditingId(zone.id); setEditName(zone.name) }} className="p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove.mutate({ id: zone.id })} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
