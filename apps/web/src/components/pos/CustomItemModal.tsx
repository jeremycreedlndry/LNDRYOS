'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import type { CartLine } from './OrderCart'
import type { ItemCategory } from '@laundry/db'
import toast from 'react-hot-toast'

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: 'wash_fold',   label: 'Wash & Fold' },
  { value: 'dry_clean',  label: 'Dry Clean' },
  { value: 'press_only', label: 'Press Only' },
  { value: 'alterations',label: 'Alterations' },
  { value: 'product',    label: 'Product' },
  { value: 'upcharge',   label: 'Upcharge' },
  { value: 'other',      label: 'Other' },
]

const UNIT_OPTIONS = ['item', 'lb', 'piece', 'bag', 'hr']

interface Props {
  onAdd: (line: CartLine) => void
  onClose: () => void
}

export function CustomItemModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ItemCategory>('other')
  const [priceStr, setPriceStr] = useState('')
  const [qtyStr, setQtyStr] = useState('1')
  const [unit, setUnit] = useState('item')
  const [notes, setNotes] = useState('')

  const priceCents = Math.round((parseFloat(priceStr) || 0) * 100)
  const qty = parseFloat(qtyStr) || 1
  const lineTotal = Math.round(priceCents * qty)

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Enter a name'); return }
    if (priceCents <= 0) { toast.error('Enter a price'); return }
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return }

    onAdd({
      key: `custom-${Date.now()}`,
      service_item_id: '',
      name: name.trim(),
      category,
      quantity: qty,
      unit_price: priceCents,
      unit_label: unit,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Custom Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Extra large comforter"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {/* Price + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Price ($) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="0.00"
                className="text-lg font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                  className="text-lg font-semibold"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="rounded-xl border border-gray-300 px-2 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional…"
            />
          </div>

          {/* Total preview */}
          {lineTotal > 0 && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-brand-600 font-medium">
                {qty} {unit}{qty !== 1 ? 's' : ''} × {formatCurrency(priceCents)}
              </span>
              <span className="text-sm font-bold text-brand-700">{formatCurrency(lineTotal)}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || priceCents <= 0} className="flex-1 gap-1.5">
              <Plus className="h-4 w-4" /> Add to Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
