'use client'

import { Minus, Plus, Pencil, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  name: string
  unit: string
  current_stock: number
  low_stock_threshold: number
  notes?: string | null
  category?: { color: string } | null
}

interface Props {
  item: Item
  tab: 'stock' | 'manage'
  isManager: boolean
  onUse: () => void
  onRestock: () => void
  onEdit: () => void
}

export function ItemCard({ item, tab, isManager, onUse, onRestock, onEdit }: Props) {
  const isLow      = item.current_stock <= item.low_stock_threshold
  const isEmpty    = item.current_stock === 0
  const stockColor = isEmpty ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-600'
  const bgColor    = isEmpty ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'

  return (
    <div className={cn('relative rounded-xl border p-4 flex flex-col gap-3 transition-colors', bgColor)}>

      {/* Low stock badge */}
      {isLow && (
        <div className="absolute top-2 right-2">
          <AlertTriangle className={cn('h-3.5 w-3.5', isEmpty ? 'text-red-400' : 'text-amber-400')} />
        </div>
      )}

      {/* Name + stock */}
      <div>
        <p className="text-sm font-semibold text-gray-900 leading-tight pr-4">{item.name}</p>
        {item.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className={cn('text-2xl font-bold tabular-nums', stockColor)}>{item.current_stock}</p>
          <p className="text-xs text-gray-400">{item.unit}</p>
        </div>

        {/* Actions */}
        {tab === 'stock' ? (
          /* Staff view — big Use button */
          <button
            onClick={onUse}
            disabled={item.current_stock === 0}
            className={cn(
              'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              item.current_stock === 0
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-700'
            )}
          >
            <Minus className="h-3.5 w-3.5" /> Use
          </button>
        ) : (
          /* Manager view — restock + edit */
          <div className="flex items-center gap-1">
            <button
              onClick={onRestock}
              className="flex items-center gap-0.5 rounded-lg bg-green-50 border border-green-200 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
            >
              <Plus className="h-3 w-3" /> Stock
            </button>
            <button
              onClick={onEdit}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
