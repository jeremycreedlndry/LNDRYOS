'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { X, WashingMachine, Wind, FoldVertical, Mail, Receipt, Send, Trash2, Truck } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatCurrency, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string
  onClose: () => void
}

export function OrderDetailModal({ orderId, onClose }: Props) {
  const { data: order, isLoading } = trpc.orders.getById.useQuery({ id: orderId })
  const { data: members = [] } = trpc.tenants.getMembers.useQuery()
  const [emailSent, setEmailSent] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
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

  type Payment = { id: string; amount: number; method: string; status: string; processed_by: string; processed_at: string }
  type Line    = { id: string; name: string; category: string; quantity: number; unit_label: string; unit_price: number; notes?: string | null }
  type Assign  = { id: string; assigned_at: string; assigned_by: string | null; duration_minutes: number | null; temperature: string | null; equipment: { id: string; name: string; type: string } }

  const payments    = (order?.payments   as Payment[] | undefined) ?? []
  const lines       = (order?.lines      as Line[]    | undefined) ?? []
  const assignments = (order?.assignments as Assign[] | undefined) ?? []

  const customer = order?.customer as { first_name: string; last_name: string; phone?: string | null } | null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
                  <div>
                    <p className="text-sm font-semibold text-brand-900">Awaiting laundry drop-off</p>
                    <p className="text-xs text-brand-700 mt-0.5">
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
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {customer.first_name} {customer.last_name}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Payment</p>
                  {payments.length === 0 ? (
                    <p className="text-sm text-amber-600 font-medium">Unpaid</p>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="mb-1">
                        <p className="text-sm text-gray-700">
                          {formatCurrency(p.amount)} · {METHOD_LABEL[p.method] ?? p.method}
                        </p>
                        <p className="text-xs text-gray-400">{fmt(p.processed_at)}</p>
                        <p className="text-xs text-gray-500">{memberName(p.processed_by)}</p>
                      </div>
                    ))
                  )}
                  <p className={cn('text-xs font-semibold mt-1',
                    order.payment_status === 'paid' ? 'text-green-600' : 'text-amber-500')}>
                    {order.payment_status === 'paid' ? 'Paid in full' : `Unpaid · ${formatCurrency(order.total_amount)}`}
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
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(order.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
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
                )}
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
