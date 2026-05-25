'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, CreditCard, DollarSign, Banknote, FileText, ChevronRight, Send, Plus, MessageSquare, Truck, Trash2, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { trpc } from '@/lib/trpc'
import { formatCurrency, cn } from '@/lib/utils'
import { OrderDetailModal } from '@/app/(dashboard)/orders/OrderDetailModal'
import { ScheduleModal } from '@/components/pickups/ScheduleModal'
import toast from 'react-hot-toast'
import type { Customer, TenantSettings, OrderPreferenceOptions } from '@laundry/db'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'orders' | 'stats' | 'payments' | 'messages' | 'pickups' | 'edit'

const TABS: { id: Tab; label: string }[] = [
  { id: 'orders',   label: 'Orders'   },
  { id: 'stats',    label: 'Stats'    },
  { id: 'payments', label: 'Payments' },
  { id: 'messages', label: 'Messages' },
  { id: 'pickups',  label: 'Pickups'  },
  { id: 'edit',     label: 'Edit'     },
]

const METHOD_LABEL: Record<string, string> = {
  cash:             'Cash',
  card_present:     'Card (Terminal)',
  card_online:      'Card (Online)',
  account_credit:   'Account Credit',
  saved_card:       'Saved Card',
  pay_on_collection:'Pay on Collection',
  e_transfer:       'e-Transfer',
  cheque:           'Cheque',
  direct_deposit:   'Direct Deposit',
  invoice:          'Invoice',
}

const PAYMENT_METHODS = [
  { value: 'cash',           label: 'Cash',           icon: Banknote   },
  { value: 'card_present',   label: 'Card (Terminal)', icon: CreditCard },
  { value: 'e_transfer',     label: 'e-Transfer',      icon: DollarSign },
  { value: 'cheque',         label: 'Cheque',          icon: FileText   },
  { value: 'card_online',    label: 'Card (Online)',   icon: CreditCard },
  { value: 'account_credit', label: 'Account Credit',  icon: DollarSign },
] as const
type PaymentMethod = typeof PAYMENT_METHODS[number]['value']

// ─── Edit form constants / types ───────────────────────────────────────────────

const DEFAULT_PREFERENCE_OPTIONS: Required<OrderPreferenceOptions> = {
  bleach:           ['Yes', 'No', 'Whites Only', 'Delicates Only'],
  dryer_sheets:     ['Yes', 'No', 'Fragrance Free'],
  detergent_type:   ['Store Default', 'HE', 'Sensitive', 'Fragrance Free', 'Pods'],
  fabric_softener:  ['Yes', 'No', 'Fragrance Free'],
  wash_temperature: ['Cold', 'Warm', 'Hot'],
}

const PAYMENT_TYPES   = ['Default', 'Cash', 'Account', 'Card']
const INVOICE_STYLES  = ['Store Default', 'Detailed', 'Summary']
const MARKETING_OPTIONS = ['No', 'Email', 'SMS', 'Email & SMS']

interface CustomerFormData {
  first_name: string; last_name: string; phone: string; secondary_phone: string
  email: string; address_street: string; address_apt: string; address_city: string
  address_postal_code: string; driver_instructions: string; notes: string
  private_notes: string; price_list_id: string; payment_type: string
  marketing_opt_in: string; invoice_style: string; discount_percent: string
  account_balance: string; delivery_fee: string; tax_exempt: boolean
  notification_preference: 'sms' | 'email' | 'sms_email' | 'none'
  notif_order_confirmed: boolean
  notif_order_ready:     boolean
  notif_pickup_reminder: boolean
  notif_billing:         boolean
  pref_bleach: string; pref_dryer_sheets: string; pref_detergent_type: string
  pref_fabric_softener: string; pref_wash_temperature: string
}

