'use client'

import { useState } from 'react'
import {
  Check, X, WashingMachine, Wind, FoldVertical, Zap, FlaskConical,
  CreditCard, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

// ─── Shared collapse card ─────────────────────────────────────────────────────

function IntegrationCard({
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
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Nayax internals ──────────────────────────────────────────────────────────

function SimulateTapPanel({ equipment }: { equipment: { id: string; name: string; type: string }[] }) {
  const [selectedId, setSelectedId] = useState('')
  const simulate = trpc.nayax.simulateTap.useMutation({
    onSuccess: () => { window.dispatchEvent(new CustomEvent('nayax:simulated-tap')) },
    onError: (e) => toast.error(e.message),
  })
  const machines = equipment.filter((e) => e.type === 'washer' || e.type === 'dryer')

  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-800">Simulate a machine tap</p>
      </div>
      <p className="text-xs text-amber-700">Use this to test the tap flow before the webhook is configured.</p>
      <div className="flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none"
        >
          <option value="">Select a machine…</option>
          {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button
          disabled={!selectedId || simulate.isPending}
          onClick={() => simulate.mutate({ equipment_id: selectedId })}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
        >
          {simulate.isPending ? 'Sending…' : 'Tap'}
        </button>
      </div>
    </div>
  )
}

const EQUIP_ICON: Record<string, React.ElementType> = {
  washer: WashingMachine, dryer: Wind, folding: FoldVertical,
}

function DeviceIdRow({ id, name, type, nayaxDeviceId }: {
  id: string; name: string; type: string; nayaxDeviceId: string | null
}) {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(nayaxDeviceId ?? '')
  const update = trpc.equipment.update.useMutation({
    onSuccess: () => { utils.equipment.list.invalidate(); setEditing(false); toast.success('Saved') },
    onError: (e) => toast.error(e.message),
  })
  const Icon = EQUIP_ICON[type] ?? WashingMachine

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="w-32 shrink-0 text-sm font-medium text-gray-800">{name}</span>
      {editing ? (
        <>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nayax device ID"
            className="h-7 flex-1 font-mono text-xs" autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') update.mutate({ id, nayax_device_id: draft.trim() || null })
              if (e.key === 'Escape') { setDraft(nayaxDeviceId ?? ''); setEditing(false) }
            }} />
          <button onClick={() => update.mutate({ id, nayax_device_id: draft.trim() || null })}
            className="text-green-600 hover:text-green-700" disabled={update.isPending}>
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(nayaxDeviceId ?? ''); setEditing(false) }} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          className="flex-1 text-left text-xs font-mono text-gray-500 hover:text-gray-800 truncate">
          {nayaxDeviceId ?? <span className="text-gray-300 not-italic">Click to set device ID…</span>}
        </button>
      )}
      {!editing && nayaxDeviceId && <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" title="Linked" />}
    </div>
  )
}

function CardIdRow({ id, displayName, email, nayaxCardId }: {
  id: string; displayName: string; email: string; nayaxCardId: string | null
}) {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(nayaxCardId ?? '')
  const update = trpc.nayax.updateStaffCard.useMutation({
    onSuccess: () => { utils.nayax.listStaff.invalidate(); setEditing(false); toast.success('Saved') },
    onError: (e) => toast.error(e.message),
  })
  const initials = displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
        {initials}
      </div>
      <div className="w-36 shrink-0 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
        <p className="text-[10px] text-gray-400 truncate">{email}</p>
      </div>
      {editing ? (
        <>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nayax card ID"
            className="h-7 flex-1 font-mono text-xs" autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') update.mutate({ member_id: id, nayax_card_id: draft.trim() || null })
              if (e.key === 'Escape') { setDraft(nayaxCardId ?? ''); setEditing(false) }
            }} />
          <button onClick={() => update.mutate({ member_id: id, nayax_card_id: draft.trim() || null })}
            className="text-green-600 hover:text-green-700" disabled={update.isPending}>
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(nayaxCardId ?? ''); setEditing(false) }} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          className="flex-1 text-left text-xs font-mono text-gray-500 hover:text-gray-800 truncate">
          {nayaxCardId ?? <span className="text-gray-300">Click to set card ID…</span>}
        </button>
      )}
      {!editing && nayaxCardId && <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" title="Linked" />}
    </div>
  )
}

