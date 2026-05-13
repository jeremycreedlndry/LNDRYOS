'use client'

import { useState } from 'react'
import { Check, X, WashingMachine, Wind, FoldVertical, Zap, FlaskConical } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

function SimulateTapPanel({ equipment }: { equipment: { id: string; name: string; type: string }[] }) {
  const [selectedId, setSelectedId] = useState('')
  const simulate = trpc.nayax.simulateTap.useMutation({
    onSuccess: () => {
      window.dispatchEvent(new CustomEvent('nayax:simulated-tap'))
    },
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
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
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
  washer: WashingMachine,
  dryer: Wind,
  folding: FoldVertical,
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
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nayax device ID"
            className="h-7 flex-1 font-mono text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') update.mutate({ id, nayax_device_id: draft.trim() || null })
              if (e.key === 'Escape') { setDraft(nayaxDeviceId ?? ''); setEditing(false) }
            }}
          />
          <button onClick={() => update.mutate({ id, nayax_device_id: draft.trim() || null })}
            className="text-green-600 hover:text-green-700" disabled={update.isPending}>
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(nayaxDeviceId ?? ''); setEditing(false) }}
            className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          className="flex-1 text-left text-xs font-mono text-gray-500 hover:text-gray-800 truncate">
          {nayaxDeviceId ?? <span className="text-gray-300 not-italic">Click to set device ID…</span>}
        </button>
      )}
      {!editing && nayaxDeviceId && (
        <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" title="Linked" />
      )}
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
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nayax card ID"
            className="h-7 flex-1 font-mono text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') update.mutate({ member_id: id, nayax_card_id: draft.trim() || null })
              if (e.key === 'Escape') { setDraft(nayaxCardId ?? ''); setEditing(false) }
            }}
          />
          <button onClick={() => update.mutate({ member_id: id, nayax_card_id: draft.trim() || null })}
            className="text-green-600 hover:text-green-700" disabled={update.isPending}>
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(nayaxCardId ?? ''); setEditing(false) }}
            className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          className="flex-1 text-left text-xs font-mono text-gray-500 hover:text-gray-800 truncate">
          {nayaxCardId ?? <span className="text-gray-300">Click to set card ID…</span>}
        </button>
      )}
      {!editing && nayaxCardId && (
        <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" title="Linked" />
      )}
    </div>
  )
}

export function NayaxTab() {
  const { data: equipment = [] } = trpc.equipment.list.useQuery(undefined)
  const { data: staff = [] } = trpc.nayax.listStaff.useQuery()

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
          <Zap className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Nayax Integration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Link your Nayax terminals and staff cards so machine taps automatically prompt order assignment.
          </p>
        </div>
      </div>

      {/* Simulate tap */}
      <SimulateTapPanel equipment={equipment} />

      {/* Webhook info */}
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

      {/* Machine → Device ID */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Machines → Nayax Device IDs</h3>
          <p className="text-xs text-gray-500 mt-0.5">Find the device ID in your Nayax operator portal under Devices.</p>
        </div>
        {equipment.length === 0 ? (
          <p className="text-sm text-gray-400">No equipment set up yet — add machines in the Equipment tab first.</p>
        ) : (
          <div className="space-y-2">
            {equipment.map((e) => (
              <DeviceIdRow
                key={e.id}
                id={e.id}
                name={e.name}
                type={e.type}
                nayaxDeviceId={(e as { nayax_device_id?: string | null }).nayax_device_id ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Staff → Card ID */}
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
              <CardIdRow
                key={m.id}
                id={m.id}
                displayName={m.display_name}
                email={m.email}
                nayaxCardId={m.nayax_card_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
