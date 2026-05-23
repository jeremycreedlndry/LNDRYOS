'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

interface Props {
  orderId:     string
  orderNumber: string
  onClose:     () => void
  onCancelled: () => void
}

export function CancelOrderModal({ orderId, orderNumber, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState('')
  const utils = trpc.useUtils()

  const cancel = trpc.orders.cancel.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate()
      utils.orders.getById.invalidate({ id: orderId })
      toast.success(`Order ${orderNumber} deleted`)
      onCancelled()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = () => {
    if (!reason.trim()) return
    cancel.mutate({ id: orderId, reason: reason.trim() })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-base font-semibold text-gray-900">Delete Order</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{orderNumber}</strong>? The order will be kept on record as cancelled.
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer cancelled, duplicate order…"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              autoFocus
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Keep Order
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reason.trim() || cancel.isPending}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {cancel.isPending ? 'Deleting…' : 'Delete Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
