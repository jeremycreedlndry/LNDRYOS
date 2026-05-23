'use client'

import { Minus, Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ServiceItem, ItemCategory } from '@laundry/db'

export interface CartLine {
  key: string
  service_item_id: string
  name: string
  category: ItemCategory
  quantity: number
  unit_price: number
  unit_label: string
  notes?: string
  // Physical gift cards only — set after Nayax card lookup
  gift_card_display_number?: string
  gift_card_uid?: string        // Nayax CardUniqueIdentifier
}

interface Props {
  lines: CartLine[]
  taxRate: number
  discountCents: number
  hasCustomer: boolean
  onUpdateQuantity: (key: string, qty: number) => void
  onRemoveLine: (key: string) => void
  onCheckout: () => void
  isSubmitting: boolean
  checkoutLabel?: string
}

export function OrderCart({
  lines,
  taxRate,
  discountCents,
  hasCustomer,
  onUpdateQuantity,
  onRemoveLine,
  onCheckout,
  isSubmitting,
  checkoutLabel,
}: Props) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const taxableSubtotal = lines
    .filter((l) => l.category !== 'gift_card')
    .reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const tax = Math.round(taxableSubtotal * taxRate)
  const total = subtotal + tax - discountCents

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-gray-400">
        <p className="text-sm">Add items to start an order</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-3 border-b border-gray-100 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{line.name}</p>
              <p className="text-xs text-gray-500">
                {formatCurrency(line.unit_price)}{line.unit_label !== 'item' ? `/${line.unit_label}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onUpdateQuantity(line.key, line.quantity - (line.unit_label === 'lb' ? 0.5 : 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-10 text-center text-sm font-medium">
                {line.unit_label === 'lb' ? line.quantity.toFixed(1) : line.quantity}
              </span>
              <button
                onClick={() => onUpdateQuantity(line.key, line.quantity + (line.unit_label === 'lb' ? 0.5 : 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <div className="w-20 text-right">
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(Math.round(line.quantity * line.unit_price))}
              </p>
            </div>

            <button
              onClick={() => onRemoveLine(line.key)}
              className="text-gray-300 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-gray-200 pt-4 space-y-1">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {taxRate > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
        {discountCents > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-{formatCurrency(discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {!hasCustomer && (
        <p className="mt-4 text-center text-xs text-amber-600 font-medium">
          Select a customer to checkout
        </p>
      )}
      <Button
        onClick={onCheckout}
        disabled={isSubmitting || lines.length === 0 || !hasCustomer}
        size="xl"
        className="mt-2 w-full"
      >
        {isSubmitting ? 'Processing…' : checkoutLabel ? `${checkoutLabel} · ${formatCurrency(total)}` : `Checkout · ${formatCurrency(total)}`}
      </Button>
    </div>
  )
}
