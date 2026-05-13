'use client'

import { useState } from 'react'
import { WashingMachine, Wind, FoldVertical, Search, X, Zap } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useDebounce } from '@/hooks/useDebounce'

const EQUIP_ICON: Record<string, React.ElementType> = {
  washer: WashingMachine,
  dryer: Wind,
  folding: FoldVertical,
}

const WASHER_TIMES = [30, 35, 40, 45]
const DRYER_TIMES  = [15, 20, 30, 45, 60]
const TEMPS = ['Cold', 'Warm', 'Hot']

interface TapInfo {
  id: string
  equipment: { id: string; name: string; type: string } | null
  employeeName: string
  tapped_at: string
}

interface Props {
  tap: TapInfo
  onDismiss: () => void
}

export function TapDialog({ tap, onDismiss }: Props) {
  const utils = trpc.useUtils()
  const [search, setSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [temperature, setTemperature] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 250)

  const { data: orders = [] } = trpc.orders.list.useQuery(
    { limit: 50 },
    { staleTime: 30_000 }
  )

  const resolveTap = trpc.nayax.resolveTap.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate()
      toast.success(`${equipment?.name ?? 'Machine'} — order assigned`)
      onDismiss()
    },
    onError: (e) => toast.error(e.message),
  })

  const dismissTap = trpc.nayax.dismissTap.useMutation({
    onSuccess: onDismiss,
    onError: (e) => toast.error(e.message),
  })

  const equipment = tap.equipment
  const Icon = equipment ? (EQUIP_ICON[equipment.type] ?? WashingMachine) : Zap
  const times = equipment?.type === 'washer' ? WASHER_TIMES : equipment?.type === 'dryer' ? DRYER_TIMES : []
  const showTemp = equipment?.type === 'washer' || equipment?.type === 'dryer'

  // Filter orders: active (not picked up / cancelled), match search
  const activeOrders = (orders as unknown as {
    id: string; order_number: string; status: string
    customer: { first_name: string; last_name: string } | null
    customer_name: string | null
  }[]).filter((o) => !['picked_up', 'delivered', 'cancelled'].includes(o.status))

  const filtered = debouncedSearch
    ? activeOrders.filter((o) => {
        const name = o.customer
          ? `${o.customer.first_name} ${o.customer.last_name}`.toLowerCase()
          : (o.customer_name ?? '').toLowerCase()
        return (
          o.order_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          name.includes(debouncedSearch.toLowerCase())
        )
      })
    : activeOrders.slice(0, 20)

  const selectedOrder = activeOrders.find((o) => o.id === selectedOrderId)

  const handleConfirm = () => {
    if (!selectedOrderId) { toast.error('Select an order first'); return }
    resolveTap.mutate({
      tap_id: tap.id,
      order_id: selectedOrderId,
      duration_minutes: duration,
      temperature,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            equipment?.type === 'washer' ? 'bg-blue-100' :
            equipment?.type === 'dryer'  ? 'bg-orange-100' :
            equipment?.type === 'folding'? 'bg-purple-100' : 'bg-gray-100'
          )}>
            <Icon className={cn('h-5 w-5',
              equipment?.type === 'washer' ? 'text-blue-600' :
              equipment?.type === 'dryer'  ? 'text-orange-600' :
              equipment?.type === 'folding'? 'text-purple-600' : 'text-gray-600'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">
              {equipment?.name ?? 'Unknown machine'} just started
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {tap.employeeName} · {new Date(tap.tapped_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={() => dismissTap.mutate({ tap_id: tap.id })}
            className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Order search */}
          <div className="px-5 pt-4 pb-2 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Select order</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order # or customer name…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Order list */}
          <div className="px-5 pb-2 space-y-1.5">
            {filtered.map((order) => {
              const name = order.customer
                ? `${order.customer.first_name} ${order.customer.last_name}`
                : order.customer_name ?? 'Walk-in'
              const selected = selectedOrderId === order.id
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(selected ? null : order.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                    selected
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', selected ? 'text-brand-700' : 'text-gray-900')}>
                      {name}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{order.order_number}</p>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5',
                    order.status === 'cleaning' ? 'bg-amber-100 text-amber-700' :
                    order.status === 'ready'    ? 'bg-green-100 text-green-700' :
                                                  'bg-gray-100 text-gray-500'
                  )}>
                    {order.status}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">No orders found</p>
            )}
          </div>

          {/* Duration + temp — only for washer/dryer */}
          {selectedOrder && times.length > 0 && (
            <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-4 mt-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Time (min)</p>
                <div className="flex gap-2 flex-wrap">
                  {times.map((t) => (
                    <button key={t}
                      onClick={() => setDuration(duration === t ? null : t)}
                      className={cn('rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
                        duration === t
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      )}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {showTemp && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Temperature</p>
                  <div className="flex gap-2">
                    {TEMPS.map((temp) => (
                      <button key={temp}
                        onClick={() => setTemperature(temperature === temp ? null : temp)}
                        className={cn('flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors',
                          temperature === temp
                            ? 'border-brand-500 bg-brand-600 text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        )}>
                        {temp}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4 shrink-0">
          <button
            onClick={() => dismissTap.mutate({ tap_id: tap.id })}
            disabled={dismissTap.isPending}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            Dismiss
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOrderId || resolveTap.isPending}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {resolveTap.isPending ? 'Saving…' : 'Assign Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
