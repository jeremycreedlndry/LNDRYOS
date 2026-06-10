'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

interface Props {
  item: { id: string; name: string; unit: string; current_stock: number }
  onClose: () => void
  onSuccess: () => void
}

export function RestockModal({ item, onClose, onSuccess }: Props) {
  const [mode, setMode]   = useState<'add' | 'set'>('add')
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')

  const restock  = trpc.inventory.restock.useMutation({
    onSuccess: () => { toast.success('Stock updated'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })
  const adjust   = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => { toast.success('Stock adjusted'); onSuccess() },
    onError:   (e) => toast.error(e.message),
  })

  const isPending = restock.isPending || adjust.isPending
  const parsed    = parseInt(qty, 10)
  const isValid   = !isNaN(parsed) && parsed >= 0 && (mode === 'add' ? parsed > 0 : true)

  const handleSubmit = () => {
    if (!isValid) return
    if (mode === 'add') {
      restock.mutate({ item_id: item.id, quantity: parsed, notes: notes.trim() || null })
    } else {
      adjust.mutate({ item_id: item.id, new_stock: parsed, notes: notes.trim() || null })
    }
  }

  const preview = mode === 'add'
    ? item.current_stock + (parsed || 0)
    : (parsed >= 0 ? parsed : item.current_stock)

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Update Stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.name} · currently {item.current_stock} {item.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(['add', 'set'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setQty('') }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'add' ? 'Add Stock' : 'Set Exact'}
              </button>
            ))}
          </div>

          {/* Quantity input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {mode === 'add' ? `Quantity to add (${item.unit})` : `New stock count (${item.unit})`}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={mode === 'add' ? 1 : 0}
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder={mode === 'add' ? 'e.g. 12' : `Currently ${item.current_stock}`}
              autoFocus
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {qty !== '' && isValid && (
              <p className="text-xs text-green-600 mt-1 font-medium">
                New total: {preview} {item.unit}
              </p>
            )}
          </div>

          {/* Quick amounts for add mode */}
          {mode === 'add' && (
            <div className="flex gap-2">
              {[1, 6, 12, 24].map(n => (
                <button
                  key={n}
                  onClick={() => setQty(String(n))}
                  className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold transition-colors ${
                    qty === String(n)
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  +{n}
                </button>
              ))}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Note <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Weekly delivery arrived"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!isValid || isPending} className="flex-1">
              {isPending ? 'Saving…' : mode === 'add' ? `Add ${parsed || ''} ${item.unit}` : 'Set Stock'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
