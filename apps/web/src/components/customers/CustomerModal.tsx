'use client'

import { useState, useRef, useEffect } from 'react'
import { X, CreditCard, Plus, Truck, Send, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { trpc } from '@/lib/trpc'
import type { Customer, TenantSettings, OrderPreferenceOptions } from '@laundry/db'
import toast from 'react-hot-toast'
import { ScheduleModal } from '@/components/pickups/ScheduleModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCE_OPTIONS: Required<OrderPreferenceOptions> = {
  bleach:           ['Yes', 'No', 'Whites Only', 'Delicates Only'],
  dryer_sheets:     ['Yes', 'No', 'Fragrance Free'],
  detergent_type:   ['Store Default', 'HE', 'Sensitive', 'Fragrance Free', 'Pods'],
  fabric_softener:  ['Yes', 'No', 'Fragrance Free'],
  wash_temperature: ['Cold', 'Warm', 'Hot'],
}

const PAYMENT_TYPES = ['Default', 'Cash', 'Account', 'Card']
const INVOICE_STYLES = ['Store Default', 'Detailed', 'Summary']
const MARKETING_OPTIONS = ['No', 'Email', 'SMS', 'Email & SMS']

// ─── Form types ───────────────────────────────────────────────────────────────

interface CustomerFormData {
  first_name: string; last_name: string; phone: string; secondary_phone: string
  email: string; address_street: string; address_apt: string; address_city: string
  address_postal_code: string; driver_instructions: string; notes: string
  private_notes: string; price_list_id: string; payment_type: string
  marketing_opt_in: string; invoice_style: string; discount_percent: string
  account_balance: string; delivery_fee: string; tax_exempt: boolean
  notification_preference: 'sms' | 'email' | 'sms_email' | 'none'
  pref_bleach: string; pref_dryer_sheets: string; pref_detergent_type: string
  pref_fabric_softener: string; pref_wash_temperature: string
}

