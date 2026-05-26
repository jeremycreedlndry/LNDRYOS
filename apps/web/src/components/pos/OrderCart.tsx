'use client'

import { useState, useEffect } from 'react'
import { Minus, Plus, Trash2, Tag, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import type { ItemCategory } from '@laundry/db'

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
  hasCustomer: boolean
  customerId?: string | null
  onUpdateQuantity: (key: string, qty: number) => void
  onRemoveLine: (key: string) => void
  onCheckout: () => void
  isSubmitting: boolean
  checkoutLabel?: string
  onDiscountChange?: (cents: number, promoCodeId?: string) => void
}

export function OrderCart({
  lines,
  taxRate,
  hasCustomer,
  customerId,
  onUpdateQuantity,
  onRemoveLine,
  onCheckout,
  isSubmitting,
  checkoutLabel,
  onDiscountChange,
}: Props) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const taxableSubtotal = lines
    .filter((l) => l.category !== 'gift_card')
    .reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const tax = Math.round(taxableSubtotal * taxRate)

  // ── Discount state ────────────────────────────────────────────────────────
  const [manualPct, setManualPct]   = useState('')
  const [manualFlat, setManualFlat] = useState('')
  const [showPromo, setShowPromo]   = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promoApplied, setPromoApplied] = useState<{
    promo_code_id: string; discount_cents: number; code: string
  } | null>(null)
  const [promoError, setPromoError]   = useState('')
  const [promoLoading, setPromoLoading] = useState(false)

  const utils = trpc.useUtils()

  // Load available codes when the promo panel opens
  const { data: availableCodes = [] } = trpc.promoCodes.list.useQuery(undefined, {
    enabled: showPromo,
    select: (codes) => codes.filter((c) => {
      if (!c.is_active) return false
      if (c.expires_at && new Date(c.expires_at) < new Date()) return false
      if (c.max_uses != null && c.use_count >= c.max_uses) return false
      return true
    }),
  })

  const manualDiscountCents = (() => {
    if (promoApplied) return promoApplied.discount_cents
    if (manualPct)  return Math.min(Math.round(subtotal * parseFloat(manualPct) / 100), subtotal)
    if (manualFlat) return Math.min(Math.round(parseFloat(manualFlat) * 100), subtotal)
    return 0
  })()

  const total = Math.max(0, subtotal + tax - manualDiscountCents)

  // Notify parent whenever discount changes
  useEffect(() => {
    onDiscountChange?.(manualDiscountCents, promoApplied?.promo_code_id)
  }, [manualDiscountCents, promoApplied?.promo_code_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePctChange = (v: string) => {
    setManualFlat('')
    setManualPct(v)
  }
  const handleFlatChange = (v: string) => {
    setManualPct('')
    setManualFlat(v)
  }

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoError('')
    setPromoLoading(true)
    try {
      const result = await utils.promoCodes.validate.fetch({
        code,
        customer_id: customerId ?? null,
        order_total: subtotal + tax,
      })
      if (!result.valid) {
        setPromoError(result.reason)
      } else {
        setPromoApplied({ promo_code_id: result.promo_code_id, discount_cents: result.discount_cents, code })
        setShowPromo(false)
        setPromoInput('')
        setPromoError('')
        // Clear any manual discount
        setManualPct('')
        setManualFlat('')
      }
    } catch {
      setPromoError('Failed to validate code')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    setPromoApplied(null)
    setPromoInput('')
    setPromoError('')
  }

  const handleSelectCode = async (code: string) => {
    setPromoInput(code)
    setPromoError('')
    setPromoLoading(true)
    try {
      const result = await utils.promoCodes.validate.fetch({
        code,
        customer_id: customerId ?? null,
        order_total: subtotal + tax,
      })
      if (!result.valid) {
        setPromoError(result.reason)
      } else {
        setPromoApplied({ promo_code_id: result.promo_code_id, discount_cents: result.discount_cents, code })
        setShowPromo(false)
        setPromoInput('')
        setPromoError('')
        setManualPct('')
        setManualFlat('')
      }
    } catch {
      setPromoError('Failed to validate code')
    } finally {
      setPromoLoading(false)
    }
  }

  const formatCodeDiscount = (code: { discount_type: string; discount_value: number }) => {
    if (code.discount_type === 'percent') return `${code.discount_value}% off`
    return `${formatCurrency(code.discount_value)} off`
  }

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
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        {/* Discount row */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {/* Left: label + promo badge */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm text-gray-600">Discount</span>
              {!promoApplied && (
                <button
                  onClick={() => { setShowPromo(!showPromo); setPromoError('') }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Add Promo
                </button>
              )}
              {promoApplied && (
                <div className="flex items-center gap-1">
                  <Tag className="h-3 w-3 text-green-600 shrink-0" />
                  <span className="text-xs font-mono font-semibold text-green-700 truncate">{promoApplied.code}</span>
                  <button onClick={handleRemovePromo} className="text-gray-400 hover:text-red-500 shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Right: % and $ inputs (hidden when promo applied) */}
            {!promoApplied && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-400">%</span>
                <input
                  type="number" min="0" max="100"
                  value={manualPct}
                  onChange={(e) => handlePctChange(e.target.value)}
                  className="w-12 rounded-md border border-gray-300 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="0"
                />
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number" min="0"
                  value={manualFlat}
                  onChange={(e) => handleFlatChange(e.target.value)}
                  className="w-12 rounded-md border border-gray-300 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="0"
                />
              </div>
            )}
            {/* Discount amount (when promo applied or manual > 0) */}
            {promoApplied && (
              <span className="text-sm font-medium text-green-600 shrink-0">
                -{formatCurrency(promoApplied.discount_cents)}
              </span>
            )}
          </div>

          {/* Promo panel */}
          {showPromo && !promoApplied && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-2">
              {/* Available codes */}
              {availableCodes.length > 0 && (
                <div className="space-y-1">
                  {availableCodes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCode(c.code)}
                      disabled={promoLoading}
                      className="w-full flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-left hover:border-brand-400 hover:bg-brand-50 transition-colors disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-sm font-semibold text-gray-900">{c.code}</span>
                        {c.description && (
                          <span className="ml-2 text-xs text-gray-400 truncate">{c.description}</span>
                        )}
                      </div>
                      <span className="ml-2 shrink-0 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                        {formatCodeDiscount(c)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Manual entry */}
              <div className="flex items-center gap-1.5">
                <input
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                  placeholder={availableCodes.length > 0 ? 'Or enter code manually…' : 'Enter promo code'}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-sm uppercase focus:outline-none focus:ring-1 focus:ring-brand-500"
                  autoFocus={availableCodes.length === 0}
                />
                <Button
                  size="sm" onClick={handleApplyPromo}
                  disabled={promoLoading || !promoInput.trim()}
                  className="shrink-0"
                >
                  {promoLoading ? '…' : 'Apply'}
                </Button>
                <button
                  onClick={() => { setShowPromo(false); setPromoInput(''); setPromoError('') }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {promoError && <p className="text-xs text-red-600">{promoError}</p>}
            </div>
          )}
        </div>

        {taxRate > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
        {manualDiscountCents > 0 && !promoApplied && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-{formatCurrency(manualDiscountCents)}</span>
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
