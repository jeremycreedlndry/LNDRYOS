'use client'

import { useState, useEffect } from 'react'
import { Printer, CreditCard, Check, X, ChevronDown, ChevronUp, Search, Zap } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { qzListPrinters, qzPrintZPL, qzPrintRaw, qzPrintHTML } from '@/lib/qzTray'
import { LABEL_SIZE_PRESETS, DEFAULT_LABEL_SIZE, type LabelSize } from '@/lib/printJobs'
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

function HelcimReaderSection() {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>
  const helcim = (tenantSettings.helcim ?? {}) as Record<string, string>
  const terminalId = helcim.terminal_id ?? ''
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
      <HelcimReaderForm terminalId={terminalId} />
    </HardwareCard>
  )
}

function HelcimReaderForm({ terminalId }: { terminalId: string }) {
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState(terminalId)
  const [dirty, setDirty] = useState(false)

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => {
      utils.tenants.getCurrent.invalidate()
      setDirty(false)
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSave = () => {
    update.mutate({ settings: { helcim: { terminal_id: draft.trim() } } })
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

function PrinterSection({ type, label, description, defaultConnection }: {
  type: PrinterType
  label: string
  description: string
  defaultConnection?: ConnectionType
}) {
  const utils = trpc.useUtils()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>
  const hardware = (tenantSettings.hardware ?? {}) as Record<string, unknown>
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
  const [showPicker, setShowPicker] = useState(false)
  const [testing,    setTesting]    = useState(false)

  const configured = !!(saved.name || saved.ip || saved.host || saved.address)

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => { utils.tenants.getCurrent.invalidate(); setDirty(false); toast.success('Saved') },
    onError: (e) => toast.error(e.message),
  })

  const handleSave = () => {
    const sizeVal = LABEL_SIZE_PRESETS[labelSize] ?? DEFAULT_LABEL_SIZE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hardwareUpdate: any = {
      ...hardware,
      [`${type}_printer`]: { name: name.trim(), connection, ip: ip.trim(), port: port.trim(), host: host.trim(), share: share.trim(), address: address.trim() },
      ...(type === 'label' ? { label_size: { width_in: sizeVal.width_in, height_in: sizeVal.height_in } } : {}),
    }
    update.mutate({
      settings: { hardware: hardwareUpdate },
    })
  }

  const handleClear = () => {
    update.mutate({ settings: { hardware: { ...hardware, [`${type}_printer`]: {} } } })
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
          <div style="font-size:16px;font-weight:bold">TEST ME BITCH</div>
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
    </HardwareCard>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function HardwareTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Hardware</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure printers and payment hardware connected to your store</p>
      </div>
      <HelcimReaderSection />
      <PrinterSection
        type="receipt"
        label="Receipt Printer"
        description="Prints customer receipts at checkout"
        defaultConnection="network"
      />
      <PrinterSection
        type="label"
        label="Label Printer"
        description="Prints order labels and bag tags"
        defaultConnection="windows_share"
      />
    </div>
  )
}
