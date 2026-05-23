'use client'

import { useState, useMemo } from 'react'
import { Plus, X, Pencil, Building2, User, ChevronDown, ChevronUp, Users } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ─── Business Account Form ────────────────────────────────────────────────────

interface BAForm {
  name:               string
  email:              string
  phone:              string
  address:            string
  city:               string
  province:           string
  postal_code:        string
  payment_terms_days: string
  notes:              string
}

const EMPTY_FORM: BAForm = {
  name: '', email: '', phone: '', address: '', city: '',
  province: '', postal_code: '', payment_terms_days: '30', notes: '',
}

function BAModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: { id: string } & Partial<BAForm>
  onClose: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const [form, setForm] = useState<BAForm>({
    ...EMPTY_FORM,
    ...initial,
    payment_terms_days: String(initial?.payment_terms_days ?? 30),
  })
  const set = (k: keyof BAForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = trpc.businessAccounts.create.useMutation({
    onSuccess: () => { utils.businessAccounts.list.invalidate(); toast.success('Business account created'); onSaved() },
    onError: (e) => toast.error(e.message),
  })
  const update = trpc.businessAccounts.update.useMutation({
    onSuccess: () => { utils.businessAccounts.list.invalidate(); toast.success('Account updated'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name:               form.name.trim(),
      email:              form.email.trim() || null,
      phone:              form.phone.trim() || null,
      address:            form.address.trim() || null,
      city:               form.city.trim() || null,
      province:           form.province.trim() || null,
      postal_code:        form.postal_code.trim() || null,
      payment_terms_days: parseInt(form.payment_terms_days) || 30,
      notes:              form.notes.trim() || null,
    }
    if (initial?.id) {
      update.mutate({ id: initial.id, ...payload })
    } else {
      create.mutate(payload)
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {initial?.id ? 'Edit Business Account' : 'New Business Account'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required
              placeholder="Acme Property Management"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="billing@company.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="(519) 555-0100"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Address</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)}
              placeholder="123 Main St"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">City</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Province</label>
              <input value={form.province} onChange={(e) => set('province', e.target.value)} placeholder="ON"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Postal</label>
              <input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="N4K 1A1"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Payment Terms (days)</label>
            <div className="flex gap-2">
              {['15', '30', '45', '60'].map((d) => (
                <button type="button" key={d} onClick={() => set('payment_terms_days', d)}
                  className={cn('flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors',
                    form.payment_terms_days === d
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                  Net {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
              placeholder="Internal notes about this account…"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={!form.name.trim() || isPending}
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              {isPending ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Assign Customer Modal ────────────────────────────────────────────────────

function AssignCustomerModal({
  businessAccount,
  onClose,
}: {
  businessAccount: { id: string; name: string; customers: { id: string; first_name: string; last_name: string }[] }
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [search, setSearch] = useState('')
  const { data: allCustomers = [] } = trpc.customers.list.useQuery(undefined)

  const existingIds = new Set(businessAccount.customers.map((c) => c.id))

  const filtered = useMemo(() =>
    (allCustomers as { id: string; first_name: string; last_name: string; email?: string | null }[])
      .filter((c) => {
        if (existingIds.has(c.id)) return false
        const q = search.toLowerCase()
        return `${c.first_name} ${c.last_name} ${c.email ?? ''}`.toLowerCase().includes(q)
      }).slice(0, 10),
    [allCustomers, search, existingIds]
  )

  const assign = trpc.businessAccounts.assignCustomer.useMutation({
    onSuccess: () => { utils.businessAccounts.list.invalidate(); toast.success('Customer assigned') },
    onError: (e) => toast.error(e.message),
  })
  const unassign = trpc.businessAccounts.unassignCustomer.useMutation({
    onSuccess: () => { utils.businessAccounts.list.invalidate(); toast.success('Customer removed') },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Manage Customers</h2>
            <p className="text-xs text-gray-500 mt-0.5">{businessAccount.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current customers */}
          {businessAccount.customers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Current Customers</p>
              <div className="space-y-1.5">
                {businessAccount.customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-brand-50 border border-brand-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-brand-500" />
                      <span className="text-sm font-medium text-gray-800">{c.first_name} {c.last_name}</span>
                    </div>
                    <button onClick={() => unassign.mutate({ customer_id: c.id })}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add customer */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Add Customer</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-1.5" />
            {filtered.length > 0 ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {filtered.map((c) => (
                  <button key={c.id}
                    onClick={() => { assign.mutate({ business_account_id: businessAccount.id, customer_id: c.id }); setSearch('') }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <User className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="flex-1">{c.first_name} {c.last_name}</span>
                    {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                  </button>
                ))}
              </div>
            ) : search ? (
              <p className="text-xs text-gray-400 px-1">No matching customers</p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Business Account Row ─────────────────────────────────────────────────────

function BARow({ account }: {
  account: {
    id: string; name: string; email: string | null; phone: string | null
    payment_terms_days: number; is_active: boolean; notes: string | null
    customers: { id: string; first_name: string; last_name: string; email?: string | null }[]
  }
}) {
  const utils = trpc.useUtils()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [managingCustomers, setManagingCustomers] = useState(false)

  const deactivate = trpc.businessAccounts.delete.useMutation({
    onSuccess: () => { utils.businessAccounts.list.invalidate(); toast.success('Account deactivated') },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{account.name}</p>
            <p className="text-xs text-gray-400">
              {account.customers.length} customer{account.customers.length !== 1 ? 's' : ''} · Net {account.payment_terms_days}
              {account.email ? ` · ${account.email}` : ''}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
        </button>

        {expanded && (
          <div className="border-t border-gray-100 px-4 pb-3 pt-2 space-y-2">
            {account.customers.length === 0 ? (
              <p className="text-xs text-gray-400">No customers linked yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {account.customers.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    <User className="h-3 w-3" />
                    {c.first_name} {c.last_name}
                  </span>
                ))}
              </div>
            )}
            {account.notes && <p className="text-xs text-gray-500 italic">{account.notes}</p>}
            <div className="flex gap-1.5 pt-1">
              <button onClick={() => setManagingCustomers(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 bg-white">
                <Users className="h-3.5 w-3.5" /> Customers
              </button>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 bg-white">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={() => { if (confirm('Deactivate this account?')) deactivate.mutate({ id: account.id }) }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 hover:border-red-200 bg-white ml-auto">
                Deactivate
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <BAModal
          initial={{
            id:                  account.id,
            name:                account.name,
            email:               account.email ?? '',
            phone:               account.phone ?? '',
            address:             '',
            city:                '',
            province:            '',
            postal_code:         '',
            payment_terms_days:  String(account.payment_terms_days),
            notes:               account.notes ?? '',
          }}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {managingCustomers && (
        <AssignCustomerModal
          businessAccount={account}
          onClose={() => setManagingCustomers(false)}
        />
      )}
    </>
  )
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function BusinessAccountsTab() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: accounts = [], isLoading } = trpc.businessAccounts.list.useQuery()

  const rows = accounts as {
    id: string; name: string; email: string | null; phone: string | null
    payment_terms_days: number; is_active: boolean; notes: string | null
    customers: { id: string; first_name: string; last_name: string; email?: string | null }[]
  }[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Business Accounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">Companies and property managers that receive consolidated invoices</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New Account
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
          <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-500">No business accounts yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Create one to start invoicing companies and property managers</p>
          <button onClick={() => setShowCreate(true)}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Create Account
          </button>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((account) => <BARow key={account.id} account={account} />)}
      </div>

      {showCreate && (
        <BAModal onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
    </div>
  )
}
