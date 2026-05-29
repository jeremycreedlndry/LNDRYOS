'use client'

import { useState } from 'react'
import { Plus, X, Check, Trash2, Pencil, ToggleLeft, ToggleRight, Clock, WashingMachine, Wind, Search, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { StaffPermissions, StaffRole } from '@laundry/db'

// ─── Permission definitions ───────────────────────────────────────────────────

const PERMISSION_DEFS: { key: keyof StaffPermissions; label: string; description: string }[] = [
  { key: 'pos',              label: 'POS',                      description: 'Create orders and process payments' },
  { key: 'orders',           label: 'Orders',                   description: 'View and manage all orders' },
  { key: 'delete_orders',    label: 'Delete Orders',            description: 'Permanently remove orders from the system' },
  { key: 'edit_paid_orders', label: 'Edit Paid Orders',         description: 'Modify orders that have already been paid' },
  { key: 'customers',        label: 'Customers',                description: 'View and edit customer records' },
  { key: 'add_customers',    label: 'Add Customers',            description: 'Create new customer profiles' },
  { key: 'edit_customers',   label: 'Edit Customers',           description: 'Edit existing customer profiles and preferences' },
  { key: 'add_credits',      label: 'Add Credits',              description: 'Add credits or adjustments to customer accounts' },
  { key: 'manage_invoices',  label: 'Manage Invoices',          description: 'Create, edit, and send customer invoices' },
  { key: 'reports',          label: 'Reports',                  description: 'View sales and activity reports' },
  { key: 'settings',         label: 'Settings',                 description: 'Manage store settings and catalog' },
  { key: 'staff',            label: 'Staff',                    description: 'Invite and manage staff members' },
  { key: 'equipment',        label: 'Equipment',                description: 'View and manage machines' },
]

const ROLE_LABELS: Record<StaffRole, string> = {
  owner:   'Owner',
  manager: 'Manager',
  staff:   'Staff',
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

interface CreateForm {
  display_name: string
  email: string
  password: string
  password_confirm: string
  phone: string
  role: StaffRole
  hourly_rate: string
}

function CreateStaffModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils()
  const [form, setForm] = useState<CreateForm>({
    display_name: '', email: '', password: '', password_confirm: '', phone: '', role: 'staff', hourly_rate: '',
  })
  const set = (k: keyof CreateForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = trpc.staff.invite.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); toast.success('Staff member created'); onClose() },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (form.password !== form.password_confirm) { toast.error('Passwords do not match'); return }
    const hourly_rate_cents = form.hourly_rate ? Math.round(parseFloat(form.hourly_rate) * 100) : undefined
    create.mutate({
      display_name: form.display_name.trim(),
      email:        form.email.trim(),
      password:     form.password,
      phone:        form.phone.trim() || undefined,
      role:         form.role,
      hourly_rate_cents,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Create staff member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input value={form.display_name} onChange={(e) => set('display_name', e.target.value)}
              placeholder="Jane Smith" required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              placeholder="jane@example.com" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
                placeholder="Min 8 characters" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm</label>
              <Input type="password" value={form.password_confirm} onChange={(e) => set('password_confirm', e.target.value)}
                placeholder="Repeat password" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly rate ($)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0"
                value={form.hourly_rate} onChange={(e) => set('hourly_rate', e.target.value)}
                placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex gap-2">
              {(['staff', 'manager', 'owner'] as StaffRole[]).map((r) => (
                <button key={r} type="button" onClick={() => set('role', r)}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                    form.role === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={create.isPending} className="flex-1">
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Permissions editor ───────────────────────────────────────────────────────

function PermissionsModal({
  member,
  onClose,
}: {
  member: { id: string; display_name: string; role: StaffRole; permissions: StaffPermissions }
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [perms, setPerms] = useState<StaffPermissions>({ ...member.permissions })
  const isOwner = member.role === 'owner'

  const update = trpc.staff.update.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); toast.success('Permissions saved'); onClose() },
    onError: (e) => toast.error(e.message),
  })

  const toggle = (key: keyof StaffPermissions) => {
    if (isOwner) return
    setPerms((p) => ({ ...p, [key]: !p[key] }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Permissions</h2>
            <p className="text-xs text-gray-400 mt-0.5">{member.display_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-1 overflow-y-auto max-h-[60vh]">
          {isOwner && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Owners have full access to all features.
            </p>
          )}
          {PERMISSION_DEFS.map(({ key, label, description }) => {
            const enabled = isOwner || !!perms[key]
            return (
              <div key={key} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400">{description}</p>
                </div>
                <button onClick={() => toggle(key)} disabled={isOwner}
                  className={`transition-colors ${enabled ? 'text-brand-600' : 'text-gray-300'} ${isOwner ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}>
                  {enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              </div>
            )
          })}
        </div>
        {!isOwner && (
          <div className="border-t border-gray-100 px-6 py-4 flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={() => update.mutate({ id: member.id, permissions: perms })}
              disabled={update.isPending} className="flex-1">
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
        {isOwner && (
          <div className="border-t border-gray-100 px-6 py-4">
            <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit member modal ────────────────────────────────────────────────────────

function LastMachineUsed({ memberId }: { memberId: string }) {
  const [enabled, setEnabled] = useState(false)
  const { data, isFetching, refetch } = trpc.nayax.getLastMachineUsed.useQuery(
    { member_id: memberId, minutes: 480 },
    { enabled, staleTime: 0 }
  )

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return `Today ${fmtTime(iso)}`
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' + fmtTime(iso)
  }

  const firstEquip = Array.isArray(data?.equipment) ? data.equipment[0] : data?.equipment
  const MachineIcon = firstEquip?.type === 'dryer' ? Wind : WashingMachine

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Last machine used</p>
        <button
          type="button"
          onClick={() => { setEnabled(true); refetch() }}
          disabled={isFetching}
          className="flex items-center gap-1 rounded-md bg-white border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:opacity-50"
        >
          <Search className="h-3 w-3" />
          {isFetching ? 'Checking…' : 'Check'}
        </button>
      </div>
      {enabled && !isFetching && (
        data ? (
          <div className="flex items-center gap-2">
            <MachineIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{data.machine_name}</p>
              {data.authorized_at && (
                <p className="text-xs text-gray-400">{fmtDate(data.authorized_at)}{data.amount ? ` · $${data.amount.toFixed(2)}` : ''}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No machine activity in the last 8 hours.</p>
        )
      )}
    </div>
  )
}

function EditModal({
  member,
  onClose,
}: {
  member: { id: string; display_name: string; email: string; phone: string | null; role: StaffRole; hourly_rate_cents: number | null; nayax_card_id?: string | null }
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [form, setForm] = useState({
    display_name: member.display_name,
    phone: member.phone ?? '',
    role: member.role,
    hourly_rate: member.hourly_rate_cents !== null ? (member.hourly_rate_cents / 100).toFixed(2) : '',
  })
  const [cardDraft, setCardDraft] = useState(member.nayax_card_id ?? '')
  const [cardEditing, setCardEditing] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const update = trpc.staff.update.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); toast.success('Saved'); onClose() },
    onError: (e) => toast.error(e.message),
  })

  const setPassword = trpc.staff.setPassword.useMutation({
    onSuccess: () => { toast.success('Password updated'); setPwOpen(false); setPw(''); setPwConfirm('') },
    onError: (e) => toast.error(e.message),
  })

  const updateCard = trpc.nayax.updateStaffCard.useMutation({
    onSuccess: () => { utils.nayax.listStaff.invalidate(); setCardEditing(false); toast.success('Card ID saved') },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const hourly_rate_cents = form.hourly_rate ? Math.round(parseFloat(form.hourly_rate) * 100) : null
    update.mutate({
      id: member.id,
      display_name: form.display_name.trim(),
      phone: form.phone.trim() || null,
      role: form.role as StaffRole,
      hourly_rate_cents,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Edit staff member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input value={form.display_name} onChange={(e) => set('display_name', e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly rate ($)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0"
                value={form.hourly_rate} onChange={(e) => set('hourly_rate', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex gap-2">
              {(['staff', 'manager', 'owner'] as StaffRole[]).map((r) => (
                <button key={r} type="button" onClick={() => set('role', r)}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                    form.role === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Nayax card ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nayax card ID</label>
            {cardEditing ? (
              <div className="flex gap-2">
                <Input
                  value={cardDraft}
                  onChange={(e) => setCardDraft(e.target.value)}
                  placeholder="Card ID"
                  className="font-mono text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); updateCard.mutate({ member_id: member.id, nayax_card_id: cardDraft.trim() || null }) }
                    if (e.key === 'Escape') { setCardDraft(member.nayax_card_id ?? ''); setCardEditing(false) }
                  }}
                />
                <button type="button" onClick={() => updateCard.mutate({ member_id: member.id, nayax_card_id: cardDraft.trim() || null })}
                  disabled={updateCard.isPending} className="text-green-600 hover:text-green-700 px-1">
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { setCardDraft(member.nayax_card_id ?? ''); setCardEditing(false) }}
                  className="text-gray-400 hover:text-gray-600 px-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCardEditing(true)}
                className="w-full text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 hover:border-gray-300">
                {member.nayax_card_id ?? <span className="text-gray-300 not-italic font-sans">Click to set…</span>}
              </button>
            )}
          </div>

          {/* Set password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button
                type="button"
                onClick={() => { setPwOpen((o) => !o); setPw(''); setPwConfirm('') }}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {pwOpen ? 'Cancel' : 'Set password'}
              </button>
            </div>
            {pwOpen && (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                  <Input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Min 8 characters"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>
                  <Input
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Repeat password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return }
                        if (pw !== pwConfirm) { toast.error('Passwords do not match'); return }
                        setPassword.mutate({ id: member.id, password: pw })
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={setPassword.isPending || pw.length < 8 || pw !== pwConfirm}
                  onClick={() => {
                    if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return }
                    if (pw !== pwConfirm) { toast.error('Passwords do not match'); return }
                    setPassword.mutate({ id: member.id, password: pw })
                  }}
                >
                  {setPassword.isPending ? 'Saving…' : 'Update password'}
                </Button>
              </div>
            )}
          </div>

          {/* Last machine used */}
          <LastMachineUsed memberId={member.id} />

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={update.isPending} className="flex-1">
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Time entries drawer ──────────────────────────────────────────────────────

function TimeEntriesModal({
  member,
  onClose,
}: {
  member: { user_id: string; display_name: string }
  onClose: () => void
}) {
  const { data: entries = [], isLoading } = trpc.staff.timeEntries.useQuery({ user_id: member.user_id })

  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })

  const calcHours = (inAt: string, outAt: string | null) => {
    if (!outAt) return null
    return ((new Date(outAt).getTime() - new Date(inAt).getTime()) / 3600000).toFixed(1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Time entries</h2>
            <p className="text-xs text-gray-400 mt-0.5">{member.display_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No time entries yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2.5 px-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{fmtDate(e.clocked_in_at)}</p>
                    <p className="text-xs text-gray-400">
                      {fmtTime(e.clocked_in_at)} → {e.clocked_out_at ? fmtTime(e.clocked_out_at) : <span className="text-green-600 font-medium">Active</span>}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-gray-700 tabular-nums">
                    {calcHours(e.clocked_in_at, e.clocked_out_at) !== null
                      ? `${calcHours(e.clocked_in_at, e.clocked_out_at)}h`
                      : <span className="text-green-600">In</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Staff tab ────────────────────────────────────────────────────────────────

export function StaffTab() {
  const utils = trpc.useUtils()
  const { data: members = [], isLoading } = trpc.staff.list.useQuery()
  const [showInvite, setShowInvite] = useState(false)
  const [editingPerms, setEditingPerms] = useState<typeof members[0] | null>(null)
  const [editingMember, setEditingMember] = useState<typeof members[0] | null>(null)
  const [viewingTime, setViewingTime] = useState<typeof members[0] | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

  const removeMember = trpc.staff.remove.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); setRemoveConfirm(null); toast.success('Removed') },
    onError: (e) => toast.error(e.message),
  })

  const toggleActive = trpc.staff.update.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Staff & Users</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage team members, roles, and permissions</p>
        </div>
        <Button onClick={() => setShowInvite(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Create
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
          <p className="text-sm text-gray-400">No staff yet. <button onClick={() => setShowInvite(true)} className="text-brand-600 hover:underline">Add someone</button></p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-brand-700">
                  {m.display_name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${m.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {m.display_name}
                  </p>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {ROLE_LABELS[m.role as StaffRole]}
                  </span>
                  {!m.is_active && (
                    <span className="text-xs text-red-400 bg-red-50 px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">{m.email}{m.hourly_rate_cents ? ` · ${formatCurrency(m.hourly_rate_cents)}/hr` : ''}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button onClick={() => setViewingTime(m)} className="text-gray-400 hover:text-gray-600 p-1" title="Time entries">
                  <Clock className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingPerms(m)} className="text-xs font-medium text-brand-600 hover:text-brand-700 px-2 py-1">
                  Perms
                </button>
                <button onClick={() => setEditingMember(m)} className="text-gray-400 hover:text-gray-600 p-1">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => toggleActive.mutate({ id: m.id, is_active: !m.is_active })}
                  className={`transition-colors p-0.5 ${m.is_active ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}>
                  {m.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                {removeConfirm === m.id ? (
                  <div className="flex items-center gap-1 ml-1">
                    <button onClick={() => removeMember.mutate({ id: m.id })} className="text-red-500"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setRemoveConfirm(null)} className="text-gray-400"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setRemoveConfirm(m.id)} className="text-gray-300 hover:text-red-500 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showInvite   && <CreateStaffModal onClose={() => setShowInvite(false)} />}
      {editingPerms && <PermissionsModal member={editingPerms} onClose={() => setEditingPerms(null)} />}
      {editingMember && <EditModal member={editingMember} onClose={() => setEditingMember(null)} />}
      {viewingTime  && <TimeEntriesModal member={viewingTime} onClose={() => setViewingTime(null)} />}
    </div>
  )
}
