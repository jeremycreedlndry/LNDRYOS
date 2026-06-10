'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#78716c',
]

interface Props {
  category?: { id: string; name: string; color: string } | null
  onClose: () => void
  onSuccess: () => void
}

export function CategoryModal({ category, onClose, onSuccess }: Props) {
  const isEdit = !!category
  const [name, setName]   = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? '#6366f1')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const create = trpc.inventory.createCategory.useMutation({
    onSuccess: () => { toast.success('Category created'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })
  const update = trpc.inventory.updateCategory.useMutation({
    onSuccess: () => { toast.success('Category updated'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })
  const remove = trpc.inventory.deleteCategory.useMutation({
    onSuccess: () => { toast.success('Category deleted'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })

  const isPending = create.isPending || update.isPending || remove.isPending

  const handleSave = () => {
    if (!name.trim()) return
    if (isEdit) {
      update.mutate({ id: category.id, name: name.trim(), color })
    } else {
      create.mutate({ name: name.trim(), color })
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Detergents, Packaging, Supplies"
              autoFocus
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Colour</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="h-5 w-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="text-xs text-gray-500 border-0 p-0 focus:outline-none w-20 font-mono"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-medium text-gray-700">{name || 'Category name'}</span>
          </div>

          {/* Delete */}
          {isEdit && (
            <div className="border-t border-gray-100 pt-3">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete category
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete? Items stay, just uncategorised.</span>
                  <button onClick={() => remove.mutate({ id: category.id })} disabled={isPending} className="text-xs font-semibold text-red-600">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">No</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending} className="flex-1">
            {isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
