'use client'

import { useState } from 'react'
import { Printer, CreditCard, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

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

interface PrinterConfig {
  name: string
  connection: 'network' | 'usb' | 'bluetooth'
  address: string // IP for network, path for USB
}

function PrinterSection({ type, label, description }: { type: PrinterType; label: string; description: string }) {
  const utils = trpc.useUtils()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>
  const hardware = (tenantSettings.hardware ?? {}) as Record<string, unknown>
  const saved = (hardware[`${type}_printer`] ?? {}) as Partial<PrinterConfig>

  const [name, setName] = useState(saved.name ?? '')
  const [connection, setConnection] = useState<PrinterConfig['connection']>(saved.connection ?? 'network')
  const [address, setAddress] = useState(saved.address ?? '')
  const [dirty, setDirty] = useState(false)

  const configured = !!(saved.name || saved.address)

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => {
      utils.tenants.getCurrent.invalidate()
      setDirty(false)
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSave = () => {
    update.mutate({
      settings: {
        hardware: {
          ...hardware,
          [`${type}_printer`]: { name: name.trim(), connection, address: address.trim() },
        },
      },
    })
  }

  const handleClear = () => {
    update.mutate({
      settings: {
        hardware: {
          ...hardware,
          [`${type}_printer`]: {},
        },
      },
    })
    setName('')
    setAddress('')
    setConnection('network')
    setDirty(false)
  }

  const mark = () => setDirty(true)

  return (
    <HardwareCard
      icon={Printer}
      iconBg="bg-orange-50 border-orange-100"
      iconColor="text-orange-500"
      title={label}
      description={description}
      statusLabel={configured ? (saved.name ?? 'Configured') : 'Not configured'}
      statusColor={configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Printer name</label>
          <Input value={name} onChange={(e) => { setName(e.target.value); mark() }} placeholder={`e.g. ${label}`} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Connection type</label>
          <div className="flex gap-2">
            {(['network', 'usb', 'bluetooth'] as const).map((c) => (
              <button
                key={c}
                onClick={() => { setConnection(c); mark() }}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  connection === c
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {connection === 'network' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">IP address</label>
            <Input
              value={address}
              onChange={(e) => { setAddress(e.target.value); mark() }}
              placeholder="e.g. 192.168.1.50"
              className="font-mono text-sm"
            />
          </div>
        )}
        {connection === 'usb' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">USB / device path</label>
            <Input
              value={address}
              onChange={(e) => { setAddress(e.target.value); mark() }}
              placeholder="e.g. /dev/usb/lp0 or USB001"
              className="font-mono text-sm"
            />
          </div>
        )}
        {connection === 'bluetooth' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Bluetooth address</label>
            <Input
              value={address}
              onChange={(e) => { setAddress(e.target.value); mark() }}
              placeholder="e.g. AA:BB:CC:DD:EE:FF"
              className="font-mono text-sm"
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={!dirty || update.isPending} className="flex-1">
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {configured && (
            <Button variant="outline" onClick={handleClear} disabled={update.isPending} className="text-red-500 hover:text-red-600 border-red-200 hover:border-red-300">
              Clear
            </Button>
          )}
        </div>
      </div>
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
      />
      <PrinterSection
        type="label"
        label="Label Printer"
        description="Prints order labels and bag tags"
      />
    </div>
  )
}
