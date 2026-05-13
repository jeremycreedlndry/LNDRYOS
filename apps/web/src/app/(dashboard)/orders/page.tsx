'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { X, WashingMachine, Wind, FoldVertical, Pencil, Camera } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatCurrency, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { OrderStatus, EquipmentType } from '@laundry/db'
import toast from 'react-hot-toast'
import { OrderDetailModal } from './OrderDetailModal'
import { OrderIssuesModal } from '@/components/orders/OrderIssuesModal'
import { PaymentModal } from '@/components/pos/PaymentModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderLine {
  id: string
  name: string
  category: string
  quantity: number
  unit_label: string
  unit_price: number
  notes?: string | null
}

interface EquipmentAssignment {
  duration_minutes: number | null
  temperature: string | null
  assigned_at: string | null
  equipment: { id: string; name: string; type: string }
}

interface OrderRow {
  id: string
  order_number: string
  status: string
  payment_status: string
  total_amount: number
  customer_name: string | null
  created_at: string
  due_date: string | null
  notes: string | null
  customer: {
    id: string
    first_name: string
    last_name: string
    phone?: string | null
    order_preferences?: Record<string, string> | null
  } | null
  lines: OrderLine[]
  assignments: EquipmentAssignment[]
  issues: { id: string }[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: OrderStatus | undefined }[] = [
  { label: 'All',       value: undefined },
  { label: 'Cleaning',  value: 'cleaning' },
  { label: 'Ready',     value: 'ready' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'Cancelled', value: 'cancelled' },
]

const STATUS_BADGE: Partial<Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'>> = {
  cleaning:   'warning',
  ready:      'success',
  picked_up:  'default',
  delivered:  'default',
  cancelled:  'destructive',
  pending:    'secondary',
  in_progress:'warning',
}

// ─── Equipment icons / colors ─────────────────────────────────────────────────

const EQUIP_ICON: Record<string, React.ElementType> = {
  washer:  WashingMachine,
  dryer:   Wind,
  folding: FoldVertical,
}

