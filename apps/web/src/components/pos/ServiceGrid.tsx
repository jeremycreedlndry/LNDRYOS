'use client'

import { Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import type { ServiceItem, ItemCategory } from '@laundry/db'

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  wash_fold:   'Wash & Fold',
  dry_clean:   'Dry Clean',
  press_only:  'Press Only',
  alterations: 'Alterations',
  gift_card:   'Gift Card',
  product:     'Product',
  upcharge:    'Upcharge',
  other:       'Other',
}

const CATEGORY_COLORS: Record<ItemCategory, string> = {
  wash_fold:   'bg-blue-50 border-blue-200 hover:bg-blue-100',
  dry_clean:   'bg-purple-50 border-purple-200 hover:bg-purple-100',
  press_only:  'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
  alterations: 'bg-green-50 border-green-200 hover:bg-green-100',
  gift_card:   'bg-pink-50 border-pink-200 hover:bg-pink-100',
  product:     'bg-orange-50 border-orange-200 hover:bg-orange-100',
  upcharge:    'bg-gray-50 border-gray-200 hover:bg-gray-100',
  other:       'bg-gray-50 border-gray-200 hover:bg-gray-100',
}

interface Props {
  onAddItem: (item: ServiceItem) => void
  activeCategory: ItemCategory
  onCategoryChange: (cat: ItemCategory) => void
  priceListId?: string | null
}

export function ServiceGrid({ onAddItem, activeCategory, onCategoryChange, priceListId }: Props) {
  const { data: items = [] } = trpc.catalog.list.useQuery(
    priceListId ? { priceListId } : undefined
  )

  const CATEGORY_ORDER: ItemCategory[] = ['wash_fold', 'gift_card', 'product', 'dry_clean', 'press_only', 'alterations', 'other']

  const visibleItems = items.filter((i) => i.category !== 'upcharge')
  const filtered = visibleItems.filter((i) => i.category === activeCategory)

  const presentCategories = new Set(visibleItems.map((i) => i.category))
  const categories = CATEGORY_ORDER.filter((c) => presentCategories.has(c))

  return (
    <div className="flex flex-col gap-3">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activeCategory === cat
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => onAddItem(item as ServiceItem)}
            className={cn(
              'relative flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
              CATEGORY_COLORS[item.category as ItemCategory]
            )}
          >
            <Plus className="absolute right-2 top-2 h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {CATEGORY_LABELS[item.category as ItemCategory]}
            </span>
            <span className="mt-1 text-sm font-semibold text-gray-900 leading-tight">
              {item.name}
            </span>
            <span className="mt-1 text-sm font-bold text-gray-700">
              {formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
