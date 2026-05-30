'use client'

import { useState, useMemo } from 'react'
import { Plus, X, Check, CreditCard, FileText, Building2, User, Trash2, Eye, Send } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn, formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'void'
type RecipientType = 'customer' | 'business_account'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft:   'bg-gray-100 text-gray-600',
  unpaid:  'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid:    'bg-green-100 text-green-700',
  void:    'bg-red-100 text-red-600',
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:   'Draft',
  unpaid:  'Unpaid',
  partial: 'Partial',
  paid:    'Paid',
  void:    'Void',
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function recipientName(inv: { recipient_type: string; customer?: { first_name: string; last_name: string } | null; business_account?: { name: string } | null }): string {
  if (inv.recipient_type === 'business_account') return inv.business_account?.name ?? '—'
  if (inv.customer) return `${inv.customer.first_name} ${inv.customer.last_name}`
  return '—'
}

function daysAgo(iso: string | null | undefined) {
  if (!iso) return null
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

// ─── New Invoice Modal ────────────────────────────────────────────────────────

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const utils = trpc.useUtils()
  const [step, setStep] = useState<'setup' | 'preview'>('setup')
  const [recipientType, setRecipientType] = useState<RecipientType>('customer')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [businessAccountId, setBusinessAccountId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [customerSearch, setCustomerSearch] = useState('')
  const [baSearch, setBaSearch] = useState('')

  const { data: customers = [] } = trpc.customers.list.useQuery(undefined)
  const { data: businessAccounts = [] } = trpc.businessAccounts.list.useQuery()

  const filteredCustomers = useMemo(() =>
    (customers as { id: string; first_name: string; last_name: string; email?: string | null }[])
      .filter((c) => {
        const q = customerSearch.toLowerCase()
        return `${c.first_name} ${c.last_name} ${c.email ?? ''}`.toLowerCase().includes(q)
      }).slice(0, 8),
    [customers, customerSearch]
  )

  const filteredBAs = useMemo(() =>
    (businessAccounts as { id: string; name: string; email?: string | null }[])
      .filter((b) => b.name.toLowerCase().includes(baSearch.toLowerCase()))
      .slice(0, 8),
    [businessAccounts, baSearch]
  )

  const canPreview = recipientType === 'customer' ? !!customerId : !!businessAccountId
  const previewInput = canPreview ? {
    recipient_type: recipientType,
    customer_id: recipientType === 'customer' ? customerId ?? undefined : undefined,
    business_account_id: recipientType === 'business_account' ? businessAccountId ?? undefined : undefined,
  } : null

  const { data: previewOrders = [], isLoading: previewLoading } = trpc.invoices.previewOrders.useQuery(
    previewInput!,
    { enabled: !!previewInput && step === 'preview' }
  )

  // Auto-select all orders when preview loads
  useMemo(() => {
    if (previewOrders.length > 0) {
      setSelectedOrderIds(new Set(previewOrders.map((o: { id: string }) => o.id)))
    }
  }, [previewOrders])

  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate()
      toast.success('Invoice created')
      onCreated()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleCreate = () => {
    const ids = Array.from(selectedOrderIds)
    if (ids.length === 0) { toast.error('Select at least one order'); return }
    createInvoice.mutate({
      recipient_type: recipientType,
      customer_id: recipientType === 'customer' ? customerId ?? undefined : undefined,
      business_account_id: recipientType === 'business_account' ? businessAccountId ?? undefined : undefined,
      order_ids: ids,
      due_date: dueDate || null,
      notes: notes || null,
    })
  }

  const selectedCustomer = (customers as { id: string; first_name: string; last_name: string }[]).find((c) => c.id === customerId)
  const selectedBA = (businessAccounts as { id: string; name: string }[]).find((b) => b.id === businessAccountId)

  const selectedTotal = previewOrders
    .filter((o: { id: string }) => selectedOrderIds.has(o.id))
    .reduce((s: number, o: { total_amount: number; paid_amount: number }) => s + (o.total_amount - (o.paid_amount ?? 0)), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl mb-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">New Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
            {(['setup', 'preview'] as const).map((s) => (
              <button key={s} onClick={() => s === 'preview' && canPreview ? setStep(s) : setStep('setup')}
                className={cn('rounded-md px-4 py-1.5 text-xs font-semibold transition-colors capitalize',
                  step === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  s === 'preview' && !canPreview && 'opacity-40 cursor-not-allowed')}>
                {s === 'setup' ? '1. Recipient' : '2. Orders'}
              </button>
            ))}
          </div>

          {step === 'setup' && (
            <>
              {/* Recipient type */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bill to</p>
                <div className="flex gap-2">
                  {([['customer', 'Individual Customer', User], ['business_account', 'Business Account', Building2]] as const).map(([val, label, Icon]) => (
                    <button key={val} onClick={() => { setRecipientType(val); setCustomerId(null); setBusinessAccountId(null) }}
                      className={cn('flex items-center gap-2 flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors',
                        recipientType === val ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer picker */}
              {recipientType === 'customer' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer</p>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-3">
                      <span className="text-sm font-semibold text-brand-700">{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                      <button onClick={() => setCustomerId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <div>
                      <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search customers…"
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      {filteredCustomers.length > 0 && (
                        <div className="mt-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                          {filteredCustomers.map((c) => (
                            <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch('') }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50">
                              <User className="h-4 w-4 text-gray-400 shrink-0" />
                              <span>{c.first_name} {c.last_name}</span>
                              {c.email && <span className="text-gray-400 text-xs ml-auto">{c.email}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Business account picker */}
              {recipientType === 'business_account' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Business Account</p>
                  {selectedBA ? (
                    <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-3">
                      <span className="text-sm font-semibold text-brand-700">{selectedBA.name}</span>
                      <button onClick={() => setBusinessAccountId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <div>
                      <input value={baSearch} onChange={(e) => setBaSearch(e.target.value)}
                        placeholder="Search business accounts…"
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      {filteredBAs.length > 0 && (
                        <div className="mt-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                          {filteredBAs.map((b) => (
                            <button key={b.id} onClick={() => { setBusinessAccountId(b.id); setBaSearch('') }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50">
                              <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                              <span>{b.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {businessAccounts.length === 0 && (
                        <p className="text-xs text-gray-400 mt-2">No business accounts yet — add them in Settings.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Due date + notes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              </div>

              <button onClick={() => setStep('preview')} disabled={!canPreview}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                Next — Select Orders →
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Unpaid orders for {recipientType === 'business_account' ? selectedBA?.name : selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : ''}
                </p>
                <button onClick={() => {
                  if (selectedOrderIds.size === previewOrders.length) {
                    setSelectedOrderIds(new Set())
                  } else {
                    setSelectedOrderIds(new Set(previewOrders.map((o: { id: string }) => o.id)))
                  }
                }} className="text-xs text-brand-600 font-semibold hover:underline">
                  {selectedOrderIds.size === previewOrders.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {previewLoading && <p className="text-sm text-gray-400 text-center py-6">Loading orders…</p>}

              {!previewLoading && previewOrders.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                  <p className="text-sm text-gray-500 font-medium">No unpaid orders found</p>
                  <p className="text-xs text-gray-400 mt-1">All orders for this recipient are already invoiced or paid.</p>
                </div>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(previewOrders as unknown as {
                  id: string; order_number: string; status: string; created_at: string
                  total_amount: number; paid_amount: number; tax_amount: number
                  customer?: { first_name: string; last_name: string } | null
                }[]).map((order) => {
                  const balance = order.total_amount - (order.paid_amount ?? 0)
                  const selected = selectedOrderIds.has(order.id)
                  return (
                    <button key={order.id} onClick={() => {
                      const next = new Set(selectedOrderIds)
                      selected ? next.delete(order.id) : next.add(order.id)
                      setSelectedOrderIds(next)
                    }}
                      className={cn('flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors',
                        selected ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300')}>
                      <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                        selected ? 'border-brand-500 bg-brand-500' : 'border-gray-300')}>
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{order.order_number}</span>
                          {order.customer && (
                            <span className="text-xs text-gray-500">{order.customer.first_name} {order.customer.last_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{fmtDate(order.created_at)}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(balance)}</span>
                    </button>
                  )
                })}
              </div>

              {previewOrders.length > 0 && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">{selectedOrderIds.size} order{selectedOrderIds.size !== 1 ? 's' : ''} selected</span>
                  <span className="text-base font-bold text-gray-900">{formatCurrency(selectedTotal)}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('setup')}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  ← Back
                </button>
                <button onClick={handleCreate} disabled={selectedOrderIds.size === 0 || createInvoice.isPending}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                  {createInvoice.isPending ? 'Creating…' : `Create Invoice · ${formatCurrency(selectedTotal)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: { id: string; invoice_number: string; total_cents: number; paid_amount_cents: number }
  onClose: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const balance = invoice.total_cents - invoice.paid_amount_cents
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [method, setMethod] = useState<'cash' | 'e_transfer' | 'cheque' | 'direct_deposit' | 'card_present' | 'card_online'>('e_transfer')

  const METHODS = [
    { value: 'e_transfer',     label: 'e-Transfer' },
    { value: 'direct_deposit', label: 'Direct Deposit' },
    { value: 'cheque',         label: 'Cheque' },
    { value: 'cash',           label: 'Cash' },
    { value: 'card_present',   label: 'Card (in person)' },
    { value: 'card_online',    label: 'Card (online)' },
  ] as const

  const record = trpc.invoices.recordPayment.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); toast.success('Payment recorded'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Invoice <strong>{invoice.invoice_number}</strong></p>
            <p className="text-sm font-semibold text-gray-700">Balance due: {formatCurrency(balance)}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Method</label>
            <div className="grid grid-cols-2 gap-1.5">
              {METHODS.map((m) => (
                <button key={m.value} onClick={() => setMethod(m.value as typeof method)}
                  className={cn('rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                    method === m.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => record.mutate({ invoice_id: invoice.id, amount_cents: Math.round(parseFloat(amount) * 100), method })}
              disabled={record.isPending || !amount}
              className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
              {record.isPending ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash:           'Cash',
  card_present:   'Card (in person)',
  card_online:    'Card (online)',
  account_credit: 'Account Credit',
  e_transfer:     'e-Transfer',
  cheque:         'Cheque',
  direct_deposit: 'Direct Deposit',
  invoice:        'Invoice',
}

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { data: inv, isLoading, error } = trpc.invoices.get.useQuery({ id: invoiceId })
  const { data: payments = [] } = trpc.invoices.listPayments.useQuery({ invoice_id: invoiceId })

  if (isLoading || (!inv && !error)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl p-12 text-center text-sm text-gray-400">
          Loading…
        </div>
      </div>
    )
  }

  if (error || !inv) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl p-8 text-center">
          <p className="text-sm text-red-500 font-medium mb-4">Failed to load invoice.</p>
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    )
  }

  const recipient = inv.recipient_type === 'business_account'
    ? (inv.business_account as { name: string; email?: string | null; address?: string | null; city?: string | null } | null)
    : (inv.customer as { first_name: string; last_name: string; email?: string | null; address?: string | null; city?: string | null } | null)

  const recipientDisplayName = inv.recipient_type === 'business_account'
    ? (inv.business_account as { name: string } | null)?.name ?? '—'
    : inv.customer ? `${(inv.customer as { first_name: string; last_name: string }).first_name} ${(inv.customer as { first_name: string; last_name: string }).last_name}` : '—'

  const tenantSettings = (inv.tenant as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const logoUrl = tenantSettings.logo_url as string | null | undefined
  const taxName = (tenantSettings.tax_name as string | null) ?? 'Tax'
  const taxId = tenantSettings.tax_id as string | null | undefined
  const storeName = (inv.tenant as { name?: string } | null)?.name ?? ''
  const tenantAddress = (inv.tenant as { address?: Record<string, unknown> } | null)?.address

  const orders = (inv.orders ?? []) as {
    id: string; order_number: string; created_at: string; total_amount: number; paid_amount: number; tax_amount: number
    customer?: { first_name: string; last_name: string } | null
    lines: { name: string; quantity: number; unit_price: number; line_total: number }[]
  }[]

  const tenantAddressLine = tenantAddress
    ? ((tenantAddress as Record<string, unknown>).formatted as string | null)
      ?? [
          (tenantAddress as Record<string, unknown>).street as string | null,
          (tenantAddress as Record<string, unknown>).city as string | null,
        ].filter(Boolean).join(', ')
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-10 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl mb-8">
        {/* Invoice header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-8 py-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <FileText className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-bold text-gray-900">{inv.invoice_number}</h2>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[inv.status as InvoiceStatus])}>
                {inv.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">Issued {fmtDate(inv.issue_date)}{inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ''}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <a
              href={`/api/invoice-pdf/${invoiceId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Store header */}
        <div className="px-8 py-4 border-b border-gray-100 flex items-start gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="max-h-16 w-auto object-contain" />
          ) : (
            <p className="text-sm font-bold text-gray-900">{storeName}</p>
          )}
          {tenantAddressLine && (
            <p className="text-xs text-gray-500 mt-1">{tenantAddressLine}</p>
          )}
        </div>

        {/* Bill to */}
        <div className="px-8 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Bill To</p>
          <p className="text-sm font-semibold text-gray-900">{recipientDisplayName}</p>
          {(recipient as { email?: string | null } | null)?.email && (
            <p className="text-xs text-gray-500">{(recipient as { email?: string | null }).email}</p>
          )}
        </div>

        {/* Orders */}
        <div className="px-8 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Orders Included</p>
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{order.order_number}</span>
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(order.created_at)}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {order.lines?.map((line, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-1.5 text-gray-700">{line.name}</td>
                        <td className="px-4 py-1.5 text-gray-400 text-right">×{line.quantity}</td>
                        <td className="px-4 py-1.5 text-gray-700 text-right font-medium">{formatCurrency(line.line_total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td colSpan={2} className="px-4 py-1.5 text-gray-500 text-right font-semibold">Order Total</td>
                      <td className="px-4 py-1.5 text-gray-900 text-right font-bold">{formatCurrency(order.total_amount - (order.paid_amount ?? 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="px-8 py-4 border-t border-gray-100">
          <div className="ml-auto max-w-xs space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>{formatCurrency(inv.subtotal_cents)}</span>
            </div>
            {inv.tax_cents > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>{taxName}</span><span>{formatCurrency(inv.tax_cents)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold text-gray-700 border-t border-gray-200 pt-2 mt-2">
              <span>Invoice Total</span><span>{formatCurrency(inv.total_cents)}</span>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(inv as any).paid_amount_cents > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span>Paid</span><span>−{formatCurrency((inv as any).paid_amount_cents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2 mt-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <span>{(inv as any).paid_amount_cents > 0 ? 'Balance Due' : 'Total Due'}</span>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <span>{formatCurrency(Math.max(0, inv.total_cents - ((inv as any).paid_amount_cents ?? 0)))}</span>
            </div>
            {taxId && (
              <p className="text-xs text-gray-400 text-right mt-1">HST #: {taxId}</p>
            )}
          </div>
        </div>

        {inv.notes && (
          <div className="px-8 pb-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-gray-600">{inv.notes}</p>
          </div>
        )}

        {/* Payment history */}
        {payments.length > 0 && (
          <div className="px-8 pb-6 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Payment History</p>
            <div className="space-y-1">
              {(payments as { id: string; amount_cents: number; method: string; notes: string | null; created_at: string }[]).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <CreditCard className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">{METHOD_LABELS[p.method] ?? p.method}</p>
                      {p.notes && <p className="text-xs text-gray-400 truncate">{p.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-semibold text-green-700">{formatCurrency(p.amount_cents)}</p>
                    <p className="text-xs text-gray-400">{fmtDate(p.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const utils = trpc.useUtils()
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'all'>('unpaid')
  const [showNewModal, setShowNewModal] = useState(false)
  const [payingInvoice, setPayingInvoice] = useState<{ id: string; invoice_number: string; total_cents: number; paid_amount_cents: number } | null>(null)
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null)

  const { data: invoices = [], isLoading } = trpc.invoices.list.useQuery(
    { status: statusFilter },
    { refetchInterval: 60_000 }
  )

  const voidInvoice = trpc.invoices.delete.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); toast.success('Invoice voided') },
    onError: (e) => toast.error(e.message),
  })

  const sendInvoice = trpc.invoices.sendInvoice.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); toast.success('Invoice sent') },
    onError: (e) => toast.error(e.message),
  })

  const rows = invoices as unknown as {
    id: string; invoice_number: string; recipient_type: string; status: InvoiceStatus
    issue_date: string; due_date: string | null; total_cents: number; paid_amount_cents: number; sent_at: string | null; paid_at: string | null; created_at: string
    customer?: { first_name: string; last_name: string; email: string | null } | null
    business_account?: { name: string; email: string | null } | null
  }[]

  const totalUnpaid = rows
    .filter((r) => r.status === 'unpaid' || r.status === 'partial')
    .reduce((s, r) => s + (r.total_cents - r.paid_amount_cents), 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <FileText className="h-5 w-5 text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
        {totalUnpaid > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {formatCurrency(totalUnpaid)} outstanding
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Status filter */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['unpaid', 'all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors capitalize',
                  statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {s === 'unpaid' ? 'Unpaid' : 'All'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-center text-sm text-gray-400 py-16">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <FileText className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No invoices yet</p>
            <button onClick={() => setShowNewModal(true)}
              className="mt-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Create your first invoice
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['#', 'Recipient', 'Date', 'Due', 'Total', 'Status', 'Sent', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 group">
                  <td className="pl-6 pr-4 py-3 font-mono text-xs font-bold text-brand-600">{inv.invoice_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {inv.recipient_type === 'business_account'
                        ? <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        : <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                      <span className="font-medium text-gray-800">{recipientName(inv)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {inv.due_date ? (
                      <span className={cn(
                        new Date(inv.due_date) < new Date() && inv.status === 'unpaid' ? 'text-red-600 font-semibold' : ''
                      )}>{fmtDate(inv.due_date)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {inv.paid_amount_cents > 0 && inv.status !== 'paid' ? (
                      <span title={`Total: ${formatCurrency(inv.total_cents)} · Paid: ${formatCurrency(inv.paid_amount_cents)}`}>
                        {formatCurrency(inv.total_cents - inv.paid_amount_cents)}
                        <span className="ml-1 text-xs font-normal text-gray-400">due</span>
                      </span>
                    ) : (
                      formatCurrency(inv.total_cents)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[inv.status])}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{daysAgo(inv.sent_at) ?? '—'}</td>
                  <td className="pr-6 pl-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewingInvoiceId(inv.id)}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      {inv.status !== 'void' && inv.status !== 'paid' && (
                        <button
                          onClick={() => sendInvoice.mutate({ id: inv.id })}
                          disabled={sendInvoice.isPending}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 flex items-center gap-1 disabled:opacity-50">
                          <Send className="h-3.5 w-3.5" /> Send
                        </button>
                      )}
                      {(inv.status === 'unpaid' || inv.status === 'partial') && (
                        <button onClick={() => setPayingInvoice({ id: inv.id, invoice_number: inv.invoice_number, total_cents: inv.total_cents, paid_amount_cents: inv.paid_amount_cents })}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 flex items-center gap-1">
                          <CreditCard className="h-3.5 w-3.5" /> Payment
                        </button>
                      )}
                      {inv.status !== 'void' && inv.status !== 'paid' && (
                        <button onClick={() => { if (confirm('Void this invoice?')) voidInvoice.mutate({ id: inv.id }) }}
                          className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && (
        <NewInvoiceModal onClose={() => setShowNewModal(false)} onCreated={() => setShowNewModal(false)} />
      )}
      {payingInvoice && (
        <RecordPaymentModal invoice={payingInvoice} onClose={() => setPayingInvoice(null)} onSaved={() => setPayingInvoice(null)} />
      )}
      {viewingInvoiceId && (
        <InvoiceDetailModal invoiceId={viewingInvoiceId} onClose={() => setViewingInvoiceId(null)} />
      )}
    </div>
  )
}
