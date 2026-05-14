'use client'

import { useState, useEffect, useMemo } from 'react'
import { WashingMachine, Wind, FoldVertical, X, Plus, Check } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import type { EquipmentType } from '@laundry/db'
import toast from 'react-hot-toast'
import { OrderDetailModal } from '@/app/(dashboard)/orders/OrderDetailModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MachineAssignment {
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
  customer: { first_name: string; last_name: string; phone?: string | null } | null
  lines: { id: string; name: string; category: string; quantity: number; unit_label: string; unit_price: number }[]
  assignments: MachineAssignment[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcProgress(a: MachineAssignment): number | null {
  if (!a.duration_minutes || !a.assigned_at) return null
  const elapsed = (Date.now() - new Date(a.assigned_at).getTime()) / 60000
  return Math.min(1, elapsed / a.duration_minutes)
}

function hoursAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return `${Math.round(h * 60)}m ago`
  return `${h.toFixed(1)}h ago`
}

function formatTimeRange(assignedAt: string, durationMin: number | null): string {
  const start = new Date(assignedAt)
  const fmt = (d: Date) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (!durationMin) return fmt(start)
  return `${fmt(start)}–${fmt(new Date(start.getTime() + durationMin * 60_000))}`
}

// ─── Machine row (one assignment inside a card) ───────────────────────────────

