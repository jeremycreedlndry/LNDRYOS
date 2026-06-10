'use client'

import { useState } from 'react'
import { Package, Plus, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ItemCard } from './ItemCard'
import { ItemModal } from './ItemModal'
import { CategoryModal } from './CategoryModal'
import { UseItemModal } from './UseItemModal'
import { RestockModal } from './RestockModal'

type Tab = 'stock' | 'manage'

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('stock')
  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>('all')
  const [editItem, setEditItem]         = useState<any | null>(null)
  const [editCategory, setEditCategory] = useState<any | null>(null)
  const [showNewItem, setShowNewItem]   = useState(false)
  const [showNewCat, setShowNewCat]     = useState(false)
  const [useItem, setUseItem]           = useState<any | null>(null)
  const [restockItem, setRestockItem]   = useState<any | null>(null)

  const utils = trpc.useUtils()

  const { data: categories = [] } = trpc.inventory.listCategories.useQuery()
  const { data: items = [], isLoading } = trpc.inventory.listItems.useQuery(undefined, {
    refetchInterval: 30_000,
  })

  const refresh = () => {
    utils.inventory.listItems.invalidate()
    utils.inventory.listCategories.invalidate()
  }

  const role = trpc.staff.myRole.useQuery()
  const isManager = role.data?.role === 'owner' || role.data?.role === 'manager'

  const lowCount = items.filter(i => i.current_stock <= i.low_stock_threshold).length

  const displayed = activeCategoryId === 'all'
    ? items
    : items.filter(i => i.category_id === activeCategoryId)

  // Group by category for stock view
  const grouped = categories
    .map(cat => ({
      cat,
      items: displayed.filter(i => i.category_id === cat.id),
    }))
    .filter(g => g.items.length > 0)

  const uncategorised = displayed.filter(i => !i.category_id)

  return (
    <div className="flex h-full flex-col">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-brand-600" />
          <h1 className="text-lg font-semibold text-gray-900">Inventory</h1>
          {lowCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {lowCount} low
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(['stock', 'manage'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize',
                  tab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {t === 'stock' ? 'Stock' : 'Manage'}
              </button>
            ))}
          </div>
          {isManager && tab === 'manage' && (
            <Button size="sm" onClick={() => setShowNewItem(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Category sidebar */}
        <div className="w-48 shrink-0 border-r border-gray-100 overflow-y-auto py-3 px-2 space-y-0.5">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={cn(
              'w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              activeCategoryId === 'all'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            All Items
            <span className="ml-1 text-xs text-gray-400">({items.length})</span>
          </button>

          {categories.map(cat => {
            const count = items.filter(i => i.category_id === cat.id).length
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2',
                  activeCategoryId === cat.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="truncate">{cat.name}</span>
                <span className="ml-auto text-xs text-gray-400">{count}</span>
              </button>
            )
          })}

          {isManager && tab === 'manage' && (
            <button
              onClick={() => setShowNewCat(true)}
              className="w-full text-left rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-brand-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 mt-2"
            >
              <Plus className="h-3.5 w-3.5" /> New category
            </button>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Package className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">No items yet</p>
              {isManager && (
                <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowNewItem(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add first item
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(({ cat, items: catItems }) => (
                <section key={cat.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{cat.name}</h2>
                    {isManager && tab === 'manage' && (
                      <button
                        onClick={() => setEditCategory(cat)}
                        className="text-xs text-gray-300 hover:text-gray-500 ml-1"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {catItems.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        tab={tab}
                        isManager={isManager}
                        onUse={() => setUseItem(item)}
                        onRestock={() => setRestockItem(item)}
                        onEdit={() => setEditItem(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {uncategorised.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Uncategorised</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {uncategorised.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        tab={tab}
                        isManager={isManager}
                        onUse={() => setUseItem(item)}
                        onRestock={() => setRestockItem(item)}
                        onEdit={() => setEditItem(item)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {(showNewItem || editItem) && (
        <ItemModal
          item={editItem}
          categories={categories}
          onClose={() => { setShowNewItem(false); setEditItem(null) }}
          onSuccess={() => { setShowNewItem(false); setEditItem(null); refresh() }}
        />
      )}
      {(showNewCat || editCategory) && (
        <CategoryModal
          category={editCategory}
          onClose={() => { setShowNewCat(false); setEditCategory(null) }}
          onSuccess={() => { setShowNewCat(false); setEditCategory(null); refresh() }}
        />
      )}
      {useItem && (
        <UseItemModal
          item={useItem}
          onClose={() => setUseItem(null)}
          onSuccess={() => { setUseItem(null); refresh() }}
        />
      )}
      {restockItem && (
        <RestockModal
          item={restockItem}
          onClose={() => setRestockItem(null)}
          onSuccess={() => { setRestockItem(null); refresh() }}
        />
      )}
    </div>
  )
}
