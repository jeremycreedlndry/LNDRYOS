'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Create / Edit modal ──────────────────────────────────────────────────────

interface PromoForm {
  id?: string
  code: string
  description: string
  discount_type: 'percent' | 'flat'
  discount_value: string
  max_uses: string
  max_uses_per_customer: string
  expires_at: string
}

const EMPTY_FORM: PromoForm = {
  code: '', description: '', discount_type: 'percent',
  discount_value: '', max_uses: '', max_uses_per_customer: '', expires_at: '',
}

function PromoModal({ initial, onClose, onSaved }: {
  initial?: PromoForm
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<PromoForm>(initial ?? EMPTY_FORM)
  const set = (k: keyof PromoForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const utils = trpc.useUtils()
  const create = trpc.promoCodes.create.useMutation({
    onSuccess: () => { utils.promoCodes.list.invalidate(); toast.success('Promo code created'); onSaved() },
    onError: (e) => toast.error(e.message),
  })
  const update = trpc.promoCodes.update.useMutation({
    onSuccess: () => { utils.promoCodes.list.invalidate(); toast.success('Promo code updated'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  const isPending = create.isPending || update.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseInt(form.discount_value, 10)
    if (!form.code.trim()) { toast.error('Code is required'); return }
    if (isNaN(val) || val <= 0) { toast.error('Enter a valid discount value'); return }
    if (form.discount_type === 'percent' && val > 100) { toast.error('Percent cannot exceed 100'); return }

    const payload = {
      code:                  form.code,
      description:           form.description || undefined,
      discount_type:         form.discount_type,
      discount_value:        form.discount_type === 'flat' ? Math.round(val * 100) : val,
      max_uses:              form.max_uses ? parseInt(form.max_uses, 10) : null,
      max_uses_per_customer: form.max_uses_per_customer ? parseInt(form.max_uses_per_customer, 10) : null,
      expires_at:            form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }

    if (form.id) {
      update.mutate({ id: form.id, ...payload })
    } else {
      create.mutate(payload)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{form.id ? 'Edit promo code' : 'New promo code'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code <span className="text-red-500">*</span></label>
            <Input
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER10"
              className="font-mono uppercase"
              autoFocus={!form.id}
            />
            <p className="text-xs text-gray-400 mt-1">Customers enter this at checkout. Auto-uppercased.</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 10% off all orders" />
          </div>

          {/* Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Discount <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                {(['percent', 'flat'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set('discount_type', t)}
                    className={`px-4 py-2 transition-colors ${form.discount_type === t ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {t === 'percent' ? '% Off' : '$ Off'}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {form.discount_type === 'percent' ? '%' : '$'}
                </span>
                <Input
                  type="number" inputMode="decimal" min="1" max={form.discount_type === 'percent' ? 100 : undefined}
                  value={form.discount_value}
                  onChange={(e) => set('discount_value', e.target.value)}
                  placeholder={form.discount_type === 'percent' ? '10' : '5.00'}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          {/* Usage limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total uses</label>
              <Input
                type="number" min="1" value={form.max_uses}
                onChange={(e) => set('max_uses', e.target.value)}
                placeholder="Unlimited"
              />
              <p className="text-xs text-gray-400 mt-0.5">Leave blank for unlimited</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per customer</label>
              <Input
                type="number" min="1" value={form.max_uses_per_customer}
                onChange={(e) => set('max_uses_per_customer', e.target.value)}
                placeholder="Unlimited"
              />
              <p className="text-xs text-gray-400 mt-0.5">1 = one use per customer</p>
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expires <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input type="date" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)}
              min={new Date().toISOString().split('T')[0]} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isPending} className="flex-1">{isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function PromoCodesTab() {
  const utils = trpc.useUtils()
  const { data: codes = [], isLoading } = trpc.promoCodes.list.useQuery()
  const [modal, setModal] = useState<PromoForm | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const updateCode = trpc.promoCodes.update.useMutation({
    onSuccess: () => utils.promoCodes.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })
  const deleteCode = trpc.promoCodes.delete.useMutation({
    onSuccess: () => { utils.promoCodes.list.invalidate(); setDeleteConfirm(null) },
    onError: (e) => toast.error(e.message),
  })

  const formatDiscount = (code: { discount_type: string; discount_value: number }) => {
    if (code.discount_type === 'percent') return `${code.discount_value}% off`
    return `${formatCurrency(code.discount_value)} off`
  }

  const formatLimit = (code: { max_uses: number | null; max_uses_per_customer: number | null; use_count: number }) => {
    const parts: string[] = []
    if (code.max_uses != null) parts.push(`${code.use_count}/${code.max_uses} uses`)
    else parts.push(`${code.use_count} uses`)
    if (code.max_uses_per_customer === 1) parts.push('once per customer')
    else if (code.max_uses_per_customer != null) parts.push(`${code.max_uses_per_customer}× per customer`)
    return parts.join(' · ')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Promo Codes</h2>
          <p className="text-sm text-gray-500 mt-0.5">Discount codes applied at checkout</p>
        </div>
        <Button onClick={() => setModal(EMPTY_FORM)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New code
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : codes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <Tag className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No promo codes yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a code to offer discounts at checkout</p>
          <Button onClick={() => setModal(EMPTY_FORM)} variant="outline" size="sm" className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" /> Create first code
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {codes.map((code) => (
            <div key={code.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono text-sm font-semibold ${code.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                    {code.code}
                  </span>
                  <span className="rounded-full bg-brand-50 border border-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    {formatDiscount(code)}
                  </span>
                  {code.expires_at && new Date(code.expires_at) < new Date() && (
                    <span className="rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Expired</span>
                  )}
                  {code.expires_at && new Date(code.expires_at) >= new Date() && (
                    <span className="text-xs text-gray-400">
                      expires {new Date(code.expires_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatLimit(code)}{code.description ? ` · ${code.description}` : ''}</p>
              </div>

              {/* Toggle */}
              <button
                onClick={() => updateCode.mutate({ id: code.id, is_active: !code.is_active })}
                className={`transition-colors ${code.is_active ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}
              >
                {code.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
              </button>

              {/* Edit */}
              <button
                onClick={() => setModal({
                  id: code.id,
                  code: code.code,
                  description: code.description ?? '',
                  discount_type: code.discount_type as 'percent' | 'flat',
                  discount_value: code.discount_type === 'flat'
                    ? (code.discount_value / 100).toFixed(2)
                    : String(code.discount_value),
                  max_uses: code.max_uses != null ? String(code.max_uses) : '',
                  max_uses_per_customer: code.max_uses_per_customer != null ? String(code.max_uses_per_customer) : '',
                  expires_at: code.expires_at ? code.expires_at.split('T')[0] : '',
                })}
                className="text-gray-400 hover:text-gray-600"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {/* Delete */}
              {deleteConfirm === code.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => deleteCode.mutate({ id: code.id })} className="text-red-500"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-gray-400"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(code.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <PromoModal
          initial={modal.id ? modal : undefined}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
