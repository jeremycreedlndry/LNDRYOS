'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

interface Props {
  item: { id: string; name: string; unit: string; current_stock: number }
  onClose: () => void
  onSuccess: () => void
}

export function UseItemModal({ item, onClose, onSuccess }: Props) {
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  const log = trpc.inventory.logUsage.useMutation({
    onSuccess: () => { toast.success(`Logged ${qty} ${item.unit} used`); onSuccess() },
    onError: (e) => toast.error(e.message),
  })

  const max = item.current_stock

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Log Usage</h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.name} · {item.current_stock} {item.unit} in stock</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">

          {/* Quantity picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              How many {item.unit} used?
            </label>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="h-10 w-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-4xl font-bold tabular-nums text-gray-900 w-12 text-center">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(max, q + 1))}
                disabled={qty >= max}
                className="h-10 w-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center disabled:opacity-30"
              >
                <span className="text-lg font-medium">+</span>
              </button>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 mt-4 justify-center">
              {[1, 2, 3, 5].filter(n => n <= max).map(n => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    qty === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Note <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Opened new bottle"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={() => log.mutate({ item_id: item.id, quantity: qty, notes: notes.trim() || null })}
              disabled={log.isPending}
              className="flex-1"
            >
              {log.isPending ? 'Saving…' : `Use ${qty}`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
