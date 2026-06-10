'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

const UNITS = ['units', 'bottles', 'bags', 'boxes', 'rolls', 'cases', 'jugs', 'packs', 'sheets', 'litres', 'kg']

interface Category { id: string; name: string; color: string }

interface Props {
  item?: any | null
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}

export function ItemModal({ item, categories, onClose, onSuccess }: Props) {
  const isEdit = !!item

  const [name, setName]       = useState(item?.name ?? '')
  const [unit, setUnit]       = useState(item?.unit ?? 'units')
  const [customUnit, setCustomUnit] = useState(!UNITS.includes(item?.unit ?? 'units') ? item?.unit ?? '' : '')
  const [catId, setCatId]     = useState<string>(item?.category_id ?? '')
  const [stock, setStock]     = useState(String(item?.current_stock ?? 0))
  const [threshold, setThreshold] = useState(String(item?.low_stock_threshold ?? 2))
  const [notes, setNotes]     = useState(item?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const effectiveUnit = unit === '__custom__' ? customUnit : unit

  const create = trpc.inventory.createItem.useMutation({
    onSuccess: () => { toast.success('Item added'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })
  const update = trpc.inventory.updateItem.useMutation({
    onSuccess: () => { toast.success('Item updated'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })
  const remove = trpc.inventory.deleteItem.useMutation({
    onSuccess: () => { toast.success('Item removed'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })

  const isPending = create.isPending || update.isPending || remove.isPending
  const canSave = name.trim().length > 0 && effectiveUnit.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      name:                name.trim(),
      unit:                effectiveUnit.trim(),
      category_id:         catId || null,
      low_stock_threshold: parseInt(threshold, 10) || 0,
      notes:               notes.trim() || null,
    }
    if (isEdit) {
      update.mutate({ id: item.id, ...payload })
    } else {
      create.mutate({ ...payload, current_stock: parseInt(stock, 10) || 0 })
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Item' : 'New Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Tide Pods, Poly Bags 12×16"
              autoFocus
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Unit *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => { setUnit(u); setCustomUnit('') }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    unit === u && unit !== '__custom__'
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {u}
                </button>
              ))}
              <button
                onClick={() => setUnit('__custom__')}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  unit === '__custom__'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Other…
              </button>
            </div>
            {unit === '__custom__' && (
              <input
                type="text"
                value={customUnit}
                onChange={e => setCustomUnit(e.target.value)}
                placeholder="Custom unit name"
                autoFocus
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Category</label>
            <select
              value={catId}
              onChange={e => setCatId(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">— No category —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Starting stock (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Starting stock</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={stock}
                onChange={e => setStock(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {/* Low stock threshold */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Low stock alert when below
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Stored in back room, shelf 3"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Delete */}
          {isEdit && (
            <div className="pt-2 border-t border-gray-100">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove item
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Remove this item?</span>
                  <button
                    onClick={() => remove.mutate({ id: item.id })}
                    disabled={isPending}
                    className="text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    Yes, remove
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || isPending} className="flex-1">
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
