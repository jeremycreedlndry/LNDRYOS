'use client'

import { useState, useEffect, useMemo } from 'react'
import { WashingMachine, Wind, FoldVertical, X, Plus, Check, LayoutGrid, Columns } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import type { EquipmentType } from '@laundry/db'
import toast from 'react-hot-toast'
import { OrderDetailModal } from '@/app/(dashboard)/orders/OrderDetailModal'
import { printBagOutLabels, type LabelSize } from '@/lib/printJobs'

// ─── Bag count modal (workflow) ───────────────────────────────────────────────

function BagCountWorkflowModal({ onConfirm, onCancel }: {
  onConfirm: (count: number) => void
  onCancel: () => void
}) {
  const [count, setCount] = useState(1)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">How many bags?</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setCount((c) => Math.max(1, c - 1))}
              className="h-10 w-10 rounded-full border border-gray-200 text-xl font-bold text-gray-600 hover:bg-gray-50">−</button>
            <span className="text-4xl font-bold text-gray-900 w-12 text-center">{count}</span>
            <button onClick={() => setCount((c) => c + 1)}
              className="h-10 w-10 rounded-full border border-gray-200 text-xl font-bold text-gray-600 hover:bg-gray-50">+</button>
          </div>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setCount(n)}
                className={cn('h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                  count === n ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => onConfirm(count)}
              className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700">
              Print &amp; Mark Cleaned
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MachineAssignment {
  duration_minutes: number | null
  temperature: string | null
  assigned_at: string | null
  equipment: { id: string; name: string; type: string }
}

interface OrderLoad {
  id: string
  load_number: number
  stage: 'washing' | 'drying' | 'folding' | 'ready'
  equipment_id: string | null
  duration_minutes: number | null
  temperature: string | null
  assigned_at: string | null
  equipment: { id: string; name: string; type: string } | null
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
  loads: OrderLoad[]
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

// ─── Per-load row inside a board card ────────────────────────────────────────

// Stage of a load → which column it belongs to
const LOAD_STAGE_COLUMN: Record<string, EquipmentType> = {
  washing: 'washer',
  drying:  'dryer',
  folding: 'folding',
}

function LoadRow({
  load,
  onMoveToNext,
}: {
  load: OrderLoad
  onMoveToNext: (load: OrderLoad) => void   // open MoveLoadModal or direct mark-ready
}) {
  const [progress, setProgress] = useState(() => {
    if (!load.duration_minutes || !load.assigned_at) return null
    const elapsed = (Date.now() - new Date(load.assigned_at).getTime()) / 60000
    return Math.min(1, elapsed / load.duration_minutes)
  })

  useEffect(() => {
    if (!load.duration_minutes || !load.assigned_at) return
    const id = setInterval(() => {
      const elapsed = (Date.now() - new Date(load.assigned_at!).getTime()) / 60000
      setProgress(Math.min(1, elapsed / load.duration_minutes!))
    }, 15_000)
    return () => clearInterval(id)
  }, [load.assigned_at, load.duration_minutes])

  const done = progress !== null && progress >= 1
  const pct  = progress !== null ? Math.round(progress * 100) : null
  const remaining = progress !== null && load.duration_minutes
    ? Math.max(0, Math.ceil(load.duration_minutes * (1 - progress)))
    : null

  const nextLabel = load.stage === 'washing' ? '→ Dryers'
    : load.stage === 'drying' ? '→ Folding'
    : load.stage === 'folding' ? 'Mark Ready'
    : null

  if (load.stage === 'ready') return null

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            pct === null ? 'bg-gray-400' : done ? 'bg-amber-400' : 'bg-blue-400',
          )} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0">
            Load {load.load_number}
          </span>
          {load.equipment && (
            <span className="text-[10px] text-gray-500 truncate">· {load.equipment.name}</span>
          )}
          {load.temperature && (
            <span className="text-[10px] text-gray-400 shrink-0">· {load.temperature}</span>
          )}
        </div>
        <span className={cn('text-[10px] font-semibold shrink-0', done ? 'text-green-600' : 'text-blue-500')}>
          {done ? 'Done!' : remaining !== null ? `${remaining}m` : ''}
        </span>
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="relative h-1 overflow-hidden rounded-full bg-blue-100">
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700',
              done ? 'bg-green-500' : 'bg-blue-400')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Move button */}
      {nextLabel && (
        <button
          onClick={() => onMoveToNext(load)}
          className={cn(
            'flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-semibold transition-colors',
            load.stage === 'folding'
              ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100',
          )}
        >
          {nextLabel}
        </button>
      )}
    </div>
  )
}

