'use client'

import { useState, useEffect } from 'react'
import { Printer, CreditCard, Check, X, ChevronDown, ChevronUp, Search, Zap, Plus, MonitorSmartphone, Pencil, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { qzListPrinters, qzPrintZPL, qzPrintRaw, qzPrintHTML } from '@/lib/qzTray'
import { LABEL_SIZE_PRESETS, DEFAULT_LABEL_SIZE, type LabelSize, buildReceiptHTML, buildLabelPreviewHTML } from '@/lib/printJobs'
import { deriveStations, newStationId, type Station } from '@/lib/stations'
import { useStation } from '@/components/station/StationProvider'
import toast from 'react-hot-toast'

// ─── Printer picker modal ─────────────────────────────────────────────────────

function PrinterPickerModal({ onSelect, onClose }: {
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const [printers, setPrinters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Discover on mount
  useEffect(() => {
    qzListPrinters()
      .then(setPrinters)
      .catch((e) => setError(e?.message ?? 'Could not connect to QZ Tray. Make sure it is running.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Select Printer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-2 max-h-72 overflow-y-auto">
          {loading && (
            <p className="text-sm text-gray-400 text-center py-8 animate-pulse">Discovering printers…</p>
          )}
          {error && (
            <p className="text-sm text-red-500 text-center py-8 px-4">{error}</p>
          )}
          {!loading && !error && printers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No printers found.</p>
          )}
          {printers.map((p) => (
            <button
              key={p}
              onClick={() => { onSelect(p); onClose() }}
              className="w-full text-left px-4 py-3 rounded-lg text-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shared collapse card (same pattern as IntegrationsTab) ───────────────────

function HardwareCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  statusLabel,
  statusColor,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  title: string
  description: string
  statusLabel: string
  statusColor: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
          {statusLabel}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Helcim card reader ───────────────────────────────────────────────────────

function HelcimReaderSection({ station, onPatch, saving }: {
  station: Station
  onPatch: (updater: (s: Station) => Station) => void
  saving: boolean
}) {
  const terminalId = station.helcim?.terminal_id ?? ''
  const configured = !!terminalId

  return (
    <HardwareCard
      icon={CreditCard}
      iconBg="bg-indigo-50 border-indigo-100"
      iconColor="text-indigo-600"
      title="Helcim Reader"
      description="Card-present payments at POS"
      statusLabel={configured ? 'Configured' : 'Not configured'}
      statusColor={configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
      defaultOpen
    >
      <HelcimReaderForm key={station.id} terminalId={terminalId} onPatch={onPatch} saving={saving} />
    </HardwareCard>
  )
}

function HelcimReaderForm({ terminalId, onPatch, saving }: {
  terminalId: string
  onPatch: (updater: (s: Station) => Station) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(terminalId)
  const [dirty, setDirty] = useState(false)

  const update = { isPending: saving }

  const handleSave = () => {
    onPatch((s) => ({ ...s, helcim: { terminal_id: draft.trim() } }))
    setDirty(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-medium text-gray-500">Connection</span>
          <span className="text-xs text-gray-700">Helcim API (cloud-connected)</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-medium text-gray-500">Provider</span>
          <span className="text-xs text-gray-700">Helcim</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Terminal ID
        </label>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true) }}
            placeholder="e.g. 12345678"
            className="font-mono text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          />
          {dirty && (
            <>
              <button
                onClick={handleSave}
                disabled={update.isPending}
                className="text-green-600 hover:text-green-700 disabled:opacity-40"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                onClick={() => { setDraft(terminalId); setDirty(false) }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          Found in your Helcim portal under Terminals. Used for card-present payment initiation.
        </p>
      </div>
    </div>
  )
}

// ─── Printer card ─────────────────────────────────────────────────────────────

type PrinterType = 'receipt' | 'label'
type ConnectionType = 'network' | 'windows_share' | 'usb' | 'bluetooth'

interface PrinterConfig {
  name: string
  connection: ConnectionType
  // network
  ip: string
  port: string
  // windows share
  host: string
  share: string
  // usb / bluetooth
  address: string
}

const CONNECTION_LABELS: Record<ConnectionType, string> = {
  network:       'Network (IP)',
  windows_share: 'Windows Share',
  usb:           'USB',
  bluetooth:     'Bluetooth',
}

function PrinterSection({ type, label, description, defaultConnection, station, onPatch, saving }: {
  type: PrinterType
  label: string
  description: string
  defaultConnection?: ConnectionType
  station: Station
  onPatch: (updater: (s: Station) => Station) => void
  saving: boolean
}) {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>
  const hardware = (station.hardware ?? {}) as Record<string, unknown>
  const saved = (hardware[`${type}_printer`] ?? {}) as Partial<PrinterConfig>
  const savedSize = (hardware['label_size'] as LabelSize | undefined) ?? DEFAULT_LABEL_SIZE
  const [labelSize, setLabelSize] = useState<string>(
    Object.entries(LABEL_SIZE_PRESETS).find(
      ([, v]) => v.width_in === savedSize.width_in && v.height_in === savedSize.height_in
    )?.[0] ?? '4x2'
  )

  const [name,       setName]       = useState(saved.name       ?? '')
  const [connection, setConnection] = useState<ConnectionType>(saved.connection ?? defaultConnection ?? 'network')
  const [ip,         setIp]         = useState(saved.ip         ?? '')
  const [port,       setPort]       = useState(saved.port       ?? '9100')
  const [host,       setHost]       = useState(saved.host       ?? '')
  const [share,      setShare]      = useState(saved.share      ?? '')
  const [address,    setAddress]    = useState(saved.address    ?? '')
  const [dirty,      setDirty]      = useState(false)
  const [showPicker,  setShowPicker]  = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const configured = !!(saved.name || saved.ip || saved.host || saved.address)

  const update = { isPending: saving }

  const handleSave = () => {
    const sizeVal = LABEL_SIZE_PRESETS[labelSize] ?? DEFAULT_LABEL_SIZE
    onPatch((s) => ({
      ...s,
      hardware: {
        ...s.hardware,
        [`${type}_printer`]: { name: name.trim(), connection, ip: ip.trim(), port: port.trim(), host: host.trim(), share: share.trim(), address: address.trim() },
        ...(type === 'label' ? { label_size: { width_in: sizeVal.width_in, height_in: sizeVal.height_in } } : {}),
      },
    }))
    setDirty(false)
  }

  const handleClear = () => {
    onPatch((s) => ({ ...s, hardware: { ...s.hardware, [`${type}_printer`]: {} } }))
    setName(''); setIp(''); setPort('9100'); setHost(''); setShare(''); setAddress('')
    setConnection(defaultConnection ?? 'network')
    setDirty(false)
  }

  const mark = () => setDirty(true)

  const handleTestPrint = async () => {
    const printerName = name.trim() || saved.name
    if (!printerName) { toast.error('Save a printer name first'); return }
    setTesting(true)
    try {
      if (type === 'label') {
        // ZPL test label for Zebra/TSC
        const zpl = [
          '^XA',
          '^CF0,40',
          '^FO50,50^FDLNDRYOS Test Label^FS',
          '^CF0,28',
          '^FO50,110^FDLabel Printer OK^FS',
          '^FO50,150^FD' + new Date().toLocaleString() + '^FS',
          '^XZ',
        ].join('\n')
        await qzPrintZPL(printerName, zpl)
      } else {
        // HTML test — creates GDI job so Windows driver auto-cuts
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
          <style>body{font-family:monospace;font-size:12px;text-align:center}</style>
          </head><body>
          <div style="font-size:20px;font-weight:bold">LNDRYOS</div>
          <div>Receipt Printer OK</div>
          <div style="font-size:16px;font-weight:bold">TEST ME BITCH 1</div>
          <div>${new Date().toLocaleString()}</div>
          </body></html>`
        const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/
        if (IP_RE.test(printerName)) {
          const ESC = '\x1B', GS = '\x1D'
          await qzPrintRaw(printerName, [ESC+'@','LNDRYOS\n','Receipt Printer OK\n',new Date().toLocaleString()+'\n','\n\n\n',ESC+'\x64\x06',ESC+'i',GS+'V\x00'].join(''))
        } else {
          await qzPrintHTML(printerName, html)
        }
      }
      toast.success('Test print sent!')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Print failed: ${msg}`)
    } finally {
      setTesting(false)
    }
  }

  // Summary line shown in status badge
  const statusLine = saved.name
    ? saved.name
    : saved.ip
    ? saved.ip
    : saved.host
    ? `\\\\${saved.host}\\${saved.share ?? ''}`
    : 'Configured'

  return (
    <HardwareCard
      icon={Printer}
      iconBg="bg-orange-50 border-orange-100"
      iconColor="text-orange-500"
      title={label}
      description={description}
      statusLabel={configured ? statusLine : 'Not configured'}
      statusColor={configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
    >
      <div className="space-y-4">
        {/* Printer name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Printer name</label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); mark() }}
              placeholder={`e.g. ${label}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <Search className="h-3.5 w-3.5" />
              Find Printer
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            As it appears in Windows Control Panel → Devices and Printers. Use &quot;Find Printer&quot; to auto-discover via QZ Tray.
          </p>
        </div>

        {/* Label size — label printer only */}
        {type === 'label' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Label size</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(LABEL_SIZE_PRESETS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => { setLabelSize(key); mark() }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-center ${
                    labelSize === key
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Connection type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Connection type</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(CONNECTION_LABELS) as ConnectionType[]).map((c) => (
              <button
                key={c}
                onClick={() => { setConnection(c); mark() }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left ${
                  connection === c
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {CONNECTION_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Network IP */}
        {connection === 'network' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">IP address</label>
              <Input value={ip} onChange={(e) => { setIp(e.target.value); mark() }}
                placeholder="e.g. 192.168.1.50" className="font-mono text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Port</label>
              <Input value={port} onChange={(e) => { setPort(e.target.value); mark() }}
                placeholder="9100" className="font-mono text-sm" />
            </div>
          </div>
        )}

        {/* Windows Share */}
        {connection === 'windows_share' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Windows machine hostname or IP
              </label>
              <Input value={host} onChange={(e) => { setHost(e.target.value); mark() }}
                placeholder="e.g. DESKTOP-ABC123 or 192.168.1.10" className="font-mono text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Share name</label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-gray-400 shrink-0">\\{host || 'host'}\</span>
                <Input value={share} onChange={(e) => { setShare(e.target.value); mark() }}
                  placeholder="e.g. LabelPrinter" className="font-mono text-sm" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Found in Windows → Control Panel → Devices and Printers → right-click printer → Printer properties → Sharing.
              </p>
            </div>
          </div>
        )}

        {/* USB */}
        {connection === 'usb' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Device path</label>
            <Input value={address} onChange={(e) => { setAddress(e.target.value); mark() }}
              placeholder="e.g. /dev/usb/lp0 or USB001" className="font-mono text-sm" />
          </div>
        )}

        {/* Bluetooth */}
        {connection === 'bluetooth' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Bluetooth address</label>
            <Input value={address} onChange={(e) => { setAddress(e.target.value); mark() }}
              placeholder="e.g. AA:BB:CC:DD:EE:FF" className="font-mono text-sm" />
          </div>
        )}

        <div className="flex gap-2 pt-1 flex-wrap">
          <Button onClick={handleSave} disabled={!dirty || update.isPending} className="flex-1 min-w-[80px]">
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {(configured || name) && (
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={testing}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                testing
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-brand-200 text-brand-700 hover:bg-brand-50',
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              {testing ? 'Printing…' : 'Test Print'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Preview
          </button>
          {configured && (
            <Button variant="outline" onClick={handleClear} disabled={update.isPending}
              className="text-red-500 hover:text-red-600 border-red-200 hover:border-red-300">
              Clear
            </Button>
          )}
        </div>
      </div>

      {showPicker && (
        <PrinterPickerModal
          onSelect={(p) => { setName(p); mark() }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">{type === 'label' ? 'Label Preview' : 'Receipt Preview'}</h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {type === 'label' ? (
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-xs text-gray-500">Bag-in label (drop-off)</p>
                  <div dangerouslySetInnerHTML={{ __html: buildLabelPreviewHTML(LABEL_SIZE_PRESETS[labelSize] ?? DEFAULT_LABEL_SIZE, false) }} />
                  <p className="text-xs text-gray-500 mt-2">Bag-out label (ready)</p>
                  <div dangerouslySetInnerHTML={{ __html: buildLabelPreviewHTML(LABEL_SIZE_PRESETS[labelSize] ?? DEFAULT_LABEL_SIZE, true) }} />
                </div>
              ) : connection === 'network' ? (
              <div className="border border-gray-200 rounded bg-white mx-auto p-2" style={{ width: 220, fontFamily: 'Courier New, monospace', fontSize: 11 }}>
                <div style={{ textAlign: 'center', fontSize: 10 }}>*** Customer Copy ***</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>#1234</div>
                <div style={{ textAlign: 'center', fontSize: 10 }}>8.5 lbs</div>
                <br/>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14 }}>{(tenant?.settings as any)?.store_name ?? tenant?.name ?? 'The LNDRY Co.'}</div>
                {(tenant?.address as any)?.street && <div style={{ textAlign: 'center', fontSize: 10 }}>{(tenant?.address as any).street}</div>}
                <br/>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>John Smith</div>
                <div style={{ textAlign: 'center', fontSize: 10 }}>705-555-1234</div>
                <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Wash &amp; Fold x 8.5</span><span>$21.25</span></div>
                <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SUBTOTAL:</span><span>$21.25</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{(tenantSettings?.tax_name as string) ?? 'HST'}:</span><span>$2.76</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>TOTAL:</span><span>$24.01</span></div>
                <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}/>
                <div style={{ textAlign: 'center', fontSize: 10 }}>Dropped Off: 06/10/26</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 15, margin: '6px 0' }}>Ready: Fri, Jun 12</div>
                <div style={{ textAlign: 'center', fontSize: 10 }}>Thank you for your business!</div>
                <div style={{ fontSize: 9, color: '#999', textAlign: 'center', marginTop: 6 }}>ESC/POS — network printer</div>
              </div>
              ) : (
              <div
                className="border border-gray-200 rounded bg-white mx-auto"
                style={{ width: 220, fontSize: 13 }}
                dangerouslySetInnerHTML={{
                  __html: buildReceiptHTML({
                    orderNumber: '1234',
                    customerName: 'John Smith',
                    customerPhone: '705-555-1234',
                    lines: [
                      { name: 'Wash & Fold', quantity: 8.5, unitPrice: 250, unitLabel: 'lb', notes: 'Dryer Sheets: Bounce · Detergent Type: Tide · Wash Temperature: Cold' },
                    ],
                    subtotalCents: 2125,
                    taxCents: 276,
                    totalCents: 2401,
                    paidCents: 0,
                    paymentMethod: 'Card',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    storeName: (tenant?.settings as any)?.store_name ?? tenant?.name ?? 'The LNDRY Co.',
                    storeAddress: (tenant?.address as Record<string,string>)?.street ?? null,
                    storeCityPostal: (tenant?.address as Record<string,string>)?.city && (tenant?.address as Record<string,string>)?.postal_code
                      ? `${(tenant?.address as Record<string,string>).city}, ${(tenant?.address as Record<string,string>).postal_code}`
                      : null,
                    storePhone: (tenantSettings?.phone as string) ?? null,
                    taxName: (tenantSettings?.tax_name as string) ?? 'HST',
                    staffName: 'You',
                    droppedOffDate: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
                    readyDate: new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                  }, 'Customer Copy'),
                }}
              />
              )}
            </div>
          </div>
        </div>
      )}
    </HardwareCard>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function HardwareTab() {
  const utils = trpc.useUtils()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()

  const [stations, setStations] = useState<Station[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const { activeStation, setStation } = useStation()

  // Initialise from tenant settings once (migrating legacy hardware → "Front Desk")
  useEffect(() => {
    if (!tenant || ready) return
    const derived = deriveStations(tenant.settings)
    setStations(derived)
    setSelectedId(activeStation?.id ?? derived[0]?.id ?? null)
    setReady(true)
  }, [tenant, ready])

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => { utils.tenants.getCurrent.invalidate(); toast.success('Saved') },
    onError: (e) => toast.error(e.message),
  })

  const persist = (next: Station[]) => {
    setStations(next)
    update.mutate({ settings: { stations: next } })
  }

  const patchStation = (id: string, updater: (s: Station) => Station) => {
    persist(stations.map((s) => (s.id === id ? updater(s) : s)))
  }

  const addStation = () => {
    const id = newStationId()
    const next = [...stations, { id, name: `Station ${stations.length + 1}` }]
    persist(next)
    setSelectedId(id)
    setRenamingId(id); setRenameDraft(`Station ${stations.length + 1}`)
  }

  const deleteStation = (id: string) => {
    const next = stations.filter((s) => s.id !== id)
    persist(next)
    if (selectedId === id) setSelectedId(next[0]?.id ?? null)
  }

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      patchStation(renamingId, (s) => ({ ...s, name: renameDraft.trim() }))
    }
    setRenamingId(null); setRenameDraft('')
  }

  const selected = stations.find((s) => s.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Hardware</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Each <strong>station</strong> (e.g. front desk, delivery desk) has its own printers and payment
            terminal. The ✓ marks the station this device is using.
          </p>
        </div>

        {/* Station dropdown */}
        <div className="relative shrink-0">
          {renamingId === selected?.id && selected ? (
            <input autoFocus value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenamingId(null); setRenameDraft('') } }}
              onBlur={commitRename}
              className="w-44 rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400" />
          ) : (
            <div className="flex items-center gap-1.5">
              {selected && (
                <>
                  <button onClick={() => { setRenamingId(selected.id); setRenameDraft(selected.name) }}
                    className="text-gray-400 hover:text-brand-600" title="Rename station"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => deleteStation(selected.id)}
                    className="text-gray-400 hover:text-red-500" title="Delete station"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
              <button onClick={() => setMenuOpen((o) => !o)}
                className="flex min-w-[170px] items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                <span className="flex items-center gap-1.5 truncate"><MonitorSmartphone className="h-4 w-4 text-brand-500" />{selected?.name ?? 'Select station'}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
            </div>
          )}

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {stations.map((s) => (
                  <button key={s.id}
                    onClick={() => { setSelectedId(s.id); setStation(s.id); setMenuOpen(false) }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-gray-50">
                    <span className="truncate">{s.name}</span>
                    {activeStation?.id === s.id && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                ))}
                <div className="my-1 border-t border-gray-100" />
                <button onClick={() => { addStation(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">
                  <Plus className="h-4 w-4" /> Add A New Station
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {stations.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <MonitorSmartphone className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">No stations yet</p>
          <p className="text-xs text-gray-400 mt-1">Add a station to configure its printers and payment terminal.</p>
        </div>
      )}

      {selected && (
        <div className="space-y-6">
          <HelcimReaderSection station={selected} onPatch={(u) => patchStation(selected.id, u)} saving={update.isPending} />
          <PrinterSection
            key={`${selected.id}-receipt`}
            type="receipt" label="Receipt Printer"
            description="Prints customer receipts at checkout" defaultConnection="network"
            station={selected} onPatch={(u) => patchStation(selected.id, u)} saving={update.isPending}
          />
          <PrinterSection
            key={`${selected.id}-label`}
            type="label" label="Label Printer"
            description="Prints order labels and bag tags" defaultConnection="windows_share"
            station={selected} onPatch={(u) => patchStation(selected.id, u)} saving={update.isPending}
          />
        </div>
      )}
    </div>
  )
}
