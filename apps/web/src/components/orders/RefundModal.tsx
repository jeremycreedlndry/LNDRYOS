'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, CreditCard, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

const CARD_METHODS = ['card_present', 'card_online', 'saved_card']

interface Payment {
  id: string
  amount: number
  method: string
  status: string
  helcim_transaction_id?: string | null
}

interface Props {
  payment: Payment
  orderNumber: string
  onClose: () => void
  onSuccess: () => void
}

export function RefundModal({ payment, orderNumber, onClose, onSuccess }: Props) {
  const [amountInput, setAmountInput] = useState('')
  const [refundMethod, setRefundMethod] = useState<'return_to_card' | 'store_credit' | null>(null)
  const [reason, setReason] = useState('')

  const isCard = CARD_METHODS.includes(payment.method)
  const maxCents = payment.amount
  const enteredCents = Math.round(parseFloat(amountInput || '0') * 100)
  const isFullAmount = enteredCents === maxCents
  const canSubmit = enteredCents > 0 && enteredCents <= maxCents && refundMethod !== null

  const refund = trpc.payments.refund.useMutation({
    onSuccess: () => {
      toast.success('Refund processed')
      onSuccess()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleFull = () => setAmountInput((maxCents / 100).toFixed(2))

  const handleSubmit = () => {
    if (!canSubmit || !refundMethod) return
    refund.mutate({
      payment_id:    payment.id,
      amount_cents:  enteredCents,
      refund_method: refundMethod,
      reason:        reason.trim() || null,
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Refund Payment</h2>
            <p className="text-xs text-gray-400 mt-0.5">Order {orderNumber} · {formatCurrency(maxCents)} paid</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Amount
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max={(maxCents / 100).toFixed(2)}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-gray-300 pl-7 pr-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>
              <button
                onClick={handleFull}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isFullAmount
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                Full
              </button>
            </div>
            {enteredCents > maxCents && (
              <p className="text-xs text-red-500 mt-1">Cannot exceed {formatCurrency(maxCents)}</p>
            )}
          </div>

          {/* Refund method */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Refund To
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Return to card — only for card payments */}
              <button
                onClick={() => isCard && setRefundMethod('return_to_card')}
                disabled={!isCard}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                  !isCard
                    ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                    : refundMethod === 'return_to_card'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                <CreditCard className="h-5 w-5" />
                <span>Return to Card</span>
                {!isCard && <span className="text-[10px] text-gray-300">Card only</span>}
              </button>

              <button
                onClick={() => setRefundMethod('store_credit')}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                  refundMethod === 'store_credit'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                <Gift className="h-5 w-5" />
                <span>Store Credit</span>
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Reason <span className="font-normal text-gray-400 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Item damaged, customer dissatisfied…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || refund.isPending}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {refund.isPending ? 'Processing…' : `Refund ${enteredCents > 0 ? formatCurrency(enteredCents) : ''}`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
