'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { X, WashingMachine, Wind, FoldVertical, Mail, Receipt, Send, Trash2, Truck, Pencil, DollarSign, Camera, Plus, ChevronDown, RotateCcw } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatCurrency, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CustomerProfilePanel } from '@/components/customers/CustomerProfilePanel'
import { CancelOrderModal } from '@/components/orders/CancelOrderModal'
import { RefundModal } from '@/components/orders/RefundModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function hoursAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return `${Math.round(h * 60)}m ago`
  return `${h.toFixed(1)}h ago`
}

function hoursBetween(a: string, b: string | null | undefined): string {
  if (!b) return '—'
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
  return `${h.toFixed(1)}h`
}

function assignmentEnd(assignedAt: string, durationMin: number | null): string {
  if (!durationMin) return '—'
  const end = new Date(new Date(assignedAt).getTime() + durationMin * 60_000)
  return fmt(end.toISOString())
}

const PROCESS_LABEL: Record<string, string> = {
  washer:  'Washer',
  dryer:   'Dryer',
  folding: 'Folding',
}

const PROCESS_ICON: Record<string, React.ElementType> = {
  washer:  WashingMachine,
  dryer:   Wind,
  folding: FoldVertical,
}

const METHOD_LABEL: Record<string, string> = {
  cash:             'Cash',
  card_present:     'Card Terminal',
  card_online:      'Card Online',
  account_credit:   'Account Credit',
  saved_card:       'Saved Card',
  pay_on_collection:'Pay on Collection',
  check:            'Check',
  direct_deposit:   'Direct Deposit',
  invoice:          'Invoice',
}

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
      {children}
    </div>
  )
}

// ─── Issues section ───────────────────────────────────────────────────────────