// ─── Move-load modal (single machine picker for one load) ─────────────────────

function MoveLoadModal({
  load,
  allEquipment,
  busyEquipment,
  onClose,
  onSaved,
}: {
  load: OrderLoad
  allEquipment: EquipItem[]
  busyEquipment: Map<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()

  // target type for the next stage
  const targetType: EquipmentType = load.stage === 'washing' ? 'dryer' : 'folding'
  const typeLabel  = targetType === 'dryer' ? 'Dryer' : 'Folding Station'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [duration,   setDuration]   = useState<number | null>(null)
  const [temp,       setTemp]       = useState<string | null>(null)

  const moveLoad = trpc.equipment.moveLoad.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success(`Load ${load.load_number} moved to ${typeLabel}`); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  const equipment = sortEquipment(allEquipment.filter((e) => e.type === targetType))
  const times     = targetType === 'dryer' ? DRYER_TIMES : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Move Load {load.load_number} → {typeLabel}
            </h2>
            {load.equipment && (
              <p className="text-xs text-gray-500 mt-0.5">From {load.equipment.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {equipment.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No {typeLabel.toLowerCase()}s set up — add them in Settings → Equipment.
            </p>
          )}
          {equipment.map((item) => {
            const busy = !selectedId || selectedId !== item.id ? busyEquipment.get(item.id) : undefined
            const active = selectedId === item.id

            if (busy) {
              return (
                <div key={item.id} className="rounded-xl border-2 border-gray-100 bg-gray-50 flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm font-semibold text-gray-400">{item.name}</span>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-gray-200 text-gray-400">In use · {busy}</span>
                </div>
              )
            }

            return (
              <div key={item.id} className={cn('rounded-xl border-2 transition-colors',
                active ? 'border-brand-400 bg-brand-50' : 'border-gray-200')}>
                <button onClick={() => setSelectedId(active ? null : item.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5">
                  <span className={cn('text-sm font-semibold', active ? 'text-brand-700' : 'text-gray-700')}>
                    {item.name}
                  </span>
                  <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium',
                    active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500')}>
                    {active ? 'Selected' : 'Tap to select'}
                  </span>
                </button>

                {active && times.length > 0 && (
                  <div className="border-t border-brand-200 px-3 pb-3 pt-2 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Time (min)</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {times.map((t) => (
                          <button key={t}
                            onClick={() => setDuration(duration === t ? null : t)}
                            className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                              duration === t
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
                        {TEMPS.map((t) => (
                          <button key={t}
                            onClick={() => setTemp(temp === t ? null : t)}
                            className={cn('flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                              temp === t
                                ? 'border-brand-500 bg-brand-600 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                            {t}
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
            onClick={() => {
              if (!selectedId) return
              moveLoad.mutate({ load_id: load.id, equipment_id: selectedId, duration_minutes: duration, temperature: temp })
            }}
            disabled={!selectedId || moveLoad.isPending}
            className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {moveLoad.isPending ? 'Moving…' : `Move to ${typeLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Order board card ─────────────────────────────────────────────────────────

// Natural next stage for each column
const NEXT_STAGE: Partial<Record<string, { type: EquipmentType; label: string } | 'ready'>> = {
  washer:  { type: 'dryer',   label: '→ Dryers' },
  dryer:   { type: 'folding', label: '→ Folding' },
  folding: 'ready',
}

function BoardOrderCard({
  order, columnType, isDragging, onDragStart, onDragEnd,
  onAddAssignment, onMarkCleaned, onMoveNext, onMoveLoad, onViewDetail,
}: {
  order: OrderRow
  columnType: 'todo' | EquipmentType | 'completed'
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onAddAssignment?: (order: OrderRow, type: EquipmentType) => void
  onMarkCleaned?: (order: OrderRow) => void
  onMoveNext?: (order: OrderRow, next: EquipmentType | 'ready', clearFrom: EquipmentType) => void
  onMoveLoad?: (load: OrderLoad) => void
  onViewDetail: (id: string) => void
}) {
  const hasLoads = (order.loads?.length ?? 0) > 0

  // Loads that belong to this column (by stage)
  const columnLoads = (hasLoads && columnType !== 'todo' && columnType !== 'completed')
    ? (order.loads ?? []).filter((l) => LOAD_STAGE_COLUMN[l.stage] === columnType)
    : []

  // Legacy: assignments for the current column (orders without loads)
  const columnAssignments = (!hasLoads && columnType !== 'todo' && columnType !== 'completed')
    ? order.assignments.filter((a) => a.equipment.type === columnType)
    : []

  const draggable = !hasLoads && columnType !== 'completed'

  const customerName = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`
    : order.customer_name ?? 'Walk-in'

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
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

      {/* Load-aware: show per-load sub-cards */}
      {columnLoads.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
          {columnLoads.map((load) => (
            <LoadRow
              key={load.id}
              load={load}
              onMoveToNext={(l) => onMoveLoad?.(l)}
            />
          ))}
        </div>
      )}

      {/* Legacy: show machine rows (orders without loads) */}
      {columnAssignments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          {columnAssignments.map((a) => (
            <MachineRow key={a.equipment.id} assignment={a} />
          ))}
        </div>
      )}

      {/* Legacy action buttons (only for non-load orders) */}
      {!hasLoads && columnType !== 'todo' && columnType !== 'completed' && (
        <div className="mt-2 space-y-1">
          {onAddAssignment && (
            <button
              onClick={() => onAddAssignment(order, columnType as EquipmentType)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 py-1 text-[10px] text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add machine
            </button>
          )}
          {(() => {
            const next = NEXT_STAGE[columnType]
            if (!next) return null
            if (next === 'ready') {
              return onMarkCleaned ? (
                <button
                  onClick={() => onMarkCleaned(order)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-green-50 border border-green-200 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                >
                  <Check className="h-3 w-3" /> Mark Ready
                </button>
              ) : null
            }
            return onMoveNext ? (
              <button
                onClick={() => onMoveNext(order, next.type, columnType as EquipmentType)}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-50 border border-brand-200 py-1 text-[10px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              >
                {next.label}
              </button>
            ) : null
          })()}
        </div>
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
  onAddAssignment, onMarkCleaned, onMoveNext, onMoveLoad, onViewDetail,
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
  onMoveNext: (order: OrderRow, next: EquipmentType | 'ready', clearFrom: EquipmentType) => void
  onMoveLoad: (load: OrderLoad) => void
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
            onMoveNext={onMoveNext}
            onMoveLoad={onMoveLoad}
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

type AssignmentDetail = { duration_minutes: number | null; temperature: string | null; assigned_at?: string | null }

function MachinesAssignModal({
  order, filterType, clearFromType, busyEquipment, mode, onClose, onSaved,
}: {
  order: OrderRow
  filterType: EquipmentType
  clearFromType?: EquipmentType   // when moving from another column, drop those assignments
  busyEquipment: Map<string, string>
  /** 'loads' — creates order_loads (first washer assignment); 'assignments' — legacy */
  mode?: 'loads' | 'assignments'
  onClose: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const { data: allEquipment = [] } = trpc.equipment.list.useQuery(undefined)

  // Start with existing assignments, but drop any belonging to the source column
  // (so dragging Washers → Dryers doesn't keep the washer assignment)
  const [details, setDetails] = useState<Map<string, AssignmentDetail>>(() => {
    const m = new Map<string, AssignmentDetail>()
    for (const a of order.assignments) {
      if (clearFromType && a.equipment.type === clearFromType) continue
      m.set(a.equipment.id, { duration_minutes: a.duration_minutes, temperature: a.temperature, assigned_at: a.assigned_at })
    }
    return m
  })
  const [autoSelected, setAutoSelected] = useState<string | null>(null)
  // Stacked dryers: when Nayax device has top+bottom, we need the employee to pick one
  const [stackedCandidates, setStackedCandidates] = useState<{ id: string; name: string }[]>([])

  // Query Lynx API for the employee's last machine — only poll machines of this type
  const { data: lastMachine } = trpc.nayax.getLastMachineUsed.useQuery(
    { minutes: 120, equipment_type: filterType },
    { staleTime: 0, retry: false }
  )
  useEffect(() => {
    if (!lastMachine?.machine_name || !lastMachine.equipment?.length) return
    const matches = lastMachine.equipment.filter((e) => e.type === filterType)
    if (matches.length === 0) return

    if (matches.length === 1) {
      // Single machine — auto-select as before
      const equipId = matches[0].id
      if (busyEquipment.has(equipId)) return
      setDetails((prev) => {
        if (prev.has(equipId)) return prev
        const next = new Map(prev)
        next.set(equipId, { duration_minutes: null, temperature: null })
        return next
      })
      setAutoSelected(matches[0].name)
    } else {
      // Stacked dryer (or any device with multiple equipment) — ask which slot
      const available = matches.filter((m) => !busyEquipment.has(m.id))
      if (available.length === 0) return  // both slots busy
      if (available.length === 1) {
        // Only one slot free — auto-select it
        setDetails((prev) => {
          if (prev.has(available[0].id)) return prev
          const next = new Map(prev)
          next.set(available[0].id, { duration_minutes: null, temperature: null })
          return next
        })
        setAutoSelected(available[0].name)
      } else {
        setStackedCandidates(available)
      }
    }
  }, [lastMachine, filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAssignments = trpc.equipment.setAssignments.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success('Equipment updated'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  const createLoads = trpc.equipment.createLoads.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success('Loads created'); onSaved() },
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

  const equipment = sortEquipment(allEquipment.filter((e) => e.type === filterType) as EquipItem[])
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
        {stackedCandidates.length > 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800 mb-2">
              ⚡ Used <strong>{lastMachine?.machine_name}</strong> — top or bottom dryer?
            </p>
            <div className="flex gap-2">
              {stackedCandidates.map((c) => {
                const slotLabel = c.name.toUpperCase().includes('BOTTOM') ? 'Bottom' : c.name.toUpperCase().includes('TOP') ? 'Top' : c.name
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setDetails((prev) => {
                        const next = new Map(prev)
                        next.set(c.id, { duration_minutes: null, temperature: null })
                        return next
                      })
                      setStackedCandidates([])
                      setAutoSelected(c.name)
                    }}
                    className="flex-1 rounded-lg border border-amber-300 bg-white py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition-colors"
                  >
                    {slotLabel}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {autoSelected && stackedCandidates.length === 0 && (
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2">
            <span className="text-xs text-blue-700">⚡ Pre-selected <strong>{autoSelected}</strong> based on your last use</span>
          </div>
        )}

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
            onClick={() => {
              const entries = Array.from(details.entries())
              if (mode === 'loads') {
                createLoads.mutate({
                  order_id: order.id,
                  machines: entries.map(([equipment_id, d]) => ({ equipment_id, ...d })),
                })
              } else {
                setAssignments.mutate({
                  order_id: order.id,
                  assignments: entries.map(([equipment_id, d]) => ({ equipment_id, ...d })),
                })
              }
            }}
            disabled={setAssignments.isPending || createLoads.isPending}
            className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {(setAssignments.isPending || createLoads.isPending) ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Machine View ─────────────────────────────────────────────────────────────

interface EquipItem { id: string; name: string; type: string; sort_order: number }

/**
 * Returns a [brandOrder, machineNumber, slotOrder] sort key.
 * Washers: LG (1–21) → Domus → other
 * Dryers:  ADC by number, top (0) before bottom (1)
 */
function parseMachineSort(name: string): [number, number, number] {
  const upper = name.toUpperCase()
  // Extract the first run of digits (e.g. "LG 5 - Giant" → 5, "ADC DBL 3 (Top)" → 3)
  const num  = parseInt(name.match(/\d+/)?.[0] ?? '999')
  const slot = upper.includes('BOTTOM') ? 1 : 0
  if (upper.includes('LG'))    return [0, num, slot]
  if (upper.includes('DOMUS')) return [1, num, slot]
  if (upper.includes('ADC'))   return [2, num, slot]
  return [3, num, slot]
}

function sortEquipment(items: EquipItem[]): EquipItem[] {
  return [...items].sort((a, b) => {
    const ka = parseMachineSort(a.name)
    const kb = parseMachineSort(b.name)
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i]
    }
    return a.sort_order - b.sort_order
  })
}

function MachineTile({
  equip,
  assignmentData,
  onViewDetail,
}: {
  equip: EquipItem
  assignmentData?: { order: OrderRow; assignment: MachineAssignment }
  onViewDetail: (id: string) => void
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const { order, assignment } = assignmentData ?? {}

  const remaining = useMemo(() => {
    if (!assignment?.duration_minutes || !assignment?.assigned_at) return null
    const elapsed = (Date.now() - new Date(assignment.assigned_at).getTime()) / 60000
    return Math.max(0, Math.ceil(assignment.duration_minutes - elapsed))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.assigned_at, assignment?.duration_minutes, tick])

  const done  = remaining !== null && remaining === 0
  const inUse = !!order

  const customerName = order?.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`
    : order?.customer_name ?? 'Walk-in'

  // Colour scheme
  const bg = !inUse
    ? 'bg-gray-50 border-gray-200'
    : done
    ? 'bg-green-50 border-green-400'
    : equip.type === 'washer'
    ? 'bg-blue-50 border-blue-300'
    : equip.type === 'dryer'
    ? 'bg-orange-50 border-orange-300'
    : 'bg-purple-50 border-purple-300'

  const dotColour = !inUse
    ? 'bg-gray-300'
    : done
    ? 'bg-green-500 animate-pulse'
    : equip.type === 'washer'
    ? 'bg-blue-500'
    : equip.type === 'dryer'
    ? 'bg-orange-500'
    : 'bg-purple-500'

  return (
    <button
      onClick={() => order && onViewDetail(order.id)}
      disabled={!order}
      className={cn(
        'relative flex flex-col rounded-xl border-2 p-3 text-left transition-all w-full',
        bg,
        order && 'hover:shadow-md cursor-pointer',
        !order && 'cursor-default',
      )}
    >
      {/* Status dot */}
      <span className={cn('absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full', dotColour)} />

      {/* Machine name */}
      <p className="text-xs font-bold text-gray-700 pr-4 leading-tight truncate">{equip.name}</p>

      {inUse ? (
        <>
          <p className="mt-1.5 text-sm font-semibold text-gray-900 truncate leading-tight">{customerName}</p>
          <p className="text-[10px] text-gray-500 truncate">{order!.order_number}</p>
          {remaining !== null && (
            <p className={cn(
              'mt-1.5 text-lg font-black leading-none',
              done ? 'text-green-600' : equip.type === 'washer' ? 'text-blue-600' : 'text-orange-600',
            )}>
              {done ? '✓ Done' : `${remaining}m`}
            </p>
          )}
          {assignment?.assigned_at && assignment.duration_minutes && !done && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatTimeRange(assignment.assigned_at, assignment.duration_minutes)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-400">Idle</p>
      )}
    </button>
  )
}

function MachineSection({
  label, Icon, bgHeader, equipment, assignmentsByEquip, onViewDetail,
}: {
  label: string
  Icon: React.ElementType
  bgHeader: string
  equipment: EquipItem[]
  assignmentsByEquip: Map<string, { order: OrderRow; assignment: MachineAssignment }>
  onViewDetail: (id: string) => void
}) {
  if (equipment.length === 0) return null
  const inUseCount = equipment.filter((e) => assignmentsByEquip.has(e.id)).length

  return (
    <div className="mb-6">
      <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 mb-3', bgHeader)}>
        <Icon className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="ml-auto text-xs text-gray-500">
          {inUseCount} / {equipment.length} in use
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {equipment.map((equip) => (
          <MachineTile
            key={equip.id}
            equip={equip}
            assignmentData={assignmentsByEquip.get(equip.id)}
            onViewDetail={onViewDetail}
          />
        ))}
      </div>
    </div>
  )
}

function MachineView({
  cleaning,
  onViewDetail,
}: {
  cleaning: OrderRow[]
  onViewDetail: (id: string) => void
}) {
  const { data: allEquipment = [] } = trpc.equipment.list.useQuery(undefined, { staleTime: 60_000 })

  const assignmentsByEquip = useMemo(() => {
    const map = new Map<string, { order: OrderRow; assignment: MachineAssignment }>()
    for (const order of cleaning) {
      for (const a of order.assignments ?? []) {
        map.set(a.equipment.id, { order, assignment: a })
      }
    }
    return map
  }, [cleaning])

  const washers  = sortEquipment((allEquipment as EquipItem[]).filter((e) => e.type === 'washer'))
  const dryers   = sortEquipment((allEquipment as EquipItem[]).filter((e) => e.type === 'dryer'))
  const folding  = sortEquipment((allEquipment as EquipItem[]).filter((e) => e.type === 'folding'))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <MachineSection
        label="Washers"
        Icon={WashingMachine}
        bgHeader="bg-blue-50"
        equipment={washers}
        assignmentsByEquip={assignmentsByEquip}
        onViewDetail={onViewDetail}
      />
      <MachineSection
        label="Dryers"
        Icon={Wind}
        bgHeader="bg-orange-50"
        equipment={dryers}
        assignmentsByEquip={assignmentsByEquip}
        onViewDetail={onViewDetail}
      />
      <MachineSection
        label="Folding Stations"
        Icon={FoldVertical}
        bgHeader="bg-purple-50"
        equipment={folding}
        assignmentsByEquip={assignmentsByEquip}
        onViewDetail={onViewDetail}
      />
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
  const { data: allEquipment = [] } = trpc.equipment.list.useQuery(undefined, { staleTime: 60_000 })

  const [viewMode, setViewMode] = useState<'board' | 'machines'>('board')
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [draggingFromType, setDraggingFromType] = useState<EquipmentType | 'todo' | null>(null)
  const [dragTarget, setDragTarget] = useState<EquipmentType | null>(null)
  const [assignTarget, setAssignTarget] = useState<{ order: OrderRow; type: EquipmentType; clearFromType?: EquipmentType; mode?: 'loads' | 'assignments' } | null>(null)
  const [moveLoadTarget, setMoveLoadTarget] = useState<OrderLoad | null>(null)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)
  const [markCleanedOrder, setMarkCleanedOrder] = useState<OrderRow | null>(null)
  const [bagCountOrder, setBagCountOrder] = useState<OrderRow | null>(null)
  const { data: tenant } = trpc.tenants.getCurrent.useQuery(undefined, { staleTime: 60_000 })

  const allOrders = orders as unknown as OrderRow[]

  // Only show orders that have at least one item that actually needs cleaning.
  // Gift cards and products are fulfilled instantly — they don't go through the wash/dry/fold workflow.
  const NON_CLEANING = ['gift_card', 'product']
  const cleaning = allOrders.filter((o) =>
    o.status === 'cleaning' &&
    o.lines.some((l) => !NON_CLEANING.includes(l.category))
  )

  // Orders with loads: appear in whichever column(s) their active loads belong to.
  // Orders without loads: use legacy assignment-based column placement.
  const toDoOrders = cleaning.filter((o) =>
    (!o.loads?.length && (!o.assignments || o.assignments.length === 0))
  )
  const washerOrders = cleaning.filter((o) =>
    o.loads?.some((l) => l.stage === 'washing') ||
    (!o.loads?.length && o.assignments?.some((a) => a.equipment.type === 'washer'))
  )
  const dryerOrders = cleaning.filter((o) =>
    o.loads?.some((l) => l.stage === 'drying') ||
    (!o.loads?.length && o.assignments?.some((a) => a.equipment.type === 'dryer'))
  )
  const foldingOrders = cleaning.filter((o) =>
    o.loads?.some((l) => l.stage === 'folding') ||
    (!o.loads?.length && o.assignments?.some((a) => a.equipment.type === 'folding'))
  )

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
    // If dragging from a different equipment column, clear that column's assignments
    const clearFromType = (draggingFromType && draggingFromType !== 'todo' && draggingFromType !== type)
      ? draggingFromType as EquipmentType
      : undefined
    // Use load mode when dropping a load-less order onto washers for the first time
    const mode = (type === 'washer' && !order.loads?.length) ? 'loads' : 'assignments'
    setAssignTarget({ order, type, clearFromType, mode })
    setDraggingOrderId(null)
    setDraggingFromType(null)
    setDragTarget(null)
  }

  const handleMoveNext = (order: OrderRow, next: EquipmentType | 'ready', clearFrom: EquipmentType) => {
    if (next === 'ready') {
      handleMarkCleaned(order)
    } else {
      setAssignTarget({ order, type: next, clearFromType: clearFrom })
    }
  }

  const handleMarkCleaned = (order: OrderRow) => {
    const active = order.assignments.filter((a) => {
      if (!a.duration_minutes || !a.assigned_at) return false
      return (Date.now() - new Date(a.assigned_at).getTime()) / 60000 < a.duration_minutes
    })
    if (active.length > 0) { setMarkCleanedOrder(order); return }
    setBagCountOrder(order)
  }

  // Load-level move: if going to 'ready', call moveLoad directly; otherwise open MoveLoadModal
  const moveLoadM = trpc.equipment.moveLoad.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success('Load marked ready') },
    onError: (e) => toast.error(e.message),
  })
  const handleMoveLoad = (load: OrderLoad) => {
    if (load.stage === 'folding') {
      // Mark ready directly — no machine to pick
      moveLoadM.mutate({ load_id: load.id })
    } else {
      setMoveLoadTarget(load)
    }
  }

  const doMarkCleaned = (order: OrderRow, bagCount?: number) => {
    setMarkCleanedOrder(null)
    setBagCountOrder(null)

    // Print bag-out labels if configured
    const hw = (tenant?.settings as Record<string, unknown> | null)?.hardware as Record<string, unknown> | undefined
    const labelPrinter = (hw?.label_printer as Record<string, string> | undefined)?.name
    if (labelPrinter && bagCount && bagCount > 0) {
      const labelSize = hw?.label_size as LabelSize | undefined
      printBagOutLabels(labelPrinter, {
        order_number: order.order_number,
        customer_name: order.customer ? `${(order.customer as { first_name: string; last_name: string }).first_name} ${(order.customer as { first_name: string; last_name: string }).last_name}` : null,
      }, bagCount, tenant?.name as string | undefined, labelSize)
        .catch((e) => console.warn('[bag-out print]', e))
    }

    setAssignmentsM.mutate({ order_id: order.id, assignments: [] }, {
      onSettled: () => updateStatus.mutate({ id: order.id, status: 'ready' }),
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Workflow</h1>
        {viewMode === 'board' && (
          <span className="text-sm text-gray-400">Drag orders between columns to assign equipment</span>
        )}
        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setViewMode('board')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'board'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Columns className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            onClick={() => setViewMode('machines')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'machines'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Machine View
          </button>
        </div>
      </div>

      {/* Machine View */}
      {viewMode === 'machines' && (
        <MachineView cleaning={cleaning} onViewDetail={setViewingOrderId} />
      )}

      {/* Board */}
      {viewMode === 'board' && (
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
                  onDragStart={() => { setDraggingOrderId(order.id); setDraggingFromType('todo') }}
                  onDragEnd={() => { setDraggingOrderId(null); setDraggingFromType(null); setDragTarget(null) }}
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
              onDragStart={(id) => { setDraggingOrderId(id); setDraggingFromType(type) }}
              onDragEnd={() => { setDraggingOrderId(null); setDraggingFromType(null); setDragTarget(null) }}
              onAddAssignment={(order, t) => setAssignTarget({ order, type: t })}
              onMarkCleaned={handleMarkCleaned}
              onMoveNext={handleMoveNext}
              onMoveLoad={handleMoveLoad}
              onViewDetail={setViewingOrderId}
            />
          ))}

        </div>
      </div>
      )}

      {/* Assign modal (legacy assignments or first-time load creation) */}
      {assignTarget && (
        <MachinesAssignModal
          order={assignTarget.order}
          filterType={assignTarget.type}
          clearFromType={assignTarget.clearFromType}
          busyEquipment={busyForModal}
          mode={assignTarget.mode}
          onClose={() => setAssignTarget(null)}
          onSaved={() => setAssignTarget(null)}
        />
      )}

      {/* Move load modal (advance one load to next stage) */}
      {moveLoadTarget && (
        <MoveLoadModal
          load={moveLoadTarget}
          allEquipment={allEquipment as EquipItem[]}
          busyEquipment={busyEquipment}
          onClose={() => setMoveLoadTarget(null)}
          onSaved={() => setMoveLoadTarget(null)}
        />
      )}

      {/* Bag count modal */}
      {bagCountOrder && (
        <BagCountWorkflowModal
          onConfirm={(count) => doMarkCleaned(bagCountOrder, count)}
          onCancel={() => setBagCountOrder(null)}
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
              <button onClick={() => { setMarkCleanedOrder(null); setBagCountOrder(markCleanedOrder) }}
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
