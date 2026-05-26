'use client'

import { useState, useEffect, useRef } from 'react'
import { Banknote, CreditCard, Star, Package, Receipt, CheckCircle, Wallet, Loader2, Gift, Tag, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import type { Customer, TenantSettings } from '@laundry/db'
import toast from 'react-hot-toast'

type Method = 'card_terminal' | 'saved_card' | 'prepaid_card' | 'cash' | 'pay_on_collection' | 'invoice' | 'direct_deposit'
type TipMode = '$' | '%'
type Step = 'select' | 'cash_entry' | 'terminal_waiting' | 'prepaid_card' | 'success'

const METHODS: { id: Method; label: string; icon: React.ElementType }[] = [
  { id: 'card_terminal',     label: 'Terminal',            icon: CreditCard },
  { id: 'saved_card',        label: 'Saved Card',          icon: Star },
  { id: 'pay_on_collection', label: 'Pay on Collection',   icon: Package },
  { id: 'cash',              label: 'Cash',                icon: Banknote },
  { id: 'direct_deposit',    label: 'E-Transfer',          icon: Wallet },
  { id: 'invoice',           label: 'Invoice',             icon: Receipt },
  { id: 'prepaid_card',      label: 'Prepaid Card',        icon: Gift },
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

const VALID_METHODS: Method[] = ['card_terminal', 'saved_card', 'pay_on_collection', 'cash', 'direct_deposit', 'invoice', 'prepaid_card']

function resolveInitialMethod(customer: Customer | null | undefined, tenantSettings: TenantSettings | null | undefined): Method {
  // 1. Customer-specific override (if set and not 'default')
  const customerType = customer?.payment_type
  if (customerType && customerType !== 'default' && VALID_METHODS.includes(customerType as Method)) {
    // Saved card only if they actually have one
    if (customerType === 'saved_card' && !customer?.saved_card_last4) return 'card_terminal'
    return customerType as Method
  }
  // 2. Tenant default
  const tenantDefault = tenantSettings?.default_payment_type
  if (tenantDefault && VALID_METHODS.includes(tenantDefault as Method)) {
    if (tenantDefault === 'saved_card' && !customer?.saved_card_last4) return 'card_terminal'
    return tenantDefault as Method
  }
  // 3. Fallback: saved card if they have one, otherwise terminal
  return customer?.saved_card_last4 ? 'saved_card' : 'card_terminal'
}

export function PaymentModal({ orderId, totalCents, customer, excludeMethods, onComplete, onCancel }: Props) {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const tenantSettings = tenant?.settings as TenantSettings | undefined

  const [step, setStep]           = useState<Step>('select')
  const [methodTouched, setMethodTouched] = useState(false)
  const [method, setMethod]       = useState<Method>(() => resolveInitialMethod(customer, tenantSettings))

  // Re-resolve once tenant settings load (they're async), but don't override if user already picked
  useEffect(() => {
    if (!methodTouched && tenantSettings) {
      setMethod(resolveInitialMethod(customer, tenantSettings))
    }
  }, [tenantSettings]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tipMode, setTipMode] = useState<TipMode>('$')
  const [tipPreset, setTipPreset] = useState<number | null>(null)
  const [tipCustom, setTipCustom] = useState('')
  const [showTipInput, setShowTipInput] = useState(false)

  // Promo code
  const [promoInput, setPromoInput] = useState('')
  const [promoResult, setPromoResult] = useState<{
    valid: true; promo_code_id: string; discount_cents: number
    discount_type: 'percent' | 'flat'; discount_value: number; description: string | null
  } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)

  // Cash
  const [cashTendered, setCashTendered] = useState('')
  const [changeDue, setChangeDue] = useState(0)

  // Prepaid card
  const [prepaidCardNumber, setPrepaidCardNumber] = useState('')
  const [prepaidCardData, setPrepaidCardData] = useState<{
    id: string
    card_display_number: string
    balance_cents: number
    customer: { first_name: string; last_name: string } | null
  } | null>(null)
  const [prepaidLookupError, setPrepaidLookupError] = useState('')

  // Terminal
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null)
  const [terminalPaymentId, setTerminalPaymentId] = useState<string | null>(null)
  const [terminalTxnId, setTerminalTxnId] = useState<string | null>(null)
  const [terminalStatus, setTerminalStatus] = useState<string>('Waiting for card…')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: terminals = [] } = trpc.payments.listTerminals.useQuery(undefined, {
    enabled: method === 'card_terminal' || step === 'select',
  })

  const maybeRecordPromo = (orderId: string) => {
    if (promoResult) recordPromoUse.mutate({ promo_code_id: promoResult.promo_code_id, customer_id: customer?.id ?? null, order_id: orderId })
  }

  const recordCash = trpc.payments.recordCashPayment.useMutation({
    onSuccess: (data) => { maybeRecordPromo(orderId); setChangeDue(data.change_due ?? 0); setStep('success') },
    onError: (e) => toast.error(e.message),
  })

  const recordManual = trpc.payments.recordManualPayment.useMutation({
    onSuccess: () => { maybeRecordPromo(orderId); setStep('success') },
    onError: (e) => toast.error(e.message),
  })

  const chargeTerminal = trpc.payments.chargeTerminal.useMutation({
    onSuccess: (data) => {
      setTerminalPaymentId(data.id as string)
      setTerminalTxnId(data.helcim_transaction_id as string)
      setStep('terminal_waiting')
    },
    onError: (e) => toast.error(e.message),
  })

  const confirmTerminal = trpc.payments.confirmTerminalPayment.useMutation({
    onSuccess: () => { stopPolling(); setStep('success') },
    onError: (e) => { stopPolling(); toast.error(e.message) },
  })

  const chargeSaved = trpc.payments.chargeSavedCard.useMutation({
    onSuccess: () => { maybeRecordPromo(orderId); setStep('success') },
    onError: (e) => toast.error(e.message),
  })

  const chargePrepaid = trpc.payments.chargePrepaidCard.useMutation({
    onSuccess: () => { maybeRecordPromo(orderId); setStep('success') },
    onError: (e) => toast.error(e.message),
  })

  const lookupPrepaid = trpc.prepaidCards.lookup.useQuery(
    { display_number: prepaidCardNumber.replace(/\s/g, '') || undefined },
    { enabled: false, retry: false }
  )
  // Note: when a card is tapped on a reader, call lookup with card_unique_identifier instead

  const utils = trpc.useUtils()

  // ── Terminal polling ──────────────────────────────────────────────────────

  const POLL_FAST_MS     = 750       // first 15s — catch quick taps fast
  const POLL_SLOW_MS     = 2000      // after 15s — steady polling
  const POLL_FAST_FOR_MS = 15_000    // how long to stay in fast mode
  const POLL_TIMEOUT_MS  = 120_000   // 2 minutes — auto-cancel if no response

  const stopPolling = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
  }

  useEffect(() => {
    if (step !== 'terminal_waiting' || !terminalTxnId) return

    const startedAt = Date.now()

    const tick = async () => {
      const elapsed = Date.now() - startedAt

      // Timeout — reader likely cancelled with no Helcim transaction created
      if (elapsed > POLL_TIMEOUT_MS) {
        stopPolling()
        setTerminalStatus('Timed out')
        toast.error('Terminal timed out — no response from reader')
        setStep('select')
        return
      }

      try {
        const txn = await utils.payments.pollTransaction.fetch({ transactionId: terminalTxnId, paymentId: terminalPaymentId ?? undefined })
        const s = txn.status?.toUpperCase()

        if (s === 'APPROVED') {
          setTerminalStatus('Approved!')
          stopPolling()
          if (terminalPaymentId) {
            maybeRecordPromo(orderId)
            confirmTerminal.mutate({
              payment_id: terminalPaymentId,
              helcim_transaction_id: terminalTxnId,
              customer_id: customer?.id ?? null,
            })
          }
        } else if (s === 'DECLINED' || s === 'CANCELLED') {
          setTerminalStatus('Declined')
          stopPolling()
          toast.error('Card declined')
          setStep('select')
        } else {
          // Still pending — reschedule at fast or slow interval
          pollRef.current = setTimeout(tick, elapsed < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS)
        }
      } catch {
        // Network blip — keep going
        pollRef.current = setTimeout(tick, elapsed < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS)
      }
    }

    // Kick off immediately, then self-schedule
    pollRef.current = setTimeout(tick, POLL_FAST_MS)

    return stopPolling
  }, [step, terminalTxnId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tip calculation ───────────────────────────────────────────────────────

  const recordPromoUse = trpc.promoCodes.recordUse.useMutation()

  const promoDiscountCents = promoResult?.discount_cents ?? 0

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoError('')
    setPromoLoading(true)
    try {
      const result = await utils.promoCodes.validate.fetch({
        code,
        customer_id: customer?.id ?? null,
        order_total: totalCents,
      })
      if (!result.valid) {
        setPromoError(result.reason)
      } else {
        setPromoResult(result)
        setPromoError('')
      }
    } catch {
      setPromoError('Failed to validate code')
    } finally {
      setPromoLoading(false)
    }
  }

  const clearPromo = () => { setPromoResult(null); setPromoInput(''); setPromoError('') }

  const resolvedTip = (() => {
    if (tipPreset === null && !tipCustom) return 0
    const val = tipPreset !== null ? tipPreset : parseFloat(tipCustom)
    if (isNaN(val) || val < 0) return 0
    if (tipMode === '$') return Math.round(val * 100)
    return Math.round(totalCents * val / 100)
  })()

  const grandTotal = Math.max(0, totalCents - promoDiscountCents) + resolvedTip

  const hasSavedCard = !!(customer?.saved_card_last4)
  const hasTerminals = terminals.length > 0

  const handleTipPreset = (val: number) => {
    if (tipPreset === val) setTipPreset(null)
    else { setTipPreset(val); setTipCustom(''); setShowTipInput(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (method === 'cash') { setStep('cash_entry'); return }

    if (method === 'card_terminal') {
      const tid = selectedTerminalId ?? terminals[0]?.terminalId?.toString()
      if (!tid) { toast.error('No terminal selected'); return }
      chargeTerminal.mutate({ order_id: orderId, amount: grandTotal, terminal_id: tid })
      return
    }

    if (method === 'saved_card') {
      if (!customer?.id) { toast.error('No customer selected'); return }
      chargeSaved.mutate({ order_id: orderId, amount: grandTotal, customer_id: customer.id })
      return
    }

    if (method === 'prepaid_card') {
      setPrepaidCardNumber('')
      setPrepaidCardData(null)
      setPrepaidLookupError('')
      setStep('prepaid_card')
      return
    }

    // Manual methods: pay_on_collection, invoice, direct_deposit
    recordManual.mutate({ order_id: orderId, amount: grandTotal, method: method as 'pay_on_collection' | 'invoice' | 'direct_deposit' })
  }

  const handlePrepaidLookup = async () => {
    const num = prepaidCardNumber.replace(/\s/g, '')
    if (!num) return
    try {
      const result = await utils.prepaidCards.lookup.fetch({ display_number: num })
      if (result.source === 'db' && result.card) {
        if (result.card.status !== 'active') {
          setPrepaidLookupError('This card is not active')
          return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPrepaidCardData(result.card as any)
      } else if (result.source === 'nayax') {
        setPrepaidLookupError('Card found in Nayax but not registered in your system. Please import it first.')
      } else {
        setPrepaidLookupError('Card not found')
      }
    } catch {
      setPrepaidLookupError('Lookup failed — check the card number and try again')
    }
  }

  const handleCashPayment = () => {
    const tendered = Math.round(parseFloat(cashTendered) * 100)
    if (tendered < grandTotal) { toast.error('Cash tendered is less than total'); return }
    recordCash.mutate({ order_id: orderId, amount: grandTotal, cash_tendered: tendered })
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
        {isCollection && <p className="text-sm text-gray-500 text-center">Payment due on collection.</p>}
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

  // ── Terminal waiting ──────────────────────────────────────────────────────

  if (step === 'terminal_waiting') {
    const done = terminalStatus === 'Approved!' || terminalStatus === 'Declined'
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        {done
          ? <CheckCircle className="h-14 w-14 text-green-500" />
          : <Loader2 className="h-14 w-14 text-brand-600 animate-spin" />
        }
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">{terminalStatus}</p>
          <p className="text-sm text-gray-500 mt-1">{formatCurrency(grandTotal)}</p>
        </div>
        {!done && (
          <p className="text-xs text-gray-400 text-center">
            Present card on the terminal.<br />Do not close this window.
          </p>
        )}
        {!done && (
          <Button variant="outline" onClick={() => { stopPolling(); setStep('select') }}>
            Cancel
          </Button>
        )}
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

  // ── Prepaid card ──────────────────────────────────────────────────────────

  if (step === 'prepaid_card') {
    const sufficient = prepaidCardData && prepaidCardData.balance_cents >= grandTotal
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center mb-1">
          <p className="text-sm text-gray-500">Charge</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
        </div>

        {!prepaidCardData ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Card Number</label>
              <Input
                value={prepaidCardNumber}
                onChange={(e) => { setPrepaidCardNumber(e.target.value); setPrepaidLookupError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handlePrepaidLookup()}
                placeholder="Enter card number"
                className="font-mono text-lg h-12 tracking-widest text-center"
                autoFocus
              />
            </div>
            {prepaidLookupError && (
              <p className="text-sm text-red-600 text-center">{prepaidLookupError}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('select')} className="flex-1">Back</Button>
              <Button
                onClick={handlePrepaidLookup}
                disabled={!prepaidCardNumber.trim() || lookupPrepaid.isFetching}
                className="flex-1"
              >
                {lookupPrepaid.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look Up'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Card</span>
                <span className="font-mono font-semibold text-gray-900">{prepaidCardData.card_display_number}</span>
              </div>
              {prepaidCardData.customer && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Holder</span>
                  <span className="text-sm font-medium text-gray-900">
                    {prepaidCardData.customer.first_name} {prepaidCardData.customer.last_name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Balance</span>
                <span className={cn(
                  'text-lg font-bold',
                  sufficient ? 'text-green-700' : 'text-red-600'
                )}>
                  {formatCurrency(prepaidCardData.balance_cents)}
                </span>
              </div>
              {sufficient && (
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Remaining after</span>
                  <span>{formatCurrency(prepaidCardData.balance_cents - grandTotal)}</span>
                </div>
              )}
            </div>
            {!sufficient && (
              <p className="text-sm text-red-600 text-center font-medium">
                Insufficient balance — card has {formatCurrency(prepaidCardData.balance_cents)}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPrepaidCardData(null)} className="flex-1">Different Card</Button>
              <Button
                onClick={() => chargePrepaid.mutate({ order_id: orderId, card_id: prepaidCardData.id, amount_cents: grandTotal })}
                disabled={!sufficient || chargePrepaid.isPending}
                className="flex-1"
              >
                {chargePrepaid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Charge Card'}
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Method selection ──────────────────────────────────────────────────────

  const tipPresets = tipMode === '$' ? TIP_PRESETS_DOLLARS : TIP_PRESETS_PERCENT
  const isSubmitting = recordManual.isPending || chargeSaved.isPending || chargeTerminal.isPending

  const methodDisabled = (id: Method) => {
    if (id === 'saved_card' && !hasSavedCard) return true
    if (id === 'card_terminal' && !hasTerminals) return true
    return false
  }

  const submitLabel = (() => {
    if (isSubmitting) return 'Processing…'
    if (method === 'cash') return 'Enter Cash'
    if (method === 'card_terminal') return 'Send to Terminal'
    if (method === 'pay_on_collection') return 'Confirm — Pay Later'
    return 'Confirm'
  })()

  return (
    <div className="flex flex-col gap-5">
      {/* Amount */}
      <div className="text-center">
        <p className="text-4xl font-bold text-gray-900">{formatCurrency(totalCents)}</p>
      </div>

      {/* Payment method tiles */}
      <div className="grid grid-cols-4 gap-2">
        {METHODS.filter(({ id }) => !excludeMethods?.includes(id)).map(({ id, label, icon: Icon }) => {
          const disabled = methodDisabled(id)
          return (
            <button key={id} onClick={() => { if (!disabled) { setMethod(id); setMethodTouched(true) } }}
              disabled={disabled}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 px-1 transition-colors',
                disabled
                  ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                  : method === id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <Icon className={cn('h-5 w-5', method === id && !disabled ? 'text-brand-600' : 'text-gray-500')} />
              <span className={cn('text-[10px] font-medium text-center leading-tight', method === id && !disabled ? 'text-brand-700' : 'text-gray-700')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Terminal selector */}
      {method === 'card_terminal' && terminals.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Terminal</label>
          <div className="flex flex-wrap gap-2">
            {terminals.map((t) => (
              <button key={String(t.terminalId)}
                onClick={() => setSelectedTerminalId(String(t.terminalId))}
                className={cn('rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                  selectedTerminalId === String(t.terminalId) || (!selectedTerminalId && terminals[0]?.terminalId === t.terminalId)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                )}>
                {t.terminalName}
              </button>
            ))}
          </div>
        </div>
      )}

      {method === 'card_terminal' && terminals.length === 0 && (
        <p className="text-xs text-amber-600 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center">
          No terminals found. Check your Helcim API token in Settings → Integrations.
        </p>
      )}

      {/* Saved card info */}
      {method === 'saved_card' && hasSavedCard && (
        <div className="rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 bg-gray-50">
          <CreditCard className="h-5 w-5 text-gray-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {customer?.saved_card_brand ?? 'Card'} ···· {customer?.saved_card_last4}
            </p>
            <p className="text-xs text-gray-500">Will be charged immediately</p>
          </div>
        </div>
      )}

      {/* Pay on collection note */}
      {method === 'pay_on_collection' && (
        <p className="text-xs text-amber-600 text-center rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          Order will be marked unpaid until collected.
        </p>
      )}

      {/* Promo code */}
      <div className="rounded-xl border border-gray-200 p-3">
        {promoResult ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">{promoInput.toUpperCase()} applied</p>
                <p className="text-xs text-gray-500">
                  -{formatCurrency(promoResult.discount_cents)}
                  {promoResult.description ? ` · ${promoResult.description}` : ''}
                </p>
              </div>
            </div>
            <button onClick={clearPromo} className="text-gray-400 hover:text-gray-600">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={promoInput}
                onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo() } }}
                placeholder="Promo code"
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={handleApplyPromo}
              disabled={!promoInput.trim() || promoLoading}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </button>
          </div>
        )}
        {promoError && <p className="text-xs text-red-600 mt-1.5">{promoError}</p>}
      </div>

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
        {promoDiscountCents > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Promo ({promoInput.toUpperCase()})</span>
            <span>−{formatCurrency(promoDiscountCents)}</span>
          </div>
        )}
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
        <Button onClick={handleSubmit} disabled={isSubmitting || methodDisabled(method)} className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