const EQUIP_COLOR: Record<string, string> = {
  washer:  'bg-blue-100 text-blue-700 border-blue-200',
  dryer:   'bg-orange-100 text-orange-700 border-orange-200',
  folding: 'bg-green-100 text-green-700 border-green-200',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDueDate(due: string | null): string {
  if (!due) return '—'
  const d = new Date(due)
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function summarizeLines(lines: OrderLine[]): { label: string; detail: string }[] {
  const groups: Record<string, { qty: number; unit: string }> = {}
  for (const l of lines) {
    if (l.category === 'upcharge') continue
    const key = l.name.includes('· Bag') ? 'Wash & Fold' : l.name
    if (!groups[key]) groups[key] = { qty: 0, unit: l.unit_label }
    groups[key].qty += l.quantity
  }
  return Object.entries(groups).map(([label, { qty, unit }]) => ({
    label,
    detail: unit === 'lb' ? `${qty % 1 === 0 ? qty : qty.toFixed(1)} lb` : `× ${qty % 1 === 0 ? qty : qty.toFixed(1)}`,
  }))
}

function getBagCount(lines: OrderLine[]): number {
  return lines.filter((l) => l.category === 'wash_fold' && l.name.includes('· Bag')).length
}

function getPieceCount(lines: OrderLine[]): number {
  return lines.filter((l) => !['wash_fold', 'upcharge', 'gift_card', 'product'].includes(l.category)).length
}

function formatPreferences(prefs: Record<string, string> | null | undefined): string {
  if (!prefs) return ''
  const LABELS: Record<string, string> = {
    bleach: 'Bleach',
    dryer_sheets: 'Dryer Sheets',
    detergent_type: 'Detergent',
    fabric_softener: 'Fabric Softener',
    wash_temperature: 'Wash Temp',
  }
  return Object.entries(prefs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${LABELS[k] ?? k}: ${v}`)
    .join(' · ')
}

// ─── Progress pill ────────────────────────────────────────────────────────────

function ProgressPill({ assignment }: { assignment: EquipmentAssignment }) {
  const Icon = EQUIP_ICON[assignment.equipment.type] ?? WashingMachine
  const hasDuration = !!assignment.duration_minutes && !!assignment.assigned_at

  const calcProgress = () => {
    if (!assignment.duration_minutes || !assignment.assigned_at) return 0
    const elapsedMs = Date.now() - new Date(assignment.assigned_at).getTime()
    const elapsedMin = elapsedMs / 60000
    return Math.min(1, elapsedMin / assignment.duration_minutes)
  }

  const [progress, setProgress] = useState(calcProgress)

  useEffect(() => {
    if (!hasDuration) return
    setProgress(calcProgress())
    const id = setInterval(() => setProgress(calcProgress()), 15000)
    return () => clearInterval(id)
  }, [assignment.assigned_at, assignment.duration_minutes]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = progress >= 1
  const remainingMin = hasDuration
    ? Math.max(0, Math.ceil(assignment.duration_minutes! * (1 - progress)))
    : null
  const tempLabel = assignment.temperature ? ` · ${assignment.temperature}` : ''

  // Static pill — no duration set
  if (!hasDuration) {
    const color = EQUIP_COLOR[assignment.equipment.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', color)}>
        <Icon className="h-3 w-3 shrink-0" />
        {assignment.equipment.name}{tempLabel}
      </span>
    )
  }

  // Timed pill with fill
  const pct = Math.round(progress * 100)
  return (
    <span className="relative inline-flex items-center overflow-hidden rounded-md border border-blue-300 text-xs font-medium"
      style={{ minWidth: '5rem' }}>
      {/* Green fill (left → right) */}
      <span
        className={cn(
          'absolute inset-0 origin-left transition-all duration-700',
          done ? 'bg-green-400' : 'bg-green-300'
        )}
        style={{ width: `${pct}%` }}
      />
      {/* Remaining background */}
      <span className="absolute inset-0 bg-blue-100" style={{ left: `${pct}%` }} />
      {/* Text on top */}
      <span className="relative z-10 flex items-center gap-1 px-2 py-0.5 text-gray-800">
        <Icon className="h-3 w-3 shrink-0" />
        <span>{assignment.equipment.name}{tempLabel}</span>
        {done ? (
          <span className="font-bold text-green-800">· Done!</span>
        ) : (
          <span className="opacity-70">· {remainingMin}m</span>
        )}
      </span>
    </span>
  )
}

// ─── Equipment assignment modal ────────────────────────────────────────────────

const WASHER_TIMES = [30, 35, 40, 45]
const DRYER_TIMES  = [15, 20, 30, 45, 60]
const TEMPS = ['Cold', 'Warm', 'Hot']

type AssignmentDetail = { duration_minutes: number | null; temperature: string | null }

function AssignModal({ orderId, orderNumber, currentAssignments, busyEquipment, onClose }: {
  orderId: string
  orderNumber: string
  currentAssignments: EquipmentAssignment[]
  busyEquipment?: Map<string, string>
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const { data: allEquipment = [] } = trpc.equipment.list.useQuery(undefined)

  const [details, setDetails] = useState<Map<string, AssignmentDetail>>(() => {
    const m = new Map<string, AssignmentDetail>()
    for (const a of currentAssignments) {
      m.set(a.equipment.id, { duration_minutes: a.duration_minutes, temperature: a.temperature })
    }
    return m
  })

  const setAssignments = trpc.equipment.setAssignments.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success('Equipment updated'); onClose() },
    onError: (e) => toast.error(e.message),
  })

  const isComplete = (equipId: string): boolean => {
    const a = currentAssignments.find((x) => x.equipment.id === equipId)
    if (!a?.duration_minutes || !a?.assigned_at) return false
    return (Date.now() - new Date(a.assigned_at).getTime()) / 60000 >= a.duration_minutes
  }

  const toggle = (id: string) => setDetails((prev) => {
    const next = new Map(prev)
    next.has(id) ? next.delete(id) : next.set(id, { duration_minutes: null, temperature: null })
    return next
  })

  const setDetail = (id: string, patch: Partial<AssignmentDetail>) =>
    setDetails((prev) => { const next = new Map(prev); next.set(id, { ...(next.get(id) ?? { duration_minutes: null, temperature: null }), ...patch }); return next })

  const grouped = (['washer', 'dryer', 'folding'] as EquipmentType[]).map((type) => ({
    type,
    label: type === 'washer' ? 'Washing Machines' : type === 'dryer' ? 'Dryers' : 'Folding Stations',
    times: type === 'washer' ? WASHER_TIMES : type === 'dryer' ? DRYER_TIMES : [],
    items: allEquipment.filter((e) => e.type === type),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Assign Equipment</h2>
            <p className="text-xs text-gray-500 mt-0.5">{orderNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {grouped.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No equipment set up yet — add some in Settings → Equipment.</p>
          )}
          {grouped.map(({ type, label, times, items }) => (
            <div key={type}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{label}</p>
              <div className="space-y-2">
                {items.map((item) => {
                  const active = details.has(item.id)
                  const detail = details.get(item.id)
                  const complete = active && isComplete(item.id)
                  const busyBy = active ? undefined : busyEquipment?.get(item.id)

                  if (busyBy) {
                    return (
                      <div key={item.id} className="rounded-xl border-2 border-gray-100 bg-gray-50">
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-sm font-semibold text-gray-400">{item.name}</span>
                          <span className="text-xs rounded-full px-2 py-0.5 bg-gray-200 text-gray-400">In use · {busyBy}</span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={item.id} className={cn('rounded-xl border-2 transition-colors',
                      complete ? 'border-green-400 bg-green-50' :
                      active ? 'border-brand-400 bg-brand-50' : 'border-gray-200')}>
                      <button onClick={() => toggle(item.id)} className="flex w-full items-center justify-between px-3 py-2.5">
                        <span className={cn('text-sm font-semibold',
                          complete ? 'text-green-700' : active ? 'text-brand-700' : 'text-gray-700')}>
                          {item.name}
                        </span>
                        <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium',
                          complete ? 'bg-green-600 text-white' :
                          active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500')}>
                          {complete ? 'Complete — tap to empty' : active ? 'Assigned' : 'Tap to assign'}
                        </span>
                      </button>
                      {active && !complete && times.length > 0 && (
                        <div className="border-t border-brand-200 px-3 pb-3 pt-2 space-y-2">
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">Time (min)</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {times.map((t) => (
                                <button key={t} onClick={() => setDetail(item.id, { duration_minutes: detail?.duration_minutes === t ? null : t })}
                                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                                    detail?.duration_minutes === t ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">Temperature</p>
                            <div className="flex gap-1.5">
                              {TEMPS.map((temp) => (
                                <button key={temp} onClick={() => setDetail(item.id, { temperature: detail?.temperature === temp ? null : temp })}
                                  className={cn('flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                                    detail?.temperature === temp ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                                  {temp}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => setAssignments.mutate({ order_id: orderId, assignments: Array.from(details.entries()).map(([equipment_id, d]) => ({ equipment_id, ...d })) })}
            disabled={setAssignments.isPending} className="flex-1">
            {setAssignments.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Order card ────────────────────────────────────────────────────────────────

function OrderCard({ order, index, onAssign, onViewDetail, onOpenIssues, onOpenPayment }: { order: OrderRow; index: number; onAssign: (id: string) => void; onViewDetail: (id: string) => void; onOpenIssues: (order: OrderRow) => void; onOpenPayment: (order: OrderRow) => void }) {
  const utils = trpc.useUtils()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [readyConfirmEquipment, setReadyConfirmEquipment] = useState<string[] | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null)
  const markCleanedRef = useRef<HTMLButtonElement>(null)

  const setAssignments = trpc.equipment.setAssignments.useMutation()

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: (updated) => {
      utils.orders.list.invalidate()
      setPendingStatus(null)
      const label = updated.status === 'ready' ? 'Marked cleaned' : updated.status === 'cleaning' ? 'Back to Cleaning' : 'Picked up'
      toast.success(`${order.order_number} — ${label}`)
    },
    onError: (e) => { setPendingStatus(null); toast.error(e.message) },
  })

  const markCleaned = () => {
    const activeEquipment = order.assignments.filter((a) => {
      if (!a.duration_minutes || !a.assigned_at) return false
      const elapsedMin = (Date.now() - new Date(a.assigned_at).getTime()) / 60000
      return elapsedMin < a.duration_minutes
    })

    if (activeEquipment.length > 0) {
      const rect = markCleanedRef.current?.getBoundingClientRect()
      if (rect) setPopoverPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
      setReadyConfirmEquipment(activeEquipment.map((a) => a.equipment.name))
      return
    }

    doMarkCleaned()
  }

  const doMarkCleaned = () => {
    setReadyConfirmEquipment(null)
    setPopoverPos(null)
    setPendingStatus('ready')
    setAssignments.mutate({ order_id: order.id, assignments: [] }, {
      onSettled: () => updateStatus.mutate({ id: order.id, status: 'ready' }),
    })
  }

  const advance = (status: 'cleaning' | 'picked_up') => {
    setPendingStatus(status)
    updateStatus.mutate({ id: order.id, status })
  }

  const canEdit = order.status !== 'picked_up' && order.status !== 'delivered' && order.status !== 'cancelled'
  const customerLabel = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`
    : order.customer_name ?? 'Walk-in'

  const summary = summarizeLines(order.lines)
  const bags = getBagCount(order.lines)
  const pieces = getPieceCount(order.lines)
  const prefNotes = formatPreferences(order.customer?.order_preferences as Record<string, string> | null)
  const orderNotes = order.notes

  return (
    <div className={cn('border-b border-gray-100 last:border-0 transition-colors', index % 2 === 0 ? 'bg-white hover:bg-gray-50/60' : 'bg-gray-100/70 hover:bg-gray-200/60')}>
      {/* Main row */}
      <div className="grid grid-cols-[6rem_6rem_11rem_1fr_1fr_7rem_auto] gap-x-4 items-start px-4 py-3">

        {/* # + date */}
        <div className="min-w-0">
          <button
            onClick={() => onViewDetail(order.id)}
            className="font-mono text-sm font-semibold text-brand-600 hover:underline text-left"
          >
            {order.order_number}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(order.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </p>
        </div>

        {/* Ready by */}
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', order.due_date ? 'text-gray-800' : 'text-gray-300')}>
            {formatDueDate(order.due_date)}
          </p>
          <Badge variant={STATUS_BADGE[order.status] ?? 'secondary'} className="mt-1 text-[10px]">
            {order.status === 'in_progress' ? 'In Progress' : order.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Customer */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{customerLabel}</p>
          {order.customer?.phone && (
            <p className="text-xs text-gray-400 mt-0.5">{order.customer.phone}</p>
          )}
          <p className={cn('text-xs mt-0.5 font-medium', order.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600')}>
            {order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
          </p>
        </div>

        {/* Order details */}
        <div className="min-w-0 space-y-0.5">
          {summary.map(({ label, detail }) => (
            <p key={label} className="text-sm text-gray-800">
              <span className="font-medium">{label}</span>
              <span className="text-gray-500 ml-1">{detail}</span>
            </p>
          ))}
          {(bags > 0 || pieces > 0) && (
            <p className="text-xs text-gray-400 mt-1">
              {bags > 0 && `${bags} bag${bags > 1 ? 's' : ''}`}
              {bags > 0 && pieces > 0 && ' · '}
              {pieces > 0 && `${pieces} pc${pieces > 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="min-w-0">
          {prefNotes && (
            <p className="text-xs text-gray-600 leading-relaxed">{prefNotes}</p>
          )}
          {orderNotes && (
            <p className="text-xs text-gray-500 italic mt-0.5">{orderNotes}</p>
          )}
          {!prefNotes && !orderNotes && (
            <p className="text-xs text-gray-300">—</p>
          )}
        </div>

        {/* Total */}
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{formatCurrency(order.total_amount)}</p>
        </div>

        {/* Actions */}
        <div className="relative flex flex-col items-end gap-1.5">
          <button
            onClick={() => onOpenIssues(order)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap',
              order.issues?.length > 0
                ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                : 'border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600'
            )}
            title="Log issue (stain, tear, etc.)"
          >
            <Camera className="h-3 w-3" />
            Issues{order.issues?.length > 0 ? ` (${order.issues.length})` : ''}
          </button>
          {canEdit && (
            <Link href={`/pos?orderId=${order.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors whitespace-nowrap">
              <Pencil className="h-3 w-3" />
              Edit
            </Link>
          )}
          {/* Status buttons */}
          {order.status === 'cleaning' && (
            <>
              <button onClick={() => onAssign(order.id)}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                Equipment
              </button>
              <button ref={markCleanedRef} onClick={markCleaned} disabled={!!pendingStatus}
                className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap',
                  pendingStatus === 'ready'
                    ? 'border-green-400 bg-green-500 text-white animate-pulse'
                    : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40')}>
                {pendingStatus === 'ready' ? 'Updating…' : 'Mark Cleaned'}
              </button>
            </>
          )}
          {order.status === 'ready' && (
            <>
              <button onClick={() => advance('cleaning')} disabled={!!pendingStatus}
                className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap',
                  pendingStatus === 'cleaning'
                    ? 'border-amber-400 bg-amber-500 text-white animate-pulse'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40')}>
                {pendingStatus === 'cleaning' ? 'Updating…' : '← Cleaning'}
              </button>
              {order.payment_status !== 'paid' ? (
                <button onClick={() => onOpenPayment(order)} disabled={!!pendingStatus}
                  className="rounded-md border border-amber-400 bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 transition-all whitespace-nowrap disabled:opacity-40">
                  Payment
                </button>
              ) : (
                <button onClick={() => advance('picked_up')} disabled={!!pendingStatus}
                  className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap',
                    pendingStatus === 'picked_up'
                      ? 'border-brand-400 bg-brand-500 text-white animate-pulse'
                      : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40')}>
                  {pendingStatus === 'picked_up' ? 'Updating…' : 'Picked Up'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Equipment tags row — only when assigned */}
      {order.assignments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
          {order.assignments.map((a) => (
            <ProgressPill key={a.equipment.id} assignment={a} />
          ))}
        </div>
      )}

      {/* Mark Cleaned confirm popover — fixed so it escapes overflow:hidden */}
      {readyConfirmEquipment && popoverPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setReadyConfirmEquipment(null); setPopoverPos(null) }} />
          <div
            className="fixed z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-3"
            style={{ top: popoverPos.top, right: popoverPos.right }}
          >
            <div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
            <p className="text-xs font-semibold text-gray-800 mb-1">Still in equipment</p>
            <p className="text-xs text-gray-500 mb-2.5">
              Time remaining in: <span className="font-medium text-amber-600">{readyConfirmEquipment.join(', ')}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setReadyConfirmEquipment(null); setPopoverPos(null) }}
                className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={doMarkCleaned}
                disabled={!!pendingStatus}
                className="flex-1 rounded-md bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                Mark Cleaned
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Column header ────────────────────────────────────────────────────────────

function ColHeaders() {
  return (
    <div className="grid grid-cols-[6rem_6rem_11rem_1fr_1fr_7rem_auto] gap-x-4 border-b border-gray-200 bg-gray-50 px-4 py-2">
      {['#', 'READY BY', 'CUSTOMER', 'ORDER', 'NOTES', 'TOTAL', ''].map((h) => (
        <p key={h} className="text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</p>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined)
  const [assigningOrder, setAssigningOrder] = useState<OrderRow | null>(null)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)
  const [issuesOrder, setIssuesOrder] = useState<OrderRow | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<OrderRow | null>(null)

  const { data: orders = [], isLoading } = trpc.orders.list.useQuery(
    statusFilter ? { status: statusFilter } : undefined
  )

  const utils = trpc.useUtils()
  const markPickedUp = trpc.orders.updateStatus.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); setPaymentOrder(null) },
    onError: (e) => toast.error(e.message),
  })

  const busyEquipmentForModal = useMemo(() => {
    const map = new Map<string, string>()
    if (!assigningOrder) return map
    for (const o of orders as unknown as OrderRow[]) {
      if (o.id === assigningOrder.id || o.status !== 'cleaning') continue
      for (const a of o.assignments) map.set(a.equipment.id, o.order_number)
    }
    return map
  }, [assigningOrder?.id, orders])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button key={label} onClick={() => setStatusFilter(value)}
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === value ? 'bg-brand-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50')}>
            {label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <ColHeaders />
        {isLoading && <div className="p-8 text-center text-gray-400">Loading…</div>}
        {!isLoading && orders.length === 0 && (
          <div className="p-8 text-center text-gray-400">No orders found.</div>
        )}
        {(orders as unknown as OrderRow[]).map((order, i) => (
          <OrderCard key={order.id} order={order} index={i}
            onAssign={(id) => {
              const o = (orders as unknown as OrderRow[]).find((x) => x.id === id)
              if (o) setAssigningOrder(o)
            }}
            onViewDetail={(id) => setViewingOrderId(id)}
            onOpenIssues={(o) => setIssuesOrder(o)}
            onOpenPayment={(o) => setPaymentOrder(o)}
          />
        ))}
      </div>

      {assigningOrder && (
        <AssignModal
          orderId={assigningOrder.id}
          orderNumber={assigningOrder.order_number}
          currentAssignments={assigningOrder.assignments}
          busyEquipment={busyEquipmentForModal}
          onClose={() => setAssigningOrder(null)}
        />
      )}

      {viewingOrderId && (
        <OrderDetailModal
          orderId={viewingOrderId}
          onClose={() => setViewingOrderId(null)}
        />
      )}

      {issuesOrder && (
        <OrderIssuesModal
          orderId={issuesOrder.id}
          orderNumber={issuesOrder.order_number}
          onClose={() => setIssuesOrder(null)}
        />
      )}

      {paymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-gray-900">Payment</h2>
            <p className="mb-4 text-sm text-gray-500">Order {paymentOrder.order_number}</p>
            <PaymentModal
              orderId={paymentOrder.id}
              totalCents={paymentOrder.total_amount}
              customer={paymentOrder.customer as import('@laundry/db').Customer | null}
              excludeMethods={['pay_on_collection']}
              onComplete={() => markPickedUp.mutate({ id: paymentOrder.id, status: 'picked_up' })}
              onCancel={() => setPaymentOrder(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
