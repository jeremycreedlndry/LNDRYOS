'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Truck } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

export default function DriveZonePicker() {
  const router = useRouter()
  const { data: zones = [], isLoading } = trpc.deliveryZones.list.useQuery()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Restore last selection from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('driver_zones')
    if (saved) {
      try { setSelected(new Set(JSON.parse(saved))) } catch {}
    }
  }, [])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleSubmit = () => {
    const ids = [...selected]
    localStorage.setItem('driver_zones', JSON.stringify(ids))
    const q = ids.length > 0 ? `?zones=${ids.join(',')}` : ''
    router.push(`/drive/route${q}`)
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-5 safe-top">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6" />
          <div>
            <h1 className="text-lg font-bold">Select Zone(s)</h1>
            <p className="text-brand-200 text-xs">Choose which zones to load</p>
          </div>
        </div>
      </div>

      {/* Zone list */}
      <div className="flex-1 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading zones…</div>
        ) : zones.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No zones set up yet</div>
        ) : (
          <>
            {/* Select all */}
            <button
              onClick={() => selected.size === zones.length
                ? setSelected(new Set())
                : setSelected(new Set(zones.map(z => z.id)))
              }
              className="w-full flex items-center gap-4 px-5 py-4 border-b border-gray-100 text-sm font-medium text-brand-600"
            >
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                selected.size === zones.length ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
              )}>
                {selected.size === zones.length && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              All Zones
            </button>

            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => toggle(zone.id)}
                className="w-full flex items-center gap-4 px-5 py-4 border-b border-gray-100 text-left"
              >
                <div className={cn(
                  'h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                  selected.has(zone.id) ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                )}>
                  {selected.has(zone.id) && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                  <span className="text-base text-gray-900">{zone.name}</span>
                </div>
              </button>
            ))}

            {/* Unassigned zone option */}
            <button
              onClick={() => toggle('unassigned')}
              className="w-full flex items-center gap-4 px-5 py-4 border-b border-gray-100 text-left"
            >
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                selected.has('unassigned') ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
              )}>
                {selected.has('unassigned') && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-base text-gray-900">Unassigned</span>
            </button>
          </>
        )}
      </div>

      {/* Submit */}
      <div className="p-4 bg-white border-t border-gray-100 safe-bottom">
        <button
          onClick={handleSubmit}
          className="w-full bg-brand-600 text-white font-semibold py-4 rounded-2xl text-base active:bg-brand-700"
        >
          START ROUTE
        </button>
      </div>
    </div>
  )
}
