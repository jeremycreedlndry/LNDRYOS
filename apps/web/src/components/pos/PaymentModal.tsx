'use client'

import { useState } from 'react'
import { Banknote, CreditCard, Star, Package, Receipt, CheckCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import type { Customer } from '@laundry/db'
import toast from 'react-hot-toast'

type Method = 'cash' | 'card_terminal' | 'saved_card' | 'pay_on_collection' | 'prepaid_card' | 'invoice'
type TipMode = '$' | '%'
type Step = 'select' | 'cash_entry' | 'success'

const METHODS: { id: Method; label: string; icon: React.ElementType; comingSoon?: boolean }[] = [
  { id: 'card_terminal',     label: 'Card Terminal',     icon: CreditCard },
  { id: 'pay_on_collection', label: 'Pay on Collection', icon: Package },
  { id: 'saved_card',        label: 'Saved Card',        icon: Star },
  { id: 'prepaid_card',      label: 'Prepaid Card',      icon: Wallet, comingSoon: true },
  { id: 'invoice',           label: 'Invoice',           icon: Receipt },
  { id: 'cash',              label: 'Cash',              icon: Banknote },
]

const TIP_PRESETS_DOLLARS = [100, 200, 300, 400, 500]
const TIP_PRESETS_PERCENT = [10, 15, 18, 20, 25]

interface Props {
  orderId: string
  totalCents: number
  customer?: Customer | null
  excludeMethods?: Method[]
  onComplete: () => void
  onCancel: () => void
}

export function PaymentModal({ orderId, totalCents, customer, excludeMethods, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>('select')
  const [method, setMethod] = useState<Method>('card_terminal')
  const [tipMode, setTipMode] = useState<TipMode>('$')
  const [tipPreset, setTipPreset] = useState<number | null>(null)
  const [tipCustom, setTipCustom] = useState('')
  const [showTipInput, setShowTipInput] = useState(false)
  const [cashTendered, setCashTendered] = useState('')
  const [changeDue, setChangeDue] = useState(0)

  const recordCash = trpc.payments.recordCashPayment.useMutation({
    onSuccess: (data) => { setChangeDue(data.change_due ?? 0); setStep('success') },
    onError: (e) => toast.error(e.message),
  })

  const recordManual = trpc.payments.recordManualPayment.useMutation({
    onSuccess: () => setStep('success'),
    onError: (e) => toast.error(e.message),
  })

  // ── Tip calculation ───────────────────────────────────────────────────────
  const resolvedTip = (() => {
    if (tipPreset === null && !tipCustom) return 0
    const val = tipPreset !== null ? tipPreset : parseFloat(tipCustom)
    if (isNaN(val) || val < 0) return 0
    if (tipMode === '$') return Math.round(val * 100)
    return Math.round(totalCents * val / 100)
  })()

  const grandTotal = totalCents + resolvedTip

  const hasSavedCard = !!(customer?.saved_card_last4)

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (method === 'cash') { setStep('cash_entry'); return }
    recordManual.mutate({
      order_id: orderId,
      amount: grandTotal,
      method: method as 'card_terminal' | 'saved_card' | 'pay_on_collection' | 'invoice',
    })
  }

  const handleCashPayment = () => {
    const tendered = Math.round(parseFloat(cashTendered) * 100)
    if (tendered < grandTotal) { toast.error('Cash tendered is less than total'); return }
    recordCash.mutate({ order_id: orderId, amount: grandTotal, cash_tendered: tendered })
  }

  const handleTipPreset = (val: number) => {
    if (tipPreset === val) { setTipPreset(null) }
    else { setTipPreset(val); setTipCustom(''); setShowTipInput(false) }
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    const isCollection = method === 'pay_on_collection'
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <CheckCircle className={cn('h-16 w-16', isCollection ? 'text-amber-500' : 'text-green-500')} />
        <h2 className="text-xl font-bold text-gray-900">
          {isCollection ? 'Order Saved' : 'Payment Complete'}
        </h2>
        {isCollection && (
          <p className="text-sm text-gray-500 text-center">Payment due on collection.</p>
        )}
        {method === 'cash' && changeDue > 0 && (
          <div className="w-full rounded-lg bg-yellow-50 border border-yellow-200 px-6 py-4 text-center">
            <p className="text-sm text-yellow-700">Change Due</p>
            <p className="text-3xl font-bold text-yellow-900">{formatCurrency(changeDue)}</p>
          </div>
        )}
        <Button onClick={onComplete} size="lg" className="w-full">Done</Button>
      </div>
    )
  }

  // ── Cash entry ────────────────────────────────────────────────────────────
  if (step === 'cash_entry') {
    const tendered = parseFloat(cashTendered) * 100 || 0
    const change = tendered - grandTotal
    const quickAmounts = [
      grandTotal,
      Math.ceil(grandTotal / 500) * 500,
      Math.ceil(grandTotal / 1000) * 1000,
      2000, 5000, 10000,
    ].filter((v, i, a) => a.indexOf(v) === i)

    return (
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <p className="text-sm text-gray-500">Amount Due</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cash Tendered ($)</label>
          <Input type="number" inputMode="decimal" placeholder="0.00" value={cashTendered}
            onChange={(e) => setCashTendered(e.target.value)}
            className="text-xl h-14 text-center font-semibold" autoFocus />
        </div>
        {tendered >= grandTotal && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center">
            <p className="text-sm text-green-700">Change</p>
            <p className="text-2xl font-bold text-green-900">{formatCurrency(change)}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {quickAmounts.map((amt) => (
            <button key={amt} onClick={() => setCashTendered((amt / 100).toFixed(2))}
              className="rounded-md border border-gray-300 py-2 text-sm font-medium hover:bg-gray-50">
              {formatCurrency(amt)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('select')} className="flex-1">Back</Button>
          <Button onClick={handleCashPayment}
            disabled={tendered < grandTotal || recordCash.isPending} className="flex-1">
            Confirm
          </Button>
        </div>
      </div>
    )
  }

  // ── Method selection ──────────────────────────────────────────────────────
  const tipPresets = tipMode === '$' ? TIP_PRESETS_DOLLARS : TIP_PRESETS_PERCENT
  const isSubmitting = recordManual.isPending

  const submitDisabled = isSubmitting || (method === 'saved_card' && !hasSavedCard) || method === 'prepaid_card'

  const submitLabel = (() => {
    if (isSubmitting) return 'Processing…'
    if (method === 'cash') return 'Enter Cash'
    if (method === 'pay_on_collection') return 'Confirm — Pay Later'
    if (method === 'card_terminal') return 'Charge Card'
    return 'Confirm'
  })()

  return (
    <div className="flex flex-col gap-5">
      {/* Amount */}
      <div className="text-center">
        <p className="text-4xl font-bold text-gray-900">{formatCurrency(totalCents)}</p>
      </div>

      {/* Payment method tiles */}
      <div className="grid grid-cols-3 gap-2">
        {METHODS.filter(({ id }) => !excludeMethods?.includes(id)).map(({ id, label, icon: Icon, comingSoon }) => {
          const disabled = (id === 'saved_card' && !hasSavedCard) || !!comingSoon
          return (
            <button key={id} onClick={() => !disabled && setMethod(id)}
              disabled={disabled}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 py-4 px-2 transition-colors',
                disabled
                  ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                  : method === id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <Icon className={cn('h-6 w-6', method === id && !disabled ? 'text-brand-600' : 'text-gray-500')} />
              <span className={cn('text-xs font-medium text-center leading-tight', method === id && !disabled ? 'text-brand-700' : 'text-gray-700')}>
                {label}
              </span>
              {comingSoon && (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Saved card info */}
      {method === 'saved_card' && hasSavedCard && (
        <div className="rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 bg-gray-50">
          <CreditCard className="h-5 w-5 text-gray-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {customer?.saved_card_brand ?? 'Card'} ···· {customer?.saved_card_last4}
            </p>
            <p className="text-xs text-gray-500">Saved card on file</p>
          </div>
        </div>
      )}

      {/* Pay on collection note */}
      {method === 'pay_on_collection' && (
        <p className="text-xs text-amber-600 text-center rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          Order will be marked unpaid until collected.
        </p>
      )}

      {/* Tip */}
      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Tip</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            {(['$', '%'] as TipMode[]).map((m) => (
              <button key={m}
                onClick={() => { setTipMode(m); setTipPreset(null); setTipCustom(''); setShowTipInput(false) }}
                className={cn('px-3 py-1.5 transition-colors',
                  tipMode === m ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {tipPresets.map((val) => (
            <button key={val} onClick={() => handleTipPreset(val)}
              className={cn('flex-1 min-w-[3rem] rounded-lg border py-2 text-xs font-semibold transition-colors',
                tipPreset === val
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
              {tipMode === '$' ? `$${val / 100}` : `${val}%`}
            </button>
          ))}
          <button onClick={() => { setShowTipInput(true); setTipPreset(null) }}
            className={cn('flex-1 min-w-[3rem] rounded-lg border py-2 text-xs font-semibold transition-colors',
              showTipInput ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
            Other
          </button>
        </div>
        {showTipInput && (
          <Input type="number" inputMode="decimal" placeholder={tipMode === '$' ? '0.00' : '0'}
            value={tipCustom} onChange={(e) => setTipCustom(e.target.value)}
            className="h-9 text-center text-sm" autoFocus />
        )}
      </div>

      {/* Order summary */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Order total</span><span>{formatCurrency(totalCents)}</span>
        </div>
        {resolvedTip > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Tip</span><span>{formatCurrency(resolvedTip)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
          <span>Charge total</span><span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitDisabled} className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