function initForm(customer: Customer): CustomerFormData {
  return {
    first_name:           customer.first_name ?? '',
    last_name:            customer.last_name ?? '',
    phone:                customer.phone ?? '',
    secondary_phone:      customer.secondary_phone ?? '',
    email:                customer.email ?? '',
    address_street:       customer.address_street ?? '',
    address_apt:          customer.address_apt ?? '',
    address_city:         customer.address_city ?? '',
    address_postal_code:  customer.address_postal_code ?? '',
    driver_instructions:  customer.driver_instructions ?? '',
    notes:                customer.notes ?? '',
    private_notes:        customer.private_notes ?? '',
    price_list_id:        customer.price_list_id ?? '',
    payment_type:         customer.payment_type ?? 'default',
    marketing_opt_in:     customer.marketing_opt_in ? 'Email & SMS' : 'No',
    invoice_style:        customer.invoice_style ?? 'store_default',
    discount_percent:     String(customer.discount_percent ?? 0),
    account_balance:      String((customer.account_balance ?? 0) / 100),
    tax_exempt:           customer.tax_exempt ?? false,
    delivery_fee:         String((customer.delivery_fee_cents ?? 0) / 100),
    notification_preference: customer.notification_preference ?? 'sms_email',
    notif_order_confirmed: (customer.notification_topics as Record<string, boolean> | null)?.order_confirmed ?? true,
    notif_order_ready:     (customer.notification_topics as Record<string, boolean> | null)?.order_ready     ?? true,
    notif_pickup_reminder: (customer.notification_topics as Record<string, boolean> | null)?.pickup_reminder ?? true,
    notif_billing:         (customer.notification_topics as Record<string, boolean> | null)?.billing         ?? true,
    pref_bleach:          customer.order_preferences?.bleach ?? '',
    pref_dryer_sheets:    customer.order_preferences?.dryer_sheets ?? '',
    pref_detergent_type:  customer.order_preferences?.detergent_type ?? '',
    pref_fabric_softener: customer.order_preferences?.fabric_softener ?? '',
    pref_wash_temperature:customer.order_preferences?.wash_temperature ?? '',
  }
}

function InlineSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o.toLowerCase().replace(/\s+/g, '_').replace(/&/g, 'and')}>{o}</option>
      ))}
    </select>
  )
}

function PrefSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
        <option value="">No Preference</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ─── Add Card Modal ───────────────────────────────────────────────────────────

type AddCardStep =
  | { type: 'choose' }
  | { type: 'terminal_select' }
  | { type: 'terminal_waiting'; invoiceNumber: string }
  | { type: 'success'; card_last4: string | null | undefined; card_brand: string | null | undefined }
  | { type: 'error'; message: string }

