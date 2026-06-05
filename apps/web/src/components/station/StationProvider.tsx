'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { MonitorSmartphone, Printer, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import {
  deriveStations, ACTIVE_STATION_KEY, STATION_CHOSEN_KEY,
  type Station, type StationHardware,
} from '@/lib/stations'

interface StationContextValue {
  stations: Station[]
  activeStation: Station | null
  hardware: StationHardware | null
  terminalId: string | null
  setStation: (id: string | null) => void
  openPicker: () => void
}

const StationContext = createContext<StationContextValue | null>(null)

export function useStation(): StationContextValue {
  const ctx = useContext(StationContext)
  if (!ctx) {
    // Safe fallback outside the provider (e.g. tests) — behaves like "no station"
    return { stations: [], activeStation: null, hardware: null, terminalId: null, setStation: () => {}, openPicker: () => {} }
  }
  return ctx
}

export function StationProvider({ children }: { children: React.ReactNode }) {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantId = tenant?.id ?? null
  const stations = useMemo(() => deriveStations(tenant?.settings), [tenant?.settings])

  // Storage is scoped PER TENANT — a station chosen for one store must not carry
  // over to another (e.g. master-admin switching stores, or shared device).
  const activeKey = tenantId ? `${ACTIVE_STATION_KEY}:${tenantId}` : null
  const chosenKey = tenantId ? `${STATION_CHOSEN_KEY}:${tenantId}` : null

  const [activeId, setActiveId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)

  // (Re)load this device's saved station whenever the tenant changes
  useEffect(() => {
    if (!activeKey) return
    setActiveId(localStorage.getItem(activeKey))
  }, [activeKey])

  // Prompt once per (device × tenant) — or again if the saved station no longer
  // exists for this tenant (e.g. it was deleted).
  useEffect(() => {
    if (!tenantId || !chosenKey || stations.length === 0) return
    const chosen = localStorage.getItem(chosenKey)
    const saved = localStorage.getItem(activeKey!)
    const savedStillValid = saved && stations.some((s) => s.id === saved)
    if (!chosen || (saved && !savedStillValid)) setPicker(true)
  }, [tenantId, chosenKey, activeKey, stations])

  const setStation = (id: string | null) => {
    setActiveId(id)
    if (!activeKey || !chosenKey) return
    if (id) localStorage.setItem(activeKey, id)
    else localStorage.removeItem(activeKey)
    localStorage.setItem(chosenKey, '1')
    setPicker(false)
  }

  const activeStation = stations.find((s) => s.id === activeId) ?? null

  const value: StationContextValue = {
    stations,
    activeStation,
    hardware: activeStation?.hardware ?? null,
    terminalId: activeStation?.helcim?.terminal_id ?? null,
    setStation,
    openPicker: () => setPicker(true),
  }

  return (
    <StationContext.Provider value={value}>
      {children}
      {picker && (
        <StationPicker
          stations={stations}
          currentId={activeId}
          onPick={setStation}
          onClose={() => setPicker(false)}
        />
      )}
    </StationContext.Provider>
  )
}

function StationPicker({ stations, currentId, onPick, onClose }: {
  stations: Station[]
  currentId: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Which station are you at?</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-3 space-y-1.5">
          <p className="px-2 pb-1 text-xs text-gray-500">
            This device will use the selected station&apos;s printers and payment terminal.
          </p>
          {stations.map((s) => {
            const printers = [s.hardware?.label_printer?.name, s.hardware?.receipt_printer?.name].filter(Boolean)
            return (
              <button key={s.id} onClick={() => onPick(s.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  currentId === s.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <Printer className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{s.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {printers.length ? printers.join(' · ') : 'No printers configured'}
                  </span>
                </span>
              </button>
            )
          })}
          <button onClick={() => onPick(null)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              currentId === null ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <MonitorSmartphone className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-700">No hardware on this device</span>
          </button>
        </div>
      </div>
    </div>
  )
}