function MachineRow({ assignment }: { assignment: MachineAssignment }) {
  const [progress, setProgress] = useState(() => calcProgress(assignment))

  useEffect(() => {
    if (!assignment.duration_minutes || !assignment.assigned_at) return
    const id = setInterval(() => setProgress(calcProgress(assignment)), 15_000)
    return () => clearInterval(id)
  }, [assignment.assigned_at, assignment.duration_minutes]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = progress !== null && progress >= 1
  const pct = progress !== null ? Math.round(progress * 100) : null
  const remaining = progress !== null && assignment.duration_minutes
    ? Math.max(0, Math.ceil(assignment.duration_minutes * (1 - progress)))
    : null

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('h-2 w-2 rounded-full shrink-0',
            pct === null ? 'bg-gray-400' : done ? 'bg-amber-400' : 'bg-blue-400')} />
          <span className="font-medium text-gray-700 truncate">{assignment.equipment.name}</span>
          {assignment.temperature && <span className="text-gray-400 shrink-0">· {assignment.temperature}</span>}
        </div>
        <span className={cn('shrink-0 ml-2 font-semibold', done ? 'text-green-600' : 'text-blue-500')}>
          {done ? 'Done!' : remaining !== null ? `${remaining}m` : ''}
        </span>
      </div>
      {assignment.assigned_at && (
        <p className="text-[10px] text-gray-400 pl-3.5">
          {formatTimeRange(assignment.assigned_at, assignment.duration_minutes)}
        </p>
      )}
      {pct !== null && (
        <div className="relative ml-3.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700',
              done ? 'bg-green-500' : 'bg-blue-400')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Order board card ─────────────────────────────────────────────────────────

function BoardOrderCard({
  order, columnType, isDragging, onDragStart, onDragEnd,
  onAddAssignment, onMarkCleaned, onViewDetail,
}: {
  order: OrderRow
  columnType: 'todo' | EquipmentType | 'completed'
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onAddAssignment?: (order: OrderRow, type: EquipmentType) => void
  onMarkCleaned?: (order: OrderRow) => void
  onViewDetail: (id: string) => void
}) {
  const columnAssignments = (columnType === 'todo' || columnType === 'completed')
    ? []
    : order.assignments.filter((a) => a.equipment.type === columnType)

  const draggable = columnType !== 'completed'

  const customerName = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`
    : order.customer_name ?? 'Walk-in'

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-xl bg-white border border-gray-200 p-3 shadow-sm select-none',
        draggable && 'cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start justify-between mb-0.5">
        <button onClick={() => onViewDetail(order.id)}
          className="font-mono text-sm font-bold text-brand-600 hover:underline leading-tight">
          {order.order_number}
        </button>
        <span className="text-[10px] text-gray-400 shrink-0 ml-2">{hoursAgo(order.created_at)}</span>
      </div>
      <p className="text-xs font-medium text-gray-700 truncate">{customerName}</p>
      {order.due_date && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          Due {new Date(order.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
        </p>
      )}

      {columnAssignments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          {columnAssignments.map((a) => (
            <MachineRow key={a.equipment.id} assignment={a} />
          ))}
        </div>
      )}

      {onAddAssignment && columnType !== 'todo' && columnType !== 'completed' && (
        <button
          onClick={() => onAddAssignment(order, columnType as EquipmentType)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 py-1 text-[10px] text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add machine
        </button>
      )}

      {onMarkCleaned && columnType !== 'todo' && columnType !== 'completed' && (
        <button
          onClick={() => onMarkCleaned(order)}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg bg-green-50 border border-green-200 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
        >
          <Check className="h-3 w-3" /> Mark Cleaned
        </button>
      )}
    </div>
  )
}

// ─── Board column ─────────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<string, { label: string; bg: string; ring: string; Icon: React.ElementType | null }> = {
  washer:  { label: 'Washers',   bg: 'bg-blue-50',   ring: 'ring-blue-400',   Icon: WashingMachine },
  dryer:   { label: 'Dryers',    bg: 'bg-orange-50', ring: 'ring-orange-400', Icon: Wind },
  folding: { label: 'Folding',   bg: 'bg-purple-50', ring: 'ring-purple-400', Icon: FoldVertical },
}

function EquipmentColumn({
  type, orders, isDragTarget, draggingOrderId,
  onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd,
  onAddAssignment, onMarkCleaned, onViewDetail,
}: {
  type: EquipmentType
  orders: OrderRow[]
  isDragTarget: boolean
  draggingOrderId: string | null
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onDragStart: (orderId: string) => void
  onDragEnd: () => void
  onAddAssignment: (order: OrderRow, type: EquipmentType) => void
  onMarkCleaned: (order: OrderRow) => void
  onViewDetail: (id: string) => void
}) {
  const { label, bg, ring, Icon } = COLUMN_CONFIG[type]

  return (
    <div
      className={cn('flex w-64 shrink-0 flex-col rounded-xl transition-all', bg,
        isDragTarget && `ring-2 ${ring} ring-offset-2`)}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        {Icon && <Icon className="h-4 w-4 text-gray-500" />}
        <span className="font-semibold text-gray-700 text-sm">{label}</span>
        <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
          {orders.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-[120px]">
        {isDragTarget && (
          <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-current opacity-40 text-xs font-medium">
            Drop to assign
          </div>
        )}
        {orders.map((order) => (
          <BoardOrderCard
            key={order.id}
            order={order}
            columnType={type}
            isDragging={draggingOrderId === order.id}
            onDragStart={() => onDragStart(order.id)}
            onDragEnd={onDragEnd}
            onAddAssignment={onAddAssignment}
            onMarkCleaned={onMarkCleaned}
            onViewDetail={onViewDetail}
          />
        ))}
        {orders.length === 0 && !isDragTarget && (
          <p className="text-center text-xs text-gray-300 pt-8">Drag orders here</p>
        )}
      </div>
    </div>
  )
}

// ─── Machines assign modal (filtered by type) ─────────────────────────────────

const WASHER_TIMES = [30, 35, 40, 45]
const DRYER_TIMES  = [15, 20, 30, 45, 60]
const TEMPS = ['Cold', 'Warm', 'Hot']

type AssignmentDetail = { duration_minutes: number | null; temperature: string | null }

function MachinesAssignModal({
  order, filterType, busyEquipment, onClose, onSaved,
}: {
  order: OrderRow
  filterType: EquipmentType
  busyEquipment: Map<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const { data: allEquipment = [] } = trpc.equipment.list.useQuery(undefined)

  // Start with ALL current assignments so other types are preserved on save
  const [details, setDetails] = useState<Map<string, AssignmentDetail>>(() => {
    const m = new Map<string, AssignmentDetail>()
    for (const a of order.assignments) {
      m.set(a.equipment.id, { duration_minutes: a.duration_minutes, temperature: a.temperature })
    }
    return m
  })

  const setAssignments = trpc.equipment.setAssignments.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success('Equipment updated'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  const isComplete = (equipId: string): boolean => {
    const a = order.assignments.find((x) => x.equipment.id === equipId)
    if (!a?.duration_minutes || !a?.assigned_at) return false
    return (Date.now() - new Date(a.assigned_at).getTime()) / 60000 >= a.duration_minutes
  }

  const toggle = (id: string) => setDetails((prev) => {
    const next = new Map(prev)
    next.has(id) ? next.delete(id) : next.set(id, { duration_minutes: null, temperature: null })
    return next
  })

  const setDetail = (id: string, patch: Partial<AssignmentDetail>) =>
    setDetails((prev) => {
      const next = new Map(prev)
      next.set(id, { ...(next.get(id) ?? { duration_minutes: null, temperature: null }), ...patch })
      return next
    })

  const equipment = allEquipment.filter((e) => e.type === filterType)
  const times = filterType === 'washer' ? WASHER_TIMES : filterType === 'dryer' ? DRYER_TIMES : []
  const typeLabel = filterType === 'washer' ? 'Washer' : filterType === 'dryer' ? 'Dryer' : 'Folding Station'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Assign {typeLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {equipment.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No {typeLabel.toLowerCase()}s set up — add them in Settings → Equipment.
            </p>
          )}
          {equipment.map((item) => {
            const active = details.has(item.id)
            const detail = details.get(item.id)
            const complete = active && isComplete(item.id)
            const busyBy = active ? undefined : busyEquipment.get(item.id)

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
                          <button key={t}
                            onClick={() => setDetail(item.id, { duration_minutes: detail?.duration_minutes === t ? null : t })}
                            className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                              detail?.duration_minutes === t
                                ? 'border-brand-500 bg-brand-600 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Temperature</p>
                      <div className="flex gap-1.5">
                        {TEMPS.map((temp) => (
                          <button key={temp}
                            onClick={() => setDetail(item.id, { temperature: detail?.temperature === temp ? null : temp })}
                            className={cn('flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                              detail?.temperature === temp
                                ? 'border-brand-500 bg-brand-600 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
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

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => setAssignments.mutate({
              order_id: order.id,
              assignments: Array.from(details.entries()).map(([equipment_id, d]) => ({ equipment_id, ...d })),
            })}
            disabled={setAssignments.isPending}
            className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {setAssignments.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const utils = trpc.useUtils()
  const { data: orders = [], isLoading } = trpc.orders.list.useQuery(
    { limit: 200 },
    { refetchInterval: 30_000 }
  )

  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<EquipmentType | null>(null)
  const [assignTarget, setAssignTarget] = useState<{ order: OrderRow; type: EquipmentType } | null>(null)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)
  const [markCleanedOrder, setMarkCleanedOrder] = useState<OrderRow | null>(null)

  const allOrders = orders as unknown as OrderRow[]
  const cleaning = allOrders.filter((o) => o.status === 'cleaning')
  const ready = allOrders.filter((o) => o.status === 'ready')

  const toDoOrders = cleaning.filter((o) => !o.assignments || o.assignments.length === 0)
  const washerOrders = cleaning.filter((o) => o.assignments?.some((a) => a.equipment.type === 'washer'))
  const dryerOrders = cleaning.filter((o) => o.assignments?.some((a) => a.equipment.type === 'dryer'))
  const foldingOrders = cleaning.filter((o) => o.assignments?.some((a) => a.equipment.type === 'folding'))

  // All equipment currently in use (maps equipId → orderNumber)
  const busyEquipment = useMemo(() => {
    const map = new Map<string, string>()
    for (const order of cleaning) {
      for (const a of order.assignments ?? []) {
        if (!map.has(a.equipment.id)) map.set(a.equipment.id, order.order_number)
      }
    }
    return map
  }, [cleaning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remove the target order's own machines from the busy map (it can reassign its own)
  const busyForModal = useMemo(() => {
    if (!assignTarget) return busyEquipment
    const map = new Map(busyEquipment)
    for (const a of assignTarget.order.assignments) map.delete(a.equipment.id)
    return map
  }, [busyEquipment, assignTarget])

  const setAssignmentsM = trpc.equipment.setAssignments.useMutation({
    onSuccess: () => utils.orders.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })
  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: (u) => { utils.orders.list.invalidate(); toast.success(`${u.order_number} — marked cleaned`) },
    onError: (e) => toast.error(e.message),
  })

  const handleDrop = (type: EquipmentType) => {
    const order = cleaning.find((o) => o.id === draggingOrderId)
    if (!order) return
    setAssignTarget({ order, type })
    setDraggingOrderId(null)
    setDragTarget(null)
  }

  const handleMarkCleaned = (order: OrderRow) => {
    const active = order.assignments.filter((a) => {
      if (!a.duration_minutes || !a.assigned_at) return false
      return (Date.now() - new Date(a.assigned_at).getTime()) / 60000 < a.duration_minutes
    })
    if (active.length > 0) { setMarkCleanedOrder(order); return }
    doMarkCleaned(order)
  }

  const doMarkCleaned = (order: OrderRow) => {
    setMarkCleanedOrder(null)
    setAssignmentsM.mutate({ order_id: order.id, assignments: [] }, {
      onSettled: () => updateStatus.mutate({ id: order.id, status: 'ready' }),
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Workflow</h1>
        <span className="text-sm text-gray-400">Drag orders between columns to assign equipment</span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full">

          {/* To-Do column */}
          <div className="flex w-64 shrink-0 flex-col rounded-xl bg-gray-100">
            <div className="flex items-center gap-2 px-3 py-3">
              <span className="font-semibold text-gray-700 text-sm">To-Do</span>
              <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
                {toDoOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {isLoading && <p className="text-center text-xs text-gray-300 pt-8">Loading…</p>}
              {!isLoading && toDoOrders.length === 0 && (
                <p className="text-center text-xs text-gray-300 pt-8">All orders assigned</p>
              )}
              {toDoOrders.map((order) => (
                <BoardOrderCard
                  key={order.id}
                  order={order}
                  columnType="todo"
                  isDragging={draggingOrderId === order.id}
                  onDragStart={() => setDraggingOrderId(order.id)}
                  onDragEnd={() => { setDraggingOrderId(null); setDragTarget(null) }}
                  onViewDetail={setViewingOrderId}
                />
              ))}
            </div>
          </div>

          {/* Equipment columns */}
          {(['washer', 'dryer', 'folding'] as EquipmentType[]).map((type) => (
            <EquipmentColumn
              key={type}
              type={type}
              orders={type === 'washer' ? washerOrders : type === 'dryer' ? dryerOrders : foldingOrders}
              isDragTarget={dragTarget === type}
              draggingOrderId={draggingOrderId}
              onDragOver={() => setDragTarget(type)}
              onDragLeave={() => setDragTarget(null)}
              onDrop={() => handleDrop(type)}
              onDragStart={(id) => setDraggingOrderId(id)}
              onDragEnd={() => { setDraggingOrderId(null); setDragTarget(null) }}
              onAddAssignment={(order, t) => setAssignTarget({ order, type: t })}
              onMarkCleaned={handleMarkCleaned}
              onViewDetail={setViewingOrderId}
            />
          ))}

          {/* Completed column */}
          <div className="flex w-64 shrink-0 flex-col rounded-xl bg-green-50">
            <div className="flex items-center gap-2 px-3 py-3">
              <Check className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-gray-700 text-sm">Cleaned</span>
              <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
                {ready.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {ready.map((order) => (
                <BoardOrderCard
                  key={order.id}
                  order={order}
                  columnType="completed"
                  onViewDetail={setViewingOrderId}
                />
              ))}
              {ready.length === 0 && (
                <p className="text-center text-xs text-gray-300 pt-8">No ready orders</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign modal */}
      {assignTarget && (
        <MachinesAssignModal
          order={assignTarget.order}
          filterType={assignTarget.type}
          busyEquipment={busyForModal}
          onClose={() => setAssignTarget(null)}
          onSaved={() => setAssignTarget(null)}
        />
      )}

      {/* Mark Cleaned confirmation (active timers still running) */}
      {markCleanedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Still in equipment</h2>
            <p className="text-sm text-gray-600 mb-4">
              This order still has time remaining in some machines. Mark as cleaned anyway?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMarkCleanedOrder(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => doMarkCleaned(markCleanedOrder)}
                className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700">
                Mark Cleaned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {viewingOrderId && (
        <OrderDetailModal orderId={viewingOrderId} onClose={() => setViewingOrderId(null)} />
      )}
    </div>
  )
}
