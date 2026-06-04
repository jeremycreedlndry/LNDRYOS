import type { LabelSize } from './printJobs'

// A "Station" is a named bundle of hardware (printers + label size + payment
// terminal) tied to a physical spot in the store. Each device picks which
// station it's at; printing/terminal calls use that station's hardware.

export type ConnectionType = 'network' | 'windows_share' | 'usb' | 'bluetooth'

export interface PrinterConfig {
  name: string
  connection: ConnectionType
  ip: string
  port: string
  host: string
  share: string
  address: string
}

export interface StationHardware {
  receipt_printer?: Partial<PrinterConfig>
  label_printer?: Partial<PrinterConfig>
  label_size?: LabelSize
}

export interface Station {
  id: string
  name: string
  hardware?: StationHardware
  helcim?: { terminal_id?: string }
}

/**
 * Derive the station list from tenant settings. When no stations are configured
 * yet but legacy tenant-wide hardware exists, synthesize a single "Front Desk"
 * station from it so existing setups keep working (and get migrated on first save).
 */
export function deriveStations(settings: unknown): Station[] {
  const s = (settings ?? {}) as Record<string, unknown>
  const raw = s.stations as Station[] | undefined
  if (raw && raw.length) return raw

  const legacyHw = s.hardware as StationHardware | undefined
  const legacyHelcim = s.helcim as { terminal_id?: string } | undefined
  const hasLegacy =
    (legacyHw && Object.keys(legacyHw).length > 0) ||
    (legacyHelcim && !!legacyHelcim.terminal_id)

  if (hasLegacy) {
    return [{ id: 'front-desk', name: 'Front Desk', hardware: legacyHw, helcim: legacyHelcim }]
  }
  return []
}

export function newStationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `station-${Math.random().toString(36).slice(2, 10)}`
}

// Per-device persistence of the chosen station
export const ACTIVE_STATION_KEY = 'lndryos_active_station_id'
// Per-session flag so we prompt for the station once per login
export const STATION_PROMPTED_KEY = 'lndryos_station_prompted'