function IssuesSection({ orderId }: { orderId: string }) {
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: issues = [] } = trpc.orderIssues.listByOrder.useQuery({ order_id: orderId })
  const { data: categories = [] } = trpc.orderIssues.listCategories.useQuery()

  const [showForm,         setShowForm]         = useState(false)
  const [preview,          setPreview]          = useState<string | null>(null)
  const [file,             setFile]             = useState<File | null>(null)
  const [category,         setCategory]         = useState('')
  const [note,             setNote]             = useState('')
  const [newCatInput,      setNewCatInput]      = useState('')
  const [showNewCat,       setShowNewCat]       = useState(false)
  const [uploading,        setUploading]        = useState(false)

  const createIssue = trpc.orderIssues.create.useMutation({
    onSuccess: () => { utils.orderIssues.listByOrder.invalidate({ order_id: orderId }); resetForm() },
    onError: (e) => { import('react-hot-toast').then(({ default: toast }) => toast.error(e.message)) },
  })
  const deleteIssue = trpc.orderIssues.delete.useMutation({
    onSuccess: () => utils.orderIssues.listByOrder.invalidate({ order_id: orderId }),
  })
  const addCategory = trpc.orderIssues.addCategory.useMutation({
    onSuccess: (cat) => {
      utils.orderIssues.listCategories.invalidate()
      setCategory(cat.label); setNewCatInput(''); setShowNewCat(false)
    },
  })

  const allCategories = (categories as { id: string; label: string }[]).map((c) => c.label)

  function resetForm() {
    setPreview(null); setFile(null); setCategory(''); setNote(''); setShowForm(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setShowForm(true)
  }

  async function handleSubmit() {
    if (!file || !category) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('orderId', orderId)
      const res  = await fetch('/api/upload/order-issue', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      await createIssue.mutateAsync({ order_id: orderId, photo_url: json.photo_url, storage_path: json.storage_path, category, note: note.trim() || null })
    } catch (e: unknown) {
      import('react-hot-toast').then(({ default: toast }) => toast.error(e instanceof Error ? e.message : 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {/* Existing issues */}
      {issues.length > 0 && (
        <div className="space-y-2 mb-3">
          {(issues as { id: string; photo_url: string; category: string; note: string | null; created_at: string }[]).map((issue) => (
            <div key={issue.id} className="flex gap-3 rounded-xl border border-gray-200 p-3">
              <a href={issue.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={issue.photo_url} alt={issue.category}
                  className="h-16 w-16 rounded-lg object-cover border border-gray-100 hover:opacity-90 transition-opacity" />
              </a>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {issue.category}
                  </span>
                  <button onClick={() => deleteIssue.mutate({ id: issue.id })}
                    className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {issue.note && <p className="mt-1 text-sm text-gray-600">{issue.note}</p>}
                <p className="mt-1 text-[10px] text-gray-400">
                  {new Date(issue.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 p-3 space-y-3 mb-3 bg-gray-50">
          {preview && (
            <div className="relative w-fit">
              <img src={preview} alt="Preview" className="h-24 w-auto rounded-lg border border-gray-200 object-cover" />
              <button onClick={resetForm}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-900">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {/* Category */}
          {!showNewCat ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className={cn('w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm focus:border-brand-400 focus:outline-none', !category && 'text-gray-400')}>
                  <option value="">Select category…</option>
                  {allCategories.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
              <button onClick={() => setShowNewCat(true)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap">
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newCatInput} onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newCatInput.trim() && addCategory.mutate({ label: newCatInput.trim() })}
                placeholder="Category name…"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
              <button onClick={() => newCatInput.trim() && addCategory.mutate({ label: newCatInput.trim() })}
                disabled={!newCatInput.trim() || addCategory.isPending}
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Add</button>
              <button onClick={() => { setShowNewCat(false); setNewCatInput('') }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
            </div>
          )}
          {/* Note */}
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the issue… (optional)" rows={2}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-brand-400 focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={resetForm}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-white">Cancel</button>
            <button onClick={handleSubmit} disabled={!file || !category || uploading || createIssue.isPending}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              {uploading ? 'Uploading…' : 'Save Issue'}
            </button>
          </div>
        </div>
      )}

      {/* Add photo button */}
      {!showForm && (
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center">
          <Camera className="h-4 w-4" /> Add Photo &amp; Note
        </button>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileChange} />
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string
  onClose: () => void
}

export function OrderDetailModal({ orderId, onClose }: Props) {
  const { data: order, isLoading } = trpc.orders.getById.useQuery({ id: orderId })
  const { data: members = [] } = trpc.tenants.getMembers.useQuery()
  const { data: myRole } = trpc.staff.myRole.useQuery()
  const utils = trpc.useUtils()
  const [emailSent, setEmailSent] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [showCustomerProfile, setShowCustomerProfile] = useState<'orders' | 'edit' | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [refundPayment, setRefundPayment] = useState<typeof payments[0] | null>(null)
  const [addingStop, setAddingStop] = useState<'pickup' | 'delivery' | null>(null)
  const [stopDate, setStopDate] = useState('')
  const [stopTime, setStopTime] = useState('')

  // Fetch stops linked to this order
  const { data: allStops = [], refetch: refetchStops } = trpc.pickupStops.listByDate.useQuery(
    { date: new Date().toISOString().split('T')[0] },
    { enabled: false } // we'll fetch differently
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderStops = (order as any)?.stops ?? []

  const createStop = trpc.pickupStops.createOneOff.useMutation({
    onSuccess: () => {
      utils.orders.getById.invalidate({ id: orderId })
      setAddingStop(null); setStopDate(''); setStopTime('')
      import('react-hot-toast').then(({ default: toast }) => toast.success('Stop added'))
    },
  })
  const deleteStop = trpc.pickupStops.updateStatus.useMutation({
    onSuccess: () => utils.orders.getById.invalidate({ id: orderId }),
  })
  const notesEndRef = useRef<HTMLDivElement>(null)
  const sendReceipt = trpc.notifications.sendReceipt.useMutation({ onSuccess: () => setEmailSent('receipt') })
  const sendInvoice = trpc.notifications.sendInvoice.useMutation({ onSuccess: () => setEmailSent('invoice') })
  const { data: notes = [], refetch: refetchNotes } = trpc.orderNotes.list.useQuery({ order_id: orderId })
  const addNote = trpc.orderNotes.add.useMutation({
    onSuccess: () => {
      setNoteText('')
      refetchNotes()
      setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    },
  })
  const deleteNote = trpc.orderNotes.delete.useMutation({ onSuccess: () => refetchNotes() })


  const memberName = (userId: string | null | undefined) => {
    if (!userId) return '—'
    return members.find((m) => m.user_id === userId)?.display_name ?? '—'
  }

  const canEdit = order && order.status !== 'picked_up' && order.status !== 'delivered' && order.status !== 'cancelled'
  const isPending = order?.status === 'pending'
  const canDelete = canEdit

  type Payment = { id: string; amount: number; method: string; status: string; processed_by: string; processed_at: string; helcim_transaction_id?: string | null; refund_of_payment_id?: string | null; notes?: string | null }
  type Line    = { id: string; name: string; category: string; quantity: number; unit_label: string; unit_price: number; notes?: string | null; waiver_required?: boolean; waiver_text?: string | null; waiver_acknowledged_at?: string | null; waiver_acknowledged_name?: string | null }
  type Assign  = { id: string; assigned_at: string; assigned_by: string | null; duration_minutes: number | null; temperature: string | null; equipment: { id: string; name: string; type: string } }

  const payments    = (order?.payments   as Payment[] | undefined) ?? []
  const lines       = (order?.lines      as Line[]    | undefined) ?? []
  const assignments = (order?.assignments as Assign[] | undefined) ?? []

  const customer = order?.customer as {
    first_name: string; last_name: string; phone?: string | null
    address_street?: string | null; address_apt?: string | null
    address_city?: string | null; address_postal_code?: string | null
  } | null

  return (
    <>
    {refundPayment && order && (
        <RefundModal
          payment={refundPayment}
          orderNumber={(order as { order_number: string }).order_number}
          onClose={() => setRefundPayment(null)}
          onSuccess={() => utils.orders.getById.invalidate({ id: orderId })}
        />
      )}

    {showCancelModal && order && (
      <CancelOrderModal
        orderId={order.id as string}
        orderNumber={order.order_number as string}
        onClose={() => setShowCancelModal(false)}
        onCancelled={onClose}
      />
    )}
    {showCustomerProfile && order?.customer_id && (
      <CustomerProfilePanel
        customerId={order.customer_id as string}
        onClose={() => setShowCustomerProfile(null)}
        initialTab={showCustomerProfile}
      />
    )}
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex w-full max-w-4xl flex-col max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">
              {isLoading ? 'Loading…' : `Order ${order?.order_number}`}
            </h2>
            {isPending && order && (
              <Link
                href={`/pos?orderId=${order.id}`}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Truck className="h-3.5 w-3.5" />
                Detail Order
              </Link>
            )}
            {canEdit && !isPending && order && (
              <Link
                href={`/pos?orderId=${order.id}`}
                onClick={onClose}
                className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                Edit Order
              </Link>
            )}
            {canDelete && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
              >
                Delete
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading…</p>}

          {order && (
            <>
              {/* Pending pickup notice */}
              {isPending && (
                <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                  <Truck className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-900">Awaiting laundry drop-off</p>
                    {customer?.address_street ? (
                      <p className="text-xs text-brand-700 mt-0.5">
                        {[customer.address_street, customer.address_apt, customer.address_city, customer.address_postal_code]
                          .filter(Boolean).join(', ')}
                      </p>
                    ) : null}
                    <p className="text-xs text-brand-600 mt-1">
                      When the laundry arrives, tap <strong>Detail Order</strong> above to add services and start cleaning.
                    </p>
                  </div>
                </div>
              )}

              {/* Meta: Created / Payment / Timestamps */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Created</p>
                  <p className="text-sm text-gray-700">{fmt(order.created_at)}</p>
                  <p className="text-xs text-gray-400">{hoursAgo(order.created_at)}</p>
                  <p className="text-sm text-gray-700 mt-1">{memberName(order.created_by as string)}</p>
                  {customer && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-sm font-semibold text-gray-900">
                        {customer.first_name} {customer.last_name}
                      </p>
                      <button
                        onClick={() => setShowCustomerProfile('edit')}
                        className="text-gray-400 hover:text-brand-600 transition-colors"
                        aria-label="Edit customer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Payment</p>
                  {payments.length === 0 ? (
                    <p className="text-sm text-amber-600 font-medium">Unpaid</p>
                  ) : (
                    payments.map((p) => {
                      const isRefund = !!p.refund_of_payment_id || p.status === 'refunded' && !p.refund_of_payment_id === false
                      const alreadyRefunded = p.status === 'refunded' && !p.refund_of_payment_id
                      const canRefund = !alreadyRefunded && !p.refund_of_payment_id
                      return (
                        <div key={p.id} className="mb-2">
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <p className={cn('text-sm', p.refund_of_payment_id ? 'text-red-600' : 'text-gray-700')}>
                                {p.refund_of_payment_id ? '− ' : ''}{formatCurrency(p.amount)} · {METHOD_LABEL[p.method] ?? p.method}
                                {p.status === 'refunded' && !p.refund_of_payment_id && (
                                  <span className="ml-1 text-xs text-red-500">(refunded)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400">{fmt(p.processed_at)}</p>
                              <p className="text-xs text-gray-500">{memberName(p.processed_by)}</p>
                              {p.notes && <p className="text-xs text-gray-400 italic">{p.notes}</p>}
                            </div>
                            {canRefund && (
                              <button
                                onClick={() => setRefundPayment(p)}
                                className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-full px-2 py-0.5 transition-colors"
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <p className={cn('text-xs font-semibold mt-1',
                    order.payment_status === 'paid' ? 'text-green-600' :
                    order.payment_status === 'refunded' ? 'text-red-500' : 'text-amber-500')}>
                    {order.payment_status === 'paid' ? 'Paid in full' :
                     order.payment_status === 'refunded' ? 'Refunded' :
                     `Unpaid · ${formatCurrency(order.total_amount)}`}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Timeline</p>
                  <div className="space-y-1">
                    <div>
                      <p className="text-xs text-gray-400">Cleaning started</p>
                      <p className="text-sm text-gray-700">{fmt(order.created_at)}</p>
                    </div>
                    {(order.ready_at as string | null) && (
                      <div>
                        <p className="text-xs text-gray-400">Marked ready</p>
                        <p className="text-sm text-gray-700">{fmt(order.ready_at as string)}</p>
                        <p className="text-xs text-gray-400">{hoursBetween(order.created_at, order.ready_at as string)} to clean</p>
                      </div>
                    )}
                    {(order.picked_up_at as string | null) && (
                      <div>
                        <p className="text-xs text-gray-400">Picked up</p>
                        <p className="text-sm text-gray-700">{fmt(order.picked_up_at as string)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <Section title="Items">
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Item</th>
                        <th className="px-3 py-2 text-left font-semibold">Notes</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{l.name}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs max-w-xs">{l.notes ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {l.unit_label === 'lb'
                              ? `${l.quantity % 1 === 0 ? l.quantity : l.quantity.toFixed(1)} lb`
                              : `× ${l.quantity}`}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {formatCurrency(Math.round(l.quantity * l.unit_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-gray-200 bg-gray-50">
                      {(order as { delivery_fee_cents?: number }).delivery_fee_cents ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">🚐 Delivery fee</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatCurrency((order as { delivery_fee_cents?: number }).delivery_fee_cents!)}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(order.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>

              {/* Pickup / Delivery stops */}
              <Section title="Pickup & Delivery">
                <div className="space-y-2">
                  {orderStops.length === 0 && !addingStop && (
                    <p className="text-xs text-gray-400">No pickup or delivery scheduled.</p>
                  )}
                  {orderStops.map((s: { id: string; type: string; status: string; scheduled_date: string; time_start: string | null }) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div>
                        <span className={`text-xs font-semibold mr-2 ${s.type === 'pickup' ? 'text-blue-600' : 'text-purple-600'}`}>
                          {s.type === 'pickup' ? '↑ Pickup' : '↓ Delivery'}
                        </span>
                        <span className="text-xs text-gray-600">
                          {new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {s.time_start ? ` at ${s.time_start.slice(0, 5)}` : ''}
                        </span>
                        <span className={`ml-2 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
                          s.status === 'completed' ? 'bg-green-100 text-green-700' :
                          s.status === 'en_route' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-500'}`}>
                          {s.status}
                        </span>
                      </div>
                      {s.status === 'pending' && (
                        <button onClick={() => deleteStop.mutate({ id: s.id, status: 'skipped' })}
                          className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {addingStop && (
                    <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-brand-700">{addingStop === 'pickup' ? '↑ Add Pickup' : '↓ Add Delivery'}</p>
                      <div className="flex gap-2">
                        <input type="date" value={stopDate} onChange={e => setStopDate(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                        <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)}
                          className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setAddingStop(null); setStopDate(''); setStopTime('') }}
                          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600">Cancel</button>
                        <button
                          disabled={!stopDate || createStop.isPending}
                          onClick={() => {
                            if (!stopDate || !order?.customer_id) return
                            createStop.mutate({
                              customer_id: order.customer_id as string,
                              order_id: orderId,
                              type: addingStop,
                              scheduled_date: stopDate,
                              time_start: stopTime || null,
                            })
                          }}
                          className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                          {createStop.isPending ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}
                  {!addingStop && (
                    <div className="flex gap-2">
                      <button onClick={() => setAddingStop('pickup')}
                        className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                        <Plus className="h-3 w-3" /> Pickup
                      </button>
                      <button onClick={() => setAddingStop('delivery')}
                        className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100">
                        <Plus className="h-3 w-3" /> Delivery
                      </button>
                    </div>
                  )}
                </div>
              </Section>

              {/* Machines */}
              {assignments.length > 0 && (
                <Section title="Machines">
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Machine</th>
                          <th className="px-3 py-2 text-left font-semibold">Process</th>
                          <th className="px-3 py-2 text-left font-semibold">Temp</th>
                          <th className="px-3 py-2 text-left font-semibold">Duration</th>
                          <th className="px-3 py-2 text-left font-semibold">Start</th>
                          <th className="px-3 py-2 text-left font-semibold">End</th>
                          <th className="px-3 py-2 text-left font-semibold">Assigned by</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {assignments.map((a) => {
                          const Icon = PROCESS_ICON[a.equipment.type] ?? WashingMachine
                          return (
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5 font-medium text-gray-800">
                                  <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                  {a.equipment.name}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{PROCESS_LABEL[a.equipment.type] ?? a.equipment.type}</td>
                              <td className="px-3 py-2 text-gray-600">{a.temperature ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-600">{a.duration_minutes ? `${a.duration_minutes} min` : '—'}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmt(a.assigned_at)}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{assignmentEnd(a.assigned_at, a.duration_minutes)}</td>
                              <td className="px-3 py-2 text-gray-600">{memberName(a.assigned_by)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* Order notes */}
              {order.notes && (
                <Section title="Customer Notes">
                  <p className="text-sm text-gray-700 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">{order.notes}</p>
                </Section>
              )}

              {/* Waivers — only shown if any line has a waiver */}
              {lines.some((l) => l.waiver_required) && (
                <Section title="Care Waivers">
                  <div className="space-y-2">
                    {lines.filter((l) => l.waiver_required).map((l) => (
                      <div key={l.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-amber-900">{l.name}</p>
                          {l.waiver_acknowledged_at ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 border border-green-200 rounded-full px-2 py-0.5">
                              ✓ Signed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                              ⏳ Awaiting signature
                            </span>
                          )}
                        </div>
                        {l.waiver_text && (
                          <p className="text-xs text-amber-800 leading-relaxed">{l.waiver_text}</p>
                        )}
                        {l.waiver_acknowledged_at && (
                          <p className="text-xs text-gray-500">
                            Signed by <span className="font-medium text-gray-700">{l.waiver_acknowledged_name}</span>
                            {' · '}
                            {new Date(l.waiver_acknowledged_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Issues */}
              <Section title="Issues">
                <IssuesSection orderId={orderId} />
              </Section>

              {/* Internal staff notes */}
              <Section title="Internal Notes">
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  {notes.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-3 italic">No internal notes yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {notes.map((note) => (
                        <div key={note.id} className="px-4 py-3 flex gap-3 group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-700">{memberName(note.user_id)}</span>
                              <span className="text-xs text-gray-400">{fmt(note.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
                          </div>
                          <button
                            onClick={() => deleteNote.mutate({ id: note.id })}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity shrink-0 mt-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <div ref={notesEndRef} />
                    </div>
                  )}
                  <div className="border-t border-gray-100 flex items-end gap-2 px-3 py-2 bg-gray-50">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && noteText.trim()) {
                          e.preventDefault()
                          addNote.mutate({ order_id: orderId, body: noteText.trim() })
                        }
                      }}
                      placeholder="Add an internal note… (Enter to send)"
                      rows={2}
                      className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      disabled={!noteText.trim() || addNote.isPending}
                      onClick={() => {
                        if (noteText.trim()) addNote.mutate({ order_id: orderId, body: noteText.trim() })
                      }}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {order?.customer_id && (
              <>
                {order.payment_status === 'paid' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendReceipt.isPending || emailSent === 'receipt'}
                    onClick={() => sendReceipt.mutate({ order_id: orderId })}
                    className="gap-1.5 text-xs"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    {emailSent === 'receipt' ? 'Receipt sent ✓' : 'Send Receipt'}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendInvoice.isPending || emailSent === 'invoice'}
                      onClick={() => sendInvoice.mutate({ order_id: orderId })}
                      className="gap-1.5 text-xs"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {emailSent === 'invoice' ? 'Invoice sent ✓' : 'Send Invoice'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowCustomerProfile('orders')}
                      className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      Record Payment
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
    </>
  )
}