function initForm(customer?: Customer | null): CustomerFormData {
  return {
    first_name:           customer?.first_name ?? '',
    last_name:            customer?.last_name ?? '',
    phone:                customer?.phone ?? '',
    secondary_phone:      customer?.secondary_phone ?? '',
    email:                customer?.email ?? '',
    address_street:       customer?.address_street ?? '',
    address_apt:          customer?.address_apt ?? '',
    address_city:         customer?.address_city ?? '',
    address_postal_code:  customer?.address_postal_code ?? '',
    driver_instructions:  customer?.driver_instructions ?? '',
    notes:                customer?.notes ?? '',
    private_notes:        customer?.private_notes ?? '',
    price_list_id:        customer?.price_list_id ?? '',
    payment_type:         customer?.payment_type ?? 'default',
    marketing_opt_in:     customer?.marketing_opt_in ? 'Email & SMS' : 'No',
    invoice_style:        customer?.invoice_style ?? 'store_default',
    discount_percent:     String(customer?.discount_percent ?? 0),
    account_balance:      String((customer?.account_balance ?? 0) / 100),
    tax_exempt:           customer?.tax_exempt ?? false,
    delivery_fee:         String((customer?.delivery_fee_cents ?? 0) / 100),
    notification_preference: customer?.notification_preference ?? 'sms_email',
    pref_bleach:          customer?.order_preferences?.bleach ?? '',
    pref_dryer_sheets:    customer?.order_preferences?.dryer_sheets ?? '',
    pref_detergent_type:  customer?.order_preferences?.detergent_type ?? '',
    pref_fabric_softener: customer?.order_preferences?.fabric_softener ?? '',
    pref_wash_temperature:customer?.order_preferences?.wash_temperature ?? '',
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Select({ value, onChange, options, placeholder }: {
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

// ─── Pickup Schedules section ─────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = { once: 'One-time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

function PickupSchedulesSection({
  customerId, customerName, customerPhone, customerAddress, customerCity, onAddSchedule,
}: {
  customerId: string; customerName: string; customerPhone: string | null
  customerAddress: string | null; customerCity: string | null; onAddSchedule: () => void
}) {
  const utils = trpc.useUtils()
  const { data: schedules = [] } = trpc.pickupSchedules.list.useQuery({ customer_id: customerId })

  const cancel = trpc.pickupSchedules.cancel.useMutation({
    onSuccess: () => utils.pickupSchedules.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pickup Schedules</h3>
        <button type="button" onClick={onAddSchedule}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add schedule
        </button>
      </div>
      {schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-center">
          <p className="text-xs text-gray-400">
            No active schedules.{' '}
            <button type="button" onClick={onAddSchedule} className="text-brand-600 hover:underline">Add one</button>
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
          {(schedules as {
            id: string; frequency: string; day_of_week: number | null; next_pickup_date: string | null
            end_date: string | null; pickup_start: string | null; status: string
            zone: { name: string; color: string } | null
          }[]).map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Truck className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {FREQ_LABELS[s.frequency] ?? s.frequency}
                    {s.day_of_week != null && s.frequency !== 'once' ? ` · ${DAY_NAMES[s.day_of_week]}` : ''}
                  </p>
                  {s.zone && (
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 text-white"
                      style={{ background: s.zone.color }}>{s.zone.name}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {s.next_pickup_date ? `Next: ${fmtDate(s.next_pickup_date)}` : '—'}
                  {s.end_date ? ` · Ends ${fmtDate(s.end_date)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => cancel.mutate({ id: s.id })}
                className="text-xs text-gray-300 hover:text-red-500 transition-colors shrink-0">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Messages section ─────────────────────────────────────────────────────────

type MsgRow = {
  id: string
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  body: string
  subject: string | null
  staff_user_id: string | null
  created_at: string
}

function fmtMsgTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function MessagesSection({ customerId }: { customerId: string }) {
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: messages = [], refetch } = trpc.messages.listForCustomer.useQuery({ customer_id: customerId })
  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => utils.messages.unreadCount.invalidate(),
  })
  const sendSms = trpc.messages.sendSms.useMutation({
    onSuccess: () => {
      setDraft('')
      refetch()
      utils.messages.unreadCount.invalidate()
      utils.messages.inbox.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  useEffect(() => {
    markRead.mutate({ customer_id: customerId })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages])

  const handleSend = () => {
    if (!draft.trim()) return
    sendSms.mutate({ customer_id: customerId, body: draft.trim() })
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Messages</h3>
      {(messages as MsgRow[]).length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center">
          <MessageSquare className="mx-auto h-5 w-5 text-gray-300 mb-1" />
          <p className="text-xs text-gray-400">No messages yet</p>
        </div>
      ) : (
        <div ref={threadRef} className="rounded-xl border border-gray-200 bg-gray-50 overflow-y-auto max-h-52 p-3 space-y-2 mb-3">
          {(messages as MsgRow[]).map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                msg.direction === 'outbound'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
              }`}>
                {msg.subject && <p className="font-medium mb-0.5 opacity-75">{msg.subject}</p>}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-[9px] mt-1 ${msg.direction === 'outbound' ? 'text-brand-200' : 'text-gray-400'}`}>
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
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          rows={2}
          placeholder="Send an SMS… (Enter to send)"
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim() || sendSms.isPending}
          className="flex items-center justify-center h-9 w-9 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  customer?: Customer | null
  onClose: () => void
  onSaved: (customer: Customer) => void
}

export function CustomerModal({ customer, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CustomerFormData>(() => initForm(customer))
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const set = (k: keyof CustomerFormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  const { data: priceLists = [] } = trpc.priceLists.list.useQuery()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()

  const prefOptions: Required<OrderPreferenceOptions> = {
    ...DEFAULT_PREFERENCE_OPTIONS,
    ...((tenant?.settings as TenantSettings)?.order_preference_options ?? {}),
  }

  const create = trpc.customers.create.useMutation({
    onSuccess: (c) => { toast.success('Customer added'); onSaved(c as Customer) },
    onError: (e) => toast.error(e.message),
  })
  const update = trpc.customers.update.useMutation({
    onSuccess: (c) => { toast.success('Customer saved'); onSaved(c as Customer) },
    onError: (e) => toast.error(e.message),
  })

  const isPending = create.isPending || update.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
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
      delivery_fee_cents:        Math.round((parseFloat(form.delivery_fee) || 0) * 100),
      notification_preference:   form.notification_preference,
      tax_exempt:                form.tax_exempt,
      order_preferences: {
        bleach:           form.pref_bleach || undefined,
        dryer_sheets:     form.pref_dryer_sheets || undefined,
        detergent_type:   form.pref_detergent_type || undefined,
        fabric_softener:  form.pref_fabric_softener || undefined,
        wash_temperature: form.pref_wash_temperature || undefined,
      },
    }
    if (customer) {
      update.mutate({ id: customer.id, ...payload })
    } else {
      create.mutate(payload)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-6 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-base font-semibold text-gray-900">
            {customer ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Contact</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">First Name <span className="text-red-500">*</span></label>
                <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required autoFocus />
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
                <Select value={form.payment_type} onChange={(v) => set('payment_type', v)} options={PAYMENT_TYPES} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Style</label>
                <Select value={form.invoice_style} onChange={(v) => set('invoice_style', v)} options={INVOICE_STYLES} />
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
                <Select value={form.marketing_opt_in} onChange={(v) => set('marketing_opt_in', v)} options={MARKETING_OPTIONS} />
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                { value: 'sms_email', label: 'SMS & Email' },
                { value: 'sms',       label: 'SMS only' },
                { value: 'email',     label: 'Email only' },
                { value: 'none',      label: 'Do Not Notify' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('notification_preference', opt.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-center transition-colors ${
                    form.notification_preference === opt.value
                      ? opt.value === 'none'
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-brand-400 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Card */}
          {customer && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Saved Card</h3>
              {customer.saved_card_last4 ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <CreditCard className="h-5 w-5 text-gray-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {customer.saved_card_brand ?? 'Card'} ···· {customer.saved_card_last4}
                    </p>
                    <p className="text-xs text-gray-500">Added by customer via receipt link</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
                  <CreditCard className="h-5 w-5 shrink-0" />
                  No saved card — customer can add one via their receipt link.
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Notes</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Visible on orders..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Private Notes</label>
                <textarea value={form.private_notes} onChange={(e) => set('private_notes', e.target.value)} rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Staff only..." />
              </div>
            </div>
          </div>

          {/* Order Preferences */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Order Preferences</h3>
            <div className="grid grid-cols-3 gap-3">
              <PrefSelect label="Bleach" value={form.pref_bleach} onChange={(v) => set('pref_bleach', v)} options={prefOptions.bleach} />
              <PrefSelect label="Dryer Sheets" value={form.pref_dryer_sheets} onChange={(v) => set('pref_dryer_sheets', v)} options={prefOptions.dryer_sheets} />
              <PrefSelect label="Detergent Type" value={form.pref_detergent_type} onChange={(v) => set('pref_detergent_type', v)} options={prefOptions.detergent_type} />
              <PrefSelect label="Fabric Softener" value={form.pref_fabric_softener} onChange={(v) => set('pref_fabric_softener', v)} options={prefOptions.fabric_softener} />
              <PrefSelect label="Wash Temperature" value={form.pref_wash_temperature} onChange={(v) => set('pref_wash_temperature', v)} options={prefOptions.wash_temperature} />
            </div>
          </div>

          {/* Pickup Schedules */}
          {customer && (
            <PickupSchedulesSection
              customerId={customer.id}
              customerName={`${customer.first_name} ${customer.last_name}`}
              customerPhone={customer.phone}
              customerAddress={customer.address_street}
              customerCity={customer.address_city}
              onAddSchedule={() => setShowScheduleModal(true)}
            />
          )}

          {/* Messages */}
          {customer && <MessagesSection customerId={customer.id} />}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? 'Saving…' : customer ? 'Save Changes' : 'Add Customer'}
            </Button>
          </div>
        </form>
      </div>

      {showScheduleModal && customer && (
        <ScheduleModal
          initialCustomer={{
            id: customer.id,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
            address_street: customer.address_street,
            address_city: customer.address_city,
          }}
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  )
}