function NayaxSection() {
  const { data: equipment = [] } = trpc.equipment.list.useQuery(undefined)
  const { data: staff = [] } = trpc.nayax.listStaff.useQuery()
  const linked = (equipment as { nayax_device_id?: string | null }[]).filter((e) => e.nayax_device_id).length

  return (
    <IntegrationCard
      icon={Zap}
      iconBg="bg-blue-50 border-blue-100"
      iconColor="text-blue-600"
      title="Nayax"
      description="Payment terminals — link machines and staff cards"
      statusLabel={linked > 0 ? `${linked} device${linked > 1 ? 's' : ''} linked` : 'Not configured'}
      statusColor={linked > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
      defaultOpen
    >
      <SimulateTapPanel equipment={equipment} />

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-gray-600">Webhook URL (configure in Nayax Spark portal)</p>
        <p className="font-mono text-xs text-gray-800 break-all select-all">
          {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/nayax
        </p>
        <p className="text-[10px] text-gray-400">
          Set <code className="bg-gray-200 px-1 rounded">NAYAX_WEBHOOK_SECRET</code> in your environment and pass it as{' '}
          <code className="bg-gray-200 px-1 rounded">x-nayax-secret</code> header for verification.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Machines → Nayax Device IDs</h3>
          <p className="text-xs text-gray-500 mt-0.5">Find the device ID in your Nayax operator portal under Devices.</p>
        </div>
        {equipment.length === 0 ? (
          <p className="text-sm text-gray-400">No equipment set up yet — add machines in the Machines tab first.</p>
        ) : (
          <div className="space-y-2">
            {equipment.map((e) => (
              <DeviceIdRow key={e.id} id={e.id} name={e.name} type={e.type}
                nayaxDeviceId={(e as { nayax_device_id?: string | null }).nayax_device_id ?? null} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Staff → Nayax Card IDs</h3>
          <p className="text-xs text-gray-500 mt-0.5">The card ID printed on each pre-paid card, or found in your Nayax portal.</p>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-gray-400">No staff members found.</p>
        ) : (
          <div className="space-y-2">
            {(staff as { id: string; display_name: string; email: string; nayax_card_id: string | null }[]).map((m) => (
              <CardIdRow key={m.id} id={m.id} displayName={m.display_name} email={m.email} nayaxCardId={m.nayax_card_id} />
            ))}
          </div>
        )}
      </div>
    </IntegrationCard>
  )
}

// ─── Stripe section ───────────────────────────────────────────────────────────

function StripeSection() {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()

  const isConnected = !!(tenant?.stripe_customer_id)
  const plan = tenant?.plan ?? '—'
  const status = tenant?.status ?? '—'

  return (
    <IntegrationCard
      icon={CreditCard}
      iconBg="bg-violet-50 border-violet-100"
      iconColor="text-violet-600"
      title="Stripe"
      description="Subscription billing and online payment links"
      statusLabel={isConnected ? `${plan} · ${status}` : 'Not connected'}
      statusColor={isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-gray-500">Plan</span>
            <span className="text-xs font-semibold text-gray-900 capitalize">{plan}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <span className={`text-xs font-semibold capitalize ${status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>{status}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-gray-500">Customer ID</span>
            <span className="text-xs font-mono text-gray-500 truncate max-w-[160px]">
              {tenant?.stripe_customer_id ?? <span className="text-gray-300">not set</span>}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-600">Webhook URL (configure in Stripe Dashboard)</p>
          <p className="font-mono text-xs text-gray-800 break-all select-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/stripe
          </p>
          <p className="text-[10px] text-gray-400">
            Events needed: <code className="bg-gray-200 px-1 rounded">checkout.session.completed</code>,{' '}
            <code className="bg-gray-200 px-1 rounded">customer.subscription.updated</code>,{' '}
            <code className="bg-gray-200 px-1 rounded">customer.subscription.deleted</code>
          </p>
        </div>
      </div>
    </IntegrationCard>
  )
}

// ─── Quo / OpenPhone section ──────────────────────────────────────────────────

function QuoSection() {
  return (
    <IntegrationCard
      icon={MessageSquare}
      iconBg="bg-emerald-50 border-emerald-100"
      iconColor="text-emerald-600"
      title="Quo / OpenPhone"
      description="SMS messaging — inbound and outbound customer messages"
      statusLabel="Active"
      statusColor="bg-green-100 text-green-700"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-600">Inbound webhook URL (configure in OpenPhone portal)</p>
          <p className="font-mono text-xs text-gray-800 break-all select-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/quo?secret=lndry_wh_2024
          </p>
          <p className="text-[10px] text-gray-400">
            In OpenPhone → Settings → Webhooks, add this URL and select the{' '}
            <code className="bg-gray-200 px-1 rounded">message.received</code> event.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-gray-500">Outbound from number</span>
            <span className="text-xs font-mono text-gray-900">+1 (226) 910-1193</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-gray-500">Provider</span>
            <span className="text-xs text-gray-600">Quo API (OpenPhone)</span>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          To switch to Twilio or another provider, update the <code className="bg-gray-200 px-1 rounded">QUO_API_KEY</code> and{' '}
          <code className="bg-gray-200 px-1 rounded">QUO_FROM_NUMBER</code> environment variables.
        </p>
      </div>
    </IntegrationCard>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Integrations</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure third-party services connected to your store</p>
      </div>
      <NayaxSection />
      <StripeSection />
      <QuoSection />
    </div>
  )
}