function AddCardModal({ customerId, onClose, onSaved, onLaunchHelcim }: {
  customerId: string
  onClose: () => void
  onSaved: () => void
  /** Called with checkoutToken — parent launches HelcimPay.js and closes this modal */
  onLaunchHelcim: (checkoutToken: string) => void
}) {
  const utils = trpc.useUtils()
  const [step, setStep] = useState<AddCardStep>({ type: 'choose' })
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: terminals = [] } = trpc.payments.listTerminals.useQuery()
  const verifyViaTerminal = trpc.payments.verifyCardViaTerminal.useMutation()
  const initHelcimSession = trpc.payments.initCardSaveSession.useMutation()

  // ── Poll for terminal verify result ───────────────────────────────────────
  const startPolling = useCallback((invoiceNumber: string) => {
    const poll = async () => {
      try {
        const result = await utils.payments.pollCardVerify.fetch({ invoiceNumber, customer_id: customerId })
        if (result.status === 'APPROVED') {
          utils.customers.getById.invalidate({ id: customerId })
          setStep({ type: 'success', card_last4: result.card_last4, card_brand: result.card_brand })
          return
        }
        if (result.status === 'DECLINED') {
          setStep({ type: 'error', message: 'Card declined on terminal.' })
          return
        }
        pollRef.current = setTimeout(poll, 1000)
      } catch {
        pollRef.current = setTimeout(poll, 1500)
      }
    }
    pollRef.current = setTimeout(poll, 1000)
  }, [customerId, utils])

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleTerminalSelect(terminalId: string) {
    try {
      const { invoiceNumber } = await verifyViaTerminal.mutateAsync({ terminal_id: terminalId, customer_id: customerId })
      setStep({ type: 'terminal_waiting', invoiceNumber })
      startPolling(invoiceNumber)
    } catch (err) {
      setStep({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleManualEntry() {
    try {
      const session = await initHelcimSession.mutateAsync({ customer_id: customerId })
      console.log('[AddCard] HelcimPay session ready, checkoutToken:', session.checkoutToken?.slice(0, 10))
      // Hand off to parent — parent closes this modal first, then launches Helcim's overlay
      onLaunchHelcim(session.checkoutToken)
    } catch (err) {
      console.error('[AddCard] initCardSaveSession failed:', err)
      toast.error((err as Error).message ?? 'Failed to start card entry')
      setStep({ type: 'error', message: (err as Error).message })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Add Card on File</h2>
          <button type="button" onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="px-6 py-5">

          {/* Choose method */}
          {step.type === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">How would you like to add the card?</p>
              <button type="button"
                onClick={() => setStep({ type: 'terminal_select' })}
                className="w-full flex items-center gap-4 rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 shrink-0">
                  <Monitor className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Terminal</p>
                  <p className="text-xs text-gray-400">Customer taps or inserts card on the reader</p>
                </div>
              </button>
              <button type="button"
                onClick={handleManualEntry}
                disabled={initHelcimSession.isPending}
                className="w-full flex items-center gap-4 rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50 transition-colors disabled:opacity-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 shrink-0">
                  <CreditCard className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Manual Entry {initHelcimSession.isPending && <span className="text-gray-400 font-normal">Loading…</span>}
                  </p>
                  <p className="text-xs text-gray-400">Customer types card number on screen</p>
                </div>
              </button>
            </div>
          )}

          {/* Select terminal */}
          {step.type === 'terminal_select' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Select a terminal:</p>
              {terminals.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No terminals found.</p>
              ) : (
                terminals.map((t) => (
                  <button type="button" key={t.terminalId} onClick={() => handleTerminalSelect(String(t.terminalId))}
                    disabled={verifyViaTerminal.isPending}
                    className="w-full flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-brand-50 transition-colors disabled:opacity-50">
                    <Monitor className="h-4 w-4 text-brand-600 shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{t.terminalName}</span>
                    {verifyViaTerminal.isPending && <span className="ml-auto text-xs text-gray-400">Sending…</span>}
                  </button>
                ))
              )}
              <button type="button" onClick={() => setStep({ type: 'choose' })}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-1">← Back</button>
            </div>
          )}

          {/* Waiting on terminal */}
          {step.type === 'terminal_waiting' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <CreditCard className="h-7 w-7 text-brand-600 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Waiting for card…</p>
                <p className="text-xs text-gray-400 mt-1">Ask the customer to tap or insert their card</p>
              </div>
              <button type="button" onClick={() => { if (pollRef.current) clearTimeout(pollRef.current); onClose() }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">Cancel</button>
            </div>
          )}

          {/* Success */}
          {step.type === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CreditCard className="h-7 w-7 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Card saved!</p>
                {step.card_last4 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {step.card_brand
                      ? step.card_brand.charAt(0).toUpperCase() + step.card_brand.slice(1)
                      : 'Card'} ···· {step.card_last4}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { onSaved(); onClose() }}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Done
              </button>
            </div>
          )}

          {/* Error */}
          {step.type === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full">
                {step.message}
              </p>
              <button type="button" onClick={() => setStep({ type: 'choose' })}
                className="text-sm text-brand-600 hover:underline">Try again</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Tab: Edit ────────────────────────────────────────────────────────────────

function EditTab({ customer, onSaved }: { customer: Customer; onSaved: () => void }) {
  const utils = trpc.useUtils()
  const [form, setForm]               = useState<CustomerFormData>(() => initForm(customer))
  const [showAddCard, setShowAddCard] = useState(false)
  // Track whether we're waiting for HelcimPay.js to complete (modal is closed, Helcim overlay is open)
  const [helcimListening, setHelcimListening] = useState(false)
  const set = (k: keyof CustomerFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const { data: priceLists = [] } = trpc.priceLists.list.useQuery()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()

  const prefOptions: Required<OrderPreferenceOptions> = {
    ...DEFAULT_PREFERENCE_OPTIONS,
    ...((tenant?.settings as TenantSettings)?.order_preference_options ?? {}),
  }

  const update     = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success('Customer saved')
      utils.customers.getById.invalidate({ id: customer.id })
      onSaved()
    },
    onError: (e) => toast.error(e.message),
  })
  const removeCard    = trpc.payments.removeCard.useMutation({
    onSuccess: () => {
      toast.success('Card removed')
      utils.customers.getById.invalidate({ id: customer.id })
    },
    onError: (e) => toast.error(e.message),
  })
  const saveCardToken = trpc.payments.saveCardToken.useMutation()

  // ── HelcimPay.js message listener (lives here so modal can be closed) ─────
  useEffect(() => {
    if (!helcimListening) return
    const handler = async (event: MessageEvent) => {
      if (typeof event.data !== 'object') return
      const { eventType, eventStatus, data } = event.data as {
        eventType?: string; eventStatus?: string
        data?: { cardToken?: string; cardNumber?: string; cardType?: string }
      }
      if (eventType !== 'HELCIM_PAY_JS_TRANSACTION_COMPLETE') return
      setHelcimListening(false)
      if (eventStatus === 'SUCCESS' && data?.cardToken) {
        try {
          await saveCardToken.mutateAsync({
            customer_id: customer.id,
            card_token:  data.cardToken,
            card_last4:  data.cardNumber?.slice(-4) ?? null,
            card_brand:  data.cardType ?? null,
          })
          utils.customers.getById.invalidate({ id: customer.id })
          toast.success('Card saved!')
        } catch {
          toast.error('Failed to save card.')
        }
      } else {
        toast.error('Card entry cancelled or declined.')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [helcimListening, customer.id, saveCardToken, utils])

  function launchHelcim(checkoutToken: string) {
    setShowAddCard(false)   // close our modal first — Helcim overlay needs a clear path
    setHelcimListening(true)
    const launch = () => {
      // @ts-expect-error — Helcim global
      if (typeof appendHelcimIframe === 'function') {
        console.log('[AddCard] calling appendHelcimIframe')
        // @ts-expect-error
        appendHelcimIframe(checkoutToken)
      } else {
        console.error('[AddCard] appendHelcimIframe not found on window — script may not have loaded')
        toast.error('Card entry could not load. Please try again.')
        setHelcimListening(false)
      }
    }
    const existing = document.getElementById('helcim-pay-js')
    if (!existing) {
      console.log('[AddCard] loading helcim-pay-js script')
      const script = document.createElement('script')
      script.id     = 'helcim-pay-js'
      script.src    = 'https://secure.myhelcim.com/js/version2.js'
      script.onload = launch
      script.onerror = () => {
        console.error('[AddCard] failed to load helcim-pay-js script')
        toast.error('Card entry script failed to load.')
        setHelcimListening(false)
      }
      document.body.appendChild(script)
    } else {
      console.log('[AddCard] helcim-pay-js already loaded, launching directly')
      launch()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    update.mutate({
      id: customer.id,
      first_name:          form.first_name.trim(),
      last_name:           form.last_name.trim(),
      phone:               form.phone.trim(),
      secondary_phone:     form.secondary_phone.trim() || null,
      email:               form.email.trim() || null,
      address_street:      form.address_street.trim() || null,
      address_apt:         form.address_apt.trim() || null,
      address_city:        form.address_city.trim() || null,
      address_postal_code: form.address_postal_code.trim() || null,
      driver_instructions: form.driver_instructions.trim() || null,
      notes:               form.notes.trim() || null,
      private_notes:       form.private_notes.trim() || null,
      price_list_id:       form.price_list_id || null,
      payment_type:        form.payment_type,
      marketing_opt_in:    form.marketing_opt_in !== 'No' && form.marketing_opt_in !== '',
      invoice_style:       form.invoice_style,
      discount_percent:    parseInt(form.discount_percent) || 0,
      account_balance:     Math.round((parseFloat(form.account_balance) || 0) * 100),
      delivery_fee_cents:  Math.round((parseFloat(form.delivery_fee) || 0) * 100),
      notification_preference: form.notification_preference,
      notification_topics: {
        order_confirmed:  form.notif_order_confirmed,
        order_ready:      form.notif_order_ready,
        pickup_reminder:  form.notif_pickup_reminder,
        billing:          form.notif_billing,
      },
      tax_exempt:          form.tax_exempt,
      order_preferences: {
        bleach:           form.pref_bleach || undefined,
        dryer_sheets:     form.pref_dryer_sheets || undefined,
        detergent_type:   form.pref_detergent_type || undefined,
        fabric_softener:  form.pref_fabric_softener || undefined,
        wash_temperature: form.pref_wash_temperature || undefined,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-6">

      {/* Contact */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Contact</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">First Name <span className="text-red-500">*</span></label>
            <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
            <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone <span className="text-red-500">*</span></label>
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Secondary Phone</label>
            <Input type="tel" value={form.secondary_phone} onChange={(e) => set('secondary_phone', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Address</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Street Address</label>
            <AddressAutocomplete
              value={form.address_street}
              onChange={(v) => set('address_street', v)}
              onSelect={(fields) => setForm((f) => ({
                ...f,
                address_street:      fields.street,
                address_city:        fields.city,
                address_postal_code: fields.postal_code,
              }))}
              placeholder="Start typing address…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Apt / Unit</label>
            <Input value={form.address_apt} onChange={(e) => set('address_apt', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <Input value={form.address_city} onChange={(e) => set('address_city', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Postal / ZIP</label>
            <Input value={form.address_postal_code} onChange={(e) => set('address_postal_code', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Driver Instructions</label>
            <Input value={form.driver_instructions} onChange={(e) => set('driver_instructions', e.target.value)} placeholder="Ring buzzer #2" />
          </div>
        </div>
      </div>

      {/* Billing */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Billing</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Price List</label>
            <select value={form.price_list_id} onChange={(e) => set('price_list_id', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Default</option>
              {priceLists.filter((pl) => !pl.is_default).map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
            <InlineSelect value={form.payment_type} onChange={(v) => set('payment_type', v)} options={PAYMENT_TYPES} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Style</label>
            <InlineSelect value={form.invoice_style} onChange={(v) => set('invoice_style', v)} options={INVOICE_STYLES} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Discount (%)</label>
            <Input type="number" min="0" max="100" step="1" value={form.discount_percent} onChange={(e) => set('discount_percent', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Account Credit ($)</label>
            <Input type="number" min="0" step="0.01" value={form.account_balance} onChange={(e) => set('account_balance', e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Fee ($)</label>
            <Input type="number" min="0" step="0.01" value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Marketing</label>
            <InlineSelect value={form.marketing_opt_in} onChange={(v) => set('marketing_opt_in', v)} options={MARKETING_OPTIONS} />
          </div>
        </div>
        <div className="mt-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={form.tax_exempt} onChange={(e) => set('tax_exempt', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-gray-700">Tax Exempt</span>
          </label>
        </div>
      </div>

      {/* Notifications */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Notifications</h3>
        {/* Channel */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3">
          {([
            { value: 'sms_email', label: 'SMS & Email' },
            { value: 'sms',       label: 'SMS only'    },
            { value: 'email',     label: 'Email only'  },
            { value: 'none',      label: 'Do Not Notify' },
          ] as const).map((opt) => (
            <button key={opt.value} type="button" onClick={() => set('notification_preference', opt.value)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-medium text-center transition-colors',
                form.notification_preference === opt.value
                  ? opt.value === 'none'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-brand-400 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}>
              {opt.label}
            </button>
          ))}
        </div>
        {/* Topics — only shown when notifications are enabled */}
        {form.notification_preference !== 'none' && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notify about</p>
            {([
              { key: 'notif_order_confirmed' as const, label: 'Order Confirmed',  desc: 'When cleaning begins'           },
              { key: 'notif_order_ready'     as const, label: 'Order Ready',      desc: 'When laundry is done'           },
              { key: 'notif_pickup_reminder' as const, label: 'Pickup Reminder',  desc: 'Day before scheduled pickup'    },
              { key: 'notif_billing'         as const, label: 'Billing',          desc: 'Invoices and payment receipts'  },
            ]).map(({ key, label, desc }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => set(key, !form[key])}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none',
                    form[key] ? 'bg-brand-500' : 'bg-gray-200'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    form[key] ? 'translate-x-4' : 'translate-x-0'
                  )} />
                </button>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Saved Card */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Saved Card</h3>
          {!customer.saved_card_last4 && (
            <button type="button" onClick={() => setShowAddCard(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <Plus className="h-3.5 w-3.5" /> Add Card
            </button>
          )}
        </div>
        {customer.saved_card_last4 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <CreditCard className="h-5 w-5 text-gray-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {customer.saved_card_brand
                  ? customer.saved_card_brand.charAt(0).toUpperCase() + customer.saved_card_brand.slice(1)
                  : 'Card'} ···· {customer.saved_card_last4}
              </p>
              <p className="text-xs text-gray-500">Saved card on file</p>
            </div>
            <button type="button"
              onClick={() => setShowAddCard(true)}
              className="text-xs text-brand-600 hover:underline shrink-0">
              Replace
            </button>
            <button type="button"
              onClick={() => removeCard.mutate({ customer_id: customer.id })}
              disabled={removeCard.isPending}
              className="ml-1 p-1 text-gray-400 hover:text-red-500 disabled:opacity-50 shrink-0">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
            <CreditCard className="h-5 w-5 shrink-0" />
            No saved card on file.
          </div>
        )}
      </div>

      {showAddCard && (
        <AddCardModal
          customerId={customer.id}
          onClose={() => setShowAddCard(false)}
          onSaved={() => utils.customers.getById.invalidate({ id: customer.id })}
          onLaunchHelcim={launchHelcim}
        />
      )}

      {/* Notes */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Notes</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Visible on orders…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Private Notes</label>
            <textarea value={form.private_notes} onChange={(e) => set('private_notes', e.target.value)} rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Staff only…" />
          </div>
        </div>
      </div>

      {/* Order Preferences */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Order Preferences</h3>
        <div className="grid grid-cols-3 gap-3">
          <PrefSelect label="Bleach"          value={form.pref_bleach}          onChange={(v) => set('pref_bleach', v)}          options={prefOptions.bleach} />
          <PrefSelect label="Dryer Sheets"    value={form.pref_dryer_sheets}    onChange={(v) => set('pref_dryer_sheets', v)}    options={prefOptions.dryer_sheets} />
          <PrefSelect label="Detergent Type"  value={form.pref_detergent_type}  onChange={(v) => set('pref_detergent_type', v)}  options={prefOptions.detergent_type} />
          <PrefSelect label="Fabric Softener" value={form.pref_fabric_softener} onChange={(v) => set('pref_fabric_softener', v)} options={prefOptions.fabric_softener} />
          <PrefSelect label="Wash Temp"       value={form.pref_wash_temperature}onChange={(v) => set('pref_wash_temperature', v)}options={prefOptions.wash_temperature} />
        </div>
      </div>

      {/* Save */}
      <div className="pt-2 border-t border-gray-100">
        <Button type="submit" disabled={update.isPending} className="w-full">
          {update.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtMsgTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  return isToday
    ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function summarizeLines(lines: { name: string; category: string; quantity: number; unit_label: string }[]) {
  const groups: Record<string, { qty: number; unit: string }> = {}
  for (const l of lines) {
    if (l.category === 'upcharge') continue
    const key = l.name.includes('· Bag') ? 'Wash & Fold' : l.name
    if (!groups[key]) groups[key] = { qty: 0, unit: l.unit_label }
    groups[key].qty += l.quantity
  }
  return Object.entries(groups)
    .map(([name, { qty, unit }]) =>
      unit === 'lb' ? `${name} ${qty % 1 === 0 ? qty : qty.toFixed(1)}lb`
        : qty === 1 ? name : `${name} ×${qty}`)
    .join(', ') || '—'
}

// ─── Collect Payment Modal ─────────────────────────────────────────────────────

function CollectPaymentModal({
  unpaidOrders, onClose, onSuccess,
}: {
  unpaidOrders: { id: string; order_number: string; total_amount: number; paid_amount: number }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(unpaidOrders.map((o) => o.id)))
  const [method, setMethod]           = useState<PaymentMethod>('cash')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const utils = trpc.useUtils()
  const recordPayment = trpc.orders.recordPayment.useMutation()

  const selected = unpaidOrders.filter((o) => selectedIds.has(o.id))
  const total    = selected.reduce((s, o) => s + (o.total_amount - (o.paid_amount ?? 0)), 0)

  function toggle(id: string) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSubmit() {
    if (!selected.length) return
    setSaving(true); setError(null)
    try {
      for (const o of selected) {
        await recordPayment.mutateAsync({ order_id: o.id, amount_cents: o.total_amount - (o.paid_amount ?? 0), method })
      }
      await utils.customers.getOrderHistory.invalidate()
      await utils.customers.getCustomerPayments.invalidate()
      onSuccess(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Collect Payment</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Orders</p>
            <div className="space-y-2">
              {unpaidOrders.map((o) => {
                const balance = o.total_amount - (o.paid_amount ?? 0)
                const checked = selectedIds.has(o.id)
                return (
                  <label key={o.id} className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                    checked ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'
                  )}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(o.id)} className="h-4 w-4 accent-brand-600" />
                    <span className="flex-1 text-sm font-medium text-gray-800">{o.order_number}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(balance)}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Method</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setMethod(value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors',
                    method === value ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-600">Total</span>
            <span className="text-xl font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !selected.length || total <= 0}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Processing…' : `Record ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Orders ──────────────────────────────────────────────────────────────

type OrderRow = {
  id: string; order_number: string; status: string; payment_status: string
  total_amount: number; paid_amount: number; created_at: string
  ready_at?: string | null; due_date?: string | null; notes?: string | null
  lines: unknown
}

function OrdersTab({ orders, onViewOrder }: { orders: OrderRow[]; onViewOrder: (id: string) => void }) {
  const active = orders.filter((o) => !['delivered', 'cancelled', 'picked_up'].includes(o.status))
  const past   = orders.filter((o) =>  ['delivered', 'cancelled', 'picked_up'].includes(o.status))

  function Section({ title, rows }: { title: string; rows: OrderRow[] }) {
    if (!rows.length) return (
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
        <p className="text-sm text-gray-400 italic">No orders</p>
      </div>
    )
    return (
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{['Order #', 'Date', 'Items', 'Status', 'Payment', 'Total', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-400">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const lines = (o.lines as { name: string; category: string; quantity: number; unit_label: string }[]) ?? []
                const balance = o.total_amount - (o.paid_amount ?? 0)
                const isPaid = o.payment_status === 'paid'
                return (
                  <tr key={o.id} onClick={() => onViewOrder(o.id)}
                    className="cursor-pointer border-t border-gray-100 hover:bg-brand-50/40 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-brand-600">{o.order_number}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[160px] truncate">{summarizeLines(lines)}</td>
                    <td className="px-3 py-2.5 text-gray-500 capitalize whitespace-nowrap">{o.status === 'pending' ? 'Detail' : o.status.replace('_', ' ')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('font-semibold', isPaid ? 'text-green-600' : 'text-amber-500')}>
                        {isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap text-right">
                      {isPaid ? formatCurrency(o.total_amount) : <span className="text-amber-600">{formatCurrency(balance)}</span>}
                    </td>
                    <td className="px-3 py-2.5"><ChevronRight className="h-3.5 w-3.5 text-gray-300" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
      <Section title="Active Orders" rows={active} />
      <Section title="Past Orders"   rows={past}   />
    </>
  )
}

// ─── Tab: Stats ───────────────────────────────────────────────────────────────

function StatsTab({ orders, customer }: { orders: OrderRow[]; customer: { created_at?: string | null; account_balance?: number } }) {
  const totalOrders  = orders.length
  const totalSales   = orders.reduce((s, o) => s + o.total_amount, 0)
  const totalPaid    = orders.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + o.total_amount, 0)
  const unpaidOrders = orders.filter((o) => o.payment_status !== 'paid' && o.status !== 'cancelled')
  const totalUnpaid  = unpaidOrders.reduce((s, o) => s + (o.total_amount - (o.paid_amount ?? 0)), 0)
  const avgSpend     = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0
  const lastOrder    = orders[0]?.created_at ?? null

  let avgFreqDays: number | null = null
  if (orders.length >= 2) {
    const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) / 86_400_000)
    }
    avgFreqDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  }

  const itemCounts: Record<string, number> = {}
  for (const o of orders) {
    const lines = (o.lines as { name: string; category: string; quantity: number }[]) ?? []
    for (const l of lines) {
      if (l.category === 'upcharge') continue
      const key = l.name.includes('· Bag') ? 'Wash & Fold' : l.name
      itemCounts[key] = (itemCounts[key] ?? 0) + l.quantity
    }
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => `${name} (${qty})`)
    .join(', ')

  function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className={cn('text-xl font-bold text-gray-900', color)}>{value}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <Stat label="Orders"  value={String(totalOrders)} />
        <Stat label="Sales"   value={formatCurrency(totalSales)} />
        <Stat label="Paid"    value={formatCurrency(totalPaid)}  color="text-green-600" />
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Unpaid</p>
          <p className={cn('text-xl font-bold', totalUnpaid > 0 ? 'text-red-500' : 'text-gray-900')}>
            {formatCurrency(totalUnpaid)}
          </p>
          {unpaidOrders.length > 0 && (
            <p className="text-xs text-red-400">({unpaidOrders.length} orders)</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <Stat label="Signed Up"     value={fmtDate(customer.created_at)} />
        <Stat label="Last Order"    value={fmtDate(lastOrder)} />
        <Stat label="Avg Frequency" value={avgFreqDays != null ? `${avgFreqDays} days` : '—'} />
        <Stat label="Avg Spend"     value={avgSpend > 0 ? formatCurrency(avgSpend) : '—'} />
      </div>

      {(customer.account_balance ?? 0) > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Account Credit</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(customer.account_balance ?? 0)}</p>
        </div>
      )}

      {topItems && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Most Popular Items</p>
          <p className="text-sm text-gray-700">{topItems}</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Payments ────────────────────────────────────────────────────────────

function PaymentsTab({ customerId, members }: { customerId: string; members: { user_id: string; display_name: string }[] }) {
  const { data: payments = [] } = trpc.customers.getCustomerPayments.useQuery({ customerId })
  const memberName = (uid: string | null | undefined) =>
    uid ? (members.find((m) => m.user_id === uid)?.display_name ?? '—') : '—'

  if (!payments.length) return <p className="text-sm text-gray-400 italic text-center py-10">No payments on record</p>

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>{['Order #', 'Date', 'Method', 'Amount', 'Staff'].map((h) => (
            <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-gray-400">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-mono font-bold text-brand-600">{p.order_number ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDateTime(p.processed_at)}</td>
              <td className="px-4 py-3 text-gray-700">{METHOD_LABEL[p.method] ?? p.method}</td>
              <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
              <td className="px-4 py-3 text-gray-500">{memberName(p.processed_by)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab: Messages ────────────────────────────────────────────────────────────

type MsgRow = { id: string; direction: string; body: string; subject?: string | null; channel: string; staff_user_id?: string | null; created_at: string }

function MessagesTab({ customerId }: { customerId: string }) {
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: messages = [], refetch } = trpc.messages.listForCustomer.useQuery({ customer_id: customerId })
  const markRead = trpc.messages.markRead.useMutation({ onSuccess: () => utils.messages.unreadCount.invalidate() })
  const sendSms  = trpc.messages.sendSms.useMutation({
    onSuccess: () => { setDraft(''); refetch(); utils.messages.unreadCount.invalidate(); utils.messages.inbox.invalidate() },
    onError: (e) => toast.error(e.message),
  })

  useEffect(() => { markRead.mutate({ customer_id: customerId }) }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, [messages])

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      {(messages as MsgRow[]).length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <MessageSquare className="h-8 w-8 text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No messages yet</p>
        </div>
      ) : (
        <div ref={threadRef} className="flex-1 overflow-y-auto space-y-2 mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 max-h-[400px]">
          {(messages as MsgRow[]).map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={cn(
                'max-w-[75%] rounded-2xl px-3 py-2 text-xs',
                msg.direction === 'outbound'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
              )}>
                {msg.subject && <p className="font-medium mb-0.5 opacity-75">{msg.subject}</p>}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                <p className={cn('text-[9px] mt-1', msg.direction === 'outbound' ? 'text-brand-200' : 'text-gray-400')}>
                  {fmtMsgTime(msg.created_at)}
                  {msg.channel === 'email' ? ' · email' : ''}
                  {msg.direction === 'outbound' && !msg.staff_user_id ? ' · auto' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft.trim()) sendSms.mutate({ customer_id: customerId, body: draft.trim() }) } }}
          rows={2} placeholder="Send an SMS… (Enter to send)"
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button onClick={() => { if (draft.trim()) sendSms.mutate({ customer_id: customerId, body: draft.trim() }) }}
          disabled={!draft.trim() || sendSms.isPending}
          className="flex items-center justify-center h-9 w-9 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 shrink-0">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Tab: Pickups ─────────────────────────────────────────────────────────────

function PickupsTab({ customer }: { customer: { id: string; first_name: string; last_name: string; phone: string; address_street?: string | null; address_city?: string | null } }) {
  const [showAdd, setShowAdd] = useState(false)
  const { data: schedules = [], refetch } = trpc.pickupSchedules.list.useQuery({ customer_id: customer.id })

  const FREQ_LABEL: Record<string, string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', once: 'One-time' }
  const DAY_LABEL  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pickup Schedules</p>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <Truck className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No pickup schedules</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const zone = s.zone as { name: string; color: string } | null
            return (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">
                        {FREQ_LABEL[s.frequency] ?? s.frequency}
                      </span>
                      {s.day_of_week != null && (
                        <span className="text-xs text-gray-500">· {DAY_LABEL[s.day_of_week]}s</span>
                      )}
                      {s.pickup_date && (
                        <span className="text-xs text-gray-500">· {fmtDate(s.pickup_date)}</span>
                      )}
                    </div>
                    {s.time_window_start && s.time_window_end && (
                      <p className="text-xs text-gray-500">{s.time_window_start} – {s.time_window_end}</p>
                    )}
                    {zone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="h-2 w-2 rounded-full" style={{ background: zone.color }} />
                        <span className="text-xs text-gray-500">{zone.name}</span>
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  )}>{s.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <ScheduleModal
          initialCustomer={{ id: customer.id, first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone, address_street: customer.address_street ?? null, address_city: customer.address_city ?? null }}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refetch() }}
        />
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function CustomerProfilePanel({ customerId, onClose, initialTab }: {
  customerId: string
  onClose: () => void
  initialTab?: Tab
}) {
  const [tab,            setTab]            = useState<Tab>(initialTab ?? 'orders')
  const [showCollect,    setShowCollect]    = useState(false)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)

  const { data: customer }  = trpc.customers.getById.useQuery({ id: customerId })
  const { data: orders = [], refetch: refetchOrders } = trpc.customers.getOrderHistory.useQuery({ customerId })
  const { data: members = [] } = trpc.tenants.getMembers.useQuery()

  const unpaidOrders = (orders as OrderRow[])
    .filter((o) => o.payment_status !== 'paid' && o.status !== 'cancelled')
    .map((o) => ({ id: o.id, order_number: o.order_number, total_amount: o.total_amount, paid_amount: o.paid_amount }))

  const totalOutstanding = unpaidOrders.reduce((s, o) => s + (o.total_amount - (o.paid_amount ?? 0)), 0)

  return (
    <>
      {viewingOrderId && (
        <OrderDetailModal orderId={viewingOrderId} onClose={() => { setViewingOrderId(null); refetchOrders() }} />
      )}
      {showCollect && unpaidOrders.length > 0 && (
        <CollectPaymentModal unpaidOrders={unpaidOrders} onClose={() => setShowCollect(false)} onSuccess={refetchOrders} />
      )}

      {/* Backdrop */}
      <div className="fixed inset-0 z-[70] flex items-stretch justify-end bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>

        <div className="relative h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
            <div className="min-w-0">
              {customer ? (
                <>
                  <h2 className="text-lg font-bold text-gray-900 truncate">
                    {customer.first_name} {customer.last_name}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[customer.phone, customer.email].filter(Boolean).join(' · ')}
                  </p>
                </>
              ) : (
                <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {totalOutstanding > 0 && (
                <button onClick={() => setShowCollect(true)}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                  Collect {formatCurrency(totalOutstanding)}
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 border-b border-gray-200 px-6 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={cn(
                    'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    tab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === 'orders' && (
              <OrdersTab orders={orders as OrderRow[]} onViewOrder={setViewingOrderId} />
            )}
            {tab === 'stats' && customer && (
              <StatsTab orders={orders as OrderRow[]} customer={customer} />
            )}
            {tab === 'payments' && (
              <PaymentsTab customerId={customerId} members={members} />
            )}
            {tab === 'messages' && (
              <MessagesTab customerId={customerId} />
            )}
            {tab === 'pickups' && customer && (
              <PickupsTab customer={customer as { id: string; first_name: string; last_name: string; phone: string; address_street?: string | null; address_city?: string | null }} />
            )}
            {tab === 'edit' && customer && (
              <EditTab customer={customer as Customer} onSaved={() => setTab('orders')} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
