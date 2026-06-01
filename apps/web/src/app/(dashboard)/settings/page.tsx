'use client'

import { useState, useEffect } from 'react'
import { RequirePermission } from '@/components/layout/RequirePermission'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import type { ItemCategory } from '@laundry/db'
import toast from 'react-hot-toast'
import { StoreTab } from './StoreTab'
import { PreferencesTab } from './PreferencesTab'
import { MachinesTab } from './MachinesTab'
import { FoldingPackingTab } from './FoldingPackingTab'
import { IntegrationsTab } from './IntegrationsTab'
import { ZonesTab } from './ZonesTab'
import { StaffTab } from './StaffTab'
import { BusinessAccountsTab } from './BusinessAccountsTab'
import { HardwareTab } from './HardwareTab'
import { PromoCodesTab } from './PromoCodesTab'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNIT_SUGGESTIONS = ['lb', 'item', 'bag', 'bottle', 'pack']

const GIFT_CARD_DEFAULTS = [
  { name: 'Digital Gift Card',  description: 'Sent by email' },
  { name: 'Physical Gift Card', description: 'Printed card' },
]

// ─── Service item modal ───────────────────────────────────────────────────────

const PREF_GROUP_LABELS: Record<string, string> = {
  bleach:           'Bleach',
  dryer_sheets:     'Dryer Sheets',
  detergent_type:   'Detergent Type',
  fabric_softener:  'Fabric Softener',
  wash_temperature: 'Wash Temperature',
}

// Categories that support preference groups (not upcharges or gift cards)
const PREF_ELIGIBLE: ItemCategory[] = ['wash_fold', 'dry_clean', 'press_only', 'alterations', 'other']

interface ServiceFormData {
  id?: string
  name: string
  category: ItemCategory
  unit_price_dollars: string
  unit_label: string
  preference_groups: string[]
  express_price_dollars: string  // empty string = no express pricing
}

interface ServiceModalProps {
  initial?: ServiceFormData
  category: ItemCategory
  onClose: () => void
  onSave: (data: ServiceFormData) => void
  isSaving: boolean
}

function ServiceModal({ initial, category, onClose, onSave, isSaving }: ServiceModalProps) {
  const [form, setForm] = useState<ServiceFormData>(
    initial ?? { name: '', category, unit_price_dollars: '', unit_label: 'item', preference_groups: [], express_price_dollars: '' }
  )
  const set = (k: keyof ServiceFormData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const showExpress = category === 'wash_fold'
  const hasExpressPrice = form.express_price_dollars.trim() !== ''

  const togglePrefGroup = (key: string) => {
    setForm((f) => ({
      ...f,
      preference_groups: f.preference_groups.includes(key)
        ? f.preference_groups.filter((g) => g !== key)
        : [...f.preference_groups, key],
    }))
  }

  const showPrefGroups = PREF_ELIGIBLE.includes(category)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{initial?.id ? 'Edit service' : 'Add service'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); const p = parseFloat(form.unit_price_dollars); if (isNaN(p) || p < 0) { toast.error('Enter a valid price'); return } onSave(form) }}
          className="space-y-4 p-6"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus
              placeholder={category === 'wash_fold' ? 'e.g. Wash & Fold Standard' : 'e.g. Laundry Detergent'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base price ($)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0"
                value={form.unit_price_dollars} onChange={(e) => set('unit_price_dollars', e.target.value)}
                placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per unit</label>
              <Input value={form.unit_label} onChange={(e) => set('unit_label', e.target.value)}
                placeholder="lb" list="unit-suggestions" />
              <datalist id="unit-suggestions">
                {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          {showExpress && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">Express Price ($)</label>
                <span className="text-xs text-gray-400">Same-day turnaround — leave blank to disable</span>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.express_price_dollars}
                onChange={(e) => set('express_price_dollars', e.target.value)}
                placeholder={`e.g. ${form.unit_price_dollars ? (parseFloat(form.unit_price_dollars) * 1.5).toFixed(2) : '3.00'}`}
              />
            </div>
          )}

          {showPrefGroups && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Order Preferences</label>
              <p className="text-xs text-gray-400 mb-2">Staff will be prompted to select these before entering weights.</p>
              <div className="space-y-1.5">
                {Object.entries(PREF_GROUP_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.preference_groups.includes(key)}
                      onChange={() => togglePrefGroup(key)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isSaving} className="flex-1">{isSaving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Price override row (non-default price list) ──────────────────────────────

function PriceRow({ item, priceOverrides, onPriceChange, isSaving }: {
  item: { id: string; name: string; unit_price: number; unit_label: string; is_active: boolean }
  priceOverrides: Record<string, number>
  onPriceChange: (itemId: string, dollars: string) => void
  isSaving: boolean
}) {
  const [localValue, setLocalValue] = useState<string | undefined>(undefined)
  const override = priceOverrides[item.id]
  const displayVal = localValue ?? ((override ?? item.unit_price) / 100).toFixed(2)
  const hasOverride = override !== undefined

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</p>
        <p className="text-xs text-gray-400">
          Default: {formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-400">$</span>
        <input
          type="number" inputMode="decimal" step="0.01" min="0"
          className={`w-24 rounded-md border px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500 ${hasOverride ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-gray-300'}`}
          value={displayVal}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={(e) => { onPriceChange(item.id, e.target.value); setLocalValue(undefined) }}
          disabled={isSaving}
        />
        <span className="text-xs text-gray-400 w-8">{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}</span>
        {isSaving ? <span className="text-xs text-gray-400">…</span> : hasOverride ? <Check className="h-3.5 w-3.5 text-brand-500 shrink-0" /> : <span className="w-3.5" />}
      </div>
    </div>
  )
}

// ─── Gift cards section ───────────────────────────────────────────────────────

function GiftCardsSection() {
  const utils = trpc.useUtils()
  const { data: allItems = [] } = trpc.catalog.list.useQuery({ includeInactive: true })
  const updateItem = trpc.catalog.update.useMutation({
    onSuccess: () => { utils.catalog.list.invalidate(); toast.success('Updated') },
    onError: (e) => toast.error(e.message),
  })

  const giftCards = allItems.filter((i) => i.category === 'gift_card')

  const ensureGiftCards = trpc.catalog.ensureGiftCards.useMutation({
    onSuccess: () => utils.catalog.list.invalidate(),
  })
  useEffect(() => { ensureGiftCards.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Gift Cards</h3>
        <p className="text-xs text-gray-400">Denomination entered at checkout</p>
      </div>
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {GIFT_CARD_DEFAULTS.map((gc) => {
          const item = giftCards.find((i) => i.name === gc.name)
          return (
            <div key={gc.name} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className={`text-sm font-medium ${!item || item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{gc.name}</p>
                <p className="text-xs text-gray-400">{gc.description}</p>
              </div>
              {item ? (
                <button
                  onClick={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}
                  className={`transition-colors ${item.is_active ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}
                >
                  {item.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              ) : (
                <span className="text-xs text-gray-300">Loading…</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Sortable service item row ────────────────────────────────────────────────

function SortableServiceRow({
  item,
  deleteConfirm,
  onToggle,
  onEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  item: { id: string; name: string; unit_price: number; unit_label: string; is_active: boolean; category: string; express_price?: number | null }
  deleteConfirm: string | null
  onToggle: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 last:border-0">
      <button type="button" {...attributes} {...listeners}
        className="touch-none text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{item.name}</p>
        <p className="text-xs text-gray-500">
          {formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? ` / ${item.unit_label}` : ''}
          {item.express_price ? <span className="ml-2 text-amber-600">· Express {formatCurrency(item.express_price)}/{item.unit_label !== 'item' ? item.unit_label : 'item'}</span> : null}
        </p>
      </div>
      <button onClick={onToggle} className={`transition-colors ${item.is_active ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}>
        {item.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
      </button>
      <button onClick={onEdit} className="text-gray-400 hover:text-gray-600">
        <Pencil className="h-4 w-4" />
      </button>
      {deleteConfirm === item.id ? (
        <div className="flex items-center gap-1">
          <button onClick={onDeleteConfirm} className="text-red-500"><Check className="h-4 w-4" /></button>
          <button onClick={onDeleteCancel} className="text-gray-400"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button onClick={onDeleteRequest} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  )
}

// ─── Generic service section ──────────────────────────────────────────────────

function ServiceSection({ category, label, description, isDefaultList, priceOverrides, onPriceChange, savingItemId }: {
  category: ItemCategory; label: string; description: string
  isDefaultList: boolean
  priceOverrides: Record<string, number>
  onPriceChange: (itemId: string, dollars: string) => void
  savingItemId: string | null
}) {
  const utils = trpc.useUtils()
  const [modal, setModal] = useState<ServiceFormData | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [orderedIds, setOrderedIds] = useState<string[]>([])

  const { data: allItems = [] } = trpc.catalog.list.useQuery({ includeInactive: true })
  const items = allItems.filter((i) => i.category === category)

  // Sync orderedIds when items load or change from server
  useEffect(() => {
    setOrderedIds(items.map((i) => i.id))
  }, [items.map((i) => i.id).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const orderedItems = orderedIds
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as typeof items

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const createItem = trpc.catalog.create.useMutation({
    onSuccess: () => { utils.catalog.list.invalidate(); setModal(null); toast.success('Added') },
    onError: (e) => toast.error(e.message),
  })
  const updateItem = trpc.catalog.update.useMutation({
    onSuccess: () => { utils.catalog.list.invalidate(); setModal(null) },
    onError: (e) => toast.error(e.message),
  })
  const deleteItem = trpc.catalog.delete.useMutation({
    onSuccess: () => { utils.catalog.list.invalidate(); setDeleteConfirm(null); toast.success('Removed') },
    onError: (e) => toast.error(e.message),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedIds.indexOf(active.id as string)
    const newIndex = orderedIds.indexOf(over.id as string)
    const newOrder = arrayMove(orderedIds, oldIndex, newIndex)
    setOrderedIds(newOrder)
    newOrder.forEach((id, index) => updateItem.mutate({ id, sort_order: index }))
  }

  const handleSave = (data: ServiceFormData) => {
    const unit_price = Math.round(parseFloat(data.unit_price_dollars) * 100)
    const express_price = data.express_price_dollars.trim()
      ? Math.round(parseFloat(data.express_price_dollars) * 100)
      : null
    if (data.id) {
      updateItem.mutate({ id: data.id, name: data.name, unit_price, unit_label: data.unit_label, preference_groups: data.preference_groups, express_price })
    } else {
      createItem.mutate({ name: data.name, category, unit_price, unit_label: data.unit_label, sort_order: items.length, preference_groups: data.preference_groups, express_price })
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        {isDefaultList && (
          <button onClick={() => setModal({ name: '', category, unit_price_dollars: '', unit_label: 'item', preference_groups: [], express_price_dollars: '' })}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {orderedItems.length === 0 ? (
        isDefaultList ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
            No {label.toLowerCase()} yet.{' '}
            <button onClick={() => setModal({ name: '', category, unit_price_dollars: '', unit_label: 'item', preference_groups: [], express_price_dollars: '' })} className="text-brand-600 hover:underline">Add one</button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">No {label.toLowerCase()} items.</div>
        )
      ) : isDefaultList ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              {orderedItems.map((item) => (
                <SortableServiceRow
                  key={item.id}
                  item={item}
                  deleteConfirm={deleteConfirm}
                  onToggle={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}
                  onEdit={() => setModal({ id: item.id, name: item.name, category: item.category as ItemCategory, unit_price_dollars: (item.unit_price / 100).toFixed(2), unit_label: item.unit_label, preference_groups: (item.preference_groups as string[] | null) ?? [], express_price_dollars: item.express_price ? (item.express_price / 100).toFixed(2) : '' })}
                  onDeleteRequest={() => setDeleteConfirm(item.id)}
                  onDeleteConfirm={() => deleteItem.mutate({ id: item.id })}
                  onDeleteCancel={() => setDeleteConfirm(null)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {orderedItems.map((item) => (
            <PriceRow
              key={item.id}
              item={item}
              priceOverrides={priceOverrides}
              onPriceChange={onPriceChange}
              isSaving={savingItemId === item.id}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <ServiceModal initial={modal.id ? modal : undefined} category={category} onClose={() => setModal(null)} onSave={handleSave} isSaving={createItem.isPending || updateItem.isPending} />
      )}
    </div>
  )
}

// ─── Services tab ─────────────────────────────────────────────────────────────

function ServicesTab() {
  const utils = trpc.useUtils()

  // ── Price list state ────────────────────────────────────────────────────────
  const { data: lists = [] } = trpc.priceLists.list.useQuery()
  const defaultList = lists.find((l) => l.is_default)
  const [selectedListId, setSelectedListId] = useState('')

  useEffect(() => {
    if (!selectedListId && defaultList) setSelectedListId(defaultList.id)
  }, [defaultList?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedList = lists.find((l) => l.id === selectedListId)
  const isDefaultList = selectedList?.is_default ?? true

  const { data: priceOverrides = {} } = trpc.priceLists.getPrices.useQuery(
    { priceListId: selectedListId },
    { enabled: !!selectedListId && !isDefaultList }
  )

  // ── Price list management ───────────────────────────────────────────────────
  const [addingList, setAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [renameListId, setRenameListId] = useState<string | null>(null)
  const [renameListName, setRenameListName] = useState('')
  const [deleteListConfirm, setDeleteListConfirm] = useState(false)

  const createList = trpc.priceLists.create.useMutation({
    onSuccess: (list) => {
      utils.priceLists.list.invalidate()
      setSelectedListId(list.id)
      setAddingList(false)
      setNewListName('')
      toast.success('Price list created')
    },
    onError: (e) => toast.error(e.message),
  })
  const renameList = trpc.priceLists.rename.useMutation({
    onSuccess: () => { utils.priceLists.list.invalidate(); setRenameListId(null) },
    onError: (e) => toast.error(e.message),
  })
  const deleteList = trpc.priceLists.delete.useMutation({
    onSuccess: () => {
      utils.priceLists.list.invalidate()
      setSelectedListId(defaultList?.id ?? '')
      setDeleteListConfirm(false)
      toast.success('Price list deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Price override saving ───────────────────────────────────────────────────
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const setPrice = trpc.priceLists.setPrice.useMutation({
    onSuccess: () => { utils.priceLists.getPrices.invalidate({ priceListId: selectedListId }); setSavingItemId(null) },
    onError: (e) => { toast.error(e.message); setSavingItemId(null) },
  })
  const handlePriceChange = (itemId: string, dollars: string) => {
    const cents = Math.round(parseFloat(dollars) * 100)
    if (isNaN(cents) || cents < 0) { toast.error('Invalid price'); return }
    setSavingItemId(itemId)
    setPrice.mutate({ priceListId: selectedListId, serviceItemId: itemId, unitPrice: cents })
  }

  const sectionProps = { isDefaultList, priceOverrides, onPriceChange: handlePriceChange, savingItemId }

  return (
    <div className="space-y-8">

      {/* Header + price list selector */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Services &amp; Products</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage what appears on the POS</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {renameListId ? (
            <form className="flex items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); renameList.mutate({ id: renameListId, name: renameListName }) }}>
              <Input value={renameListName} onChange={(e) => setRenameListName(e.target.value)} autoFocus className="h-8 text-sm w-32" />
              <button type="submit" className="text-brand-600"><Check className="h-4 w-4" /></button>
              <button type="button" onClick={() => setRenameListId(null)} className="text-gray-400"><X className="h-4 w-4" /></button>
            </form>
          ) : addingList ? (
            <form className="flex items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); if (newListName.trim()) createList.mutate({ name: newListName.trim() }) }}>
              <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name…" autoFocus className="h-8 text-sm w-36" />
              <button type="submit" className="text-brand-600"><Check className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setAddingList(false); setNewListName('') }} className="text-gray-400"><X className="h-4 w-4" /></button>
            </form>
          ) : (
            <>
              <select
                value={selectedListId}
                onChange={(e) => { setSelectedListId(e.target.value); setDeleteListConfirm(false) }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (default)' : ''}</option>
                ))}
              </select>

              {!isDefaultList && (
                <>
                  <button onClick={() => { setRenameListId(selectedListId); setRenameListName(selectedList?.name ?? '') }}
                    title="Rename list" className="text-gray-400 hover:text-gray-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {deleteListConfirm ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteList.mutate({ id: selectedListId })} className="text-red-500" title="Confirm delete"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteListConfirm(false)} className="text-gray-400"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteListConfirm(true)} className="text-gray-300 hover:text-red-500" title="Delete list">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}

              <button onClick={() => setAddingList(true)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Plus className="h-3.5 w-3.5" /> New list
              </button>
            </>
          )}
        </div>
      </div>

      {!isDefaultList && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Editing price overrides for <strong>{selectedList?.name}</strong>. Highlighted prices differ from the default. Leave a field unchanged to use the default price.
        </div>
      )}

      <ServiceSection category="wash_fold"   label="Wash & Fold"   description="Laundry priced by weight or bag" {...sectionProps} />
      <ServiceSection category="upcharge"    label="Upcharges"     description="Add-ons shown during bag entry (e.g. Stain Remover, Sanitize)" {...sectionProps} />
      <ServiceSection category="dry_clean"   label="Dry Cleaning"  description="Dry clean items priced per piece" {...sectionProps} />
      <ServiceSection category="press_only"  label="Press Only"    description="Pressing and steaming services" {...sectionProps} />
      <ServiceSection category="alterations" label="Alterations"   description="Tailoring and repair services" {...sectionProps} />
      <GiftCardsSection />
      <ServiceSection category="product"     label="Products"      description="Detergent, bags, accessories" {...sectionProps} />
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'services' | 'store' | 'preferences' | 'machines' | 'folding' | 'integrations' | 'delivery' | 'staff' | 'businesses' | 'hardware' | 'promos'

function SettingsContent() {
  const [tab, setTab] = useState<Tab>('services')
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit flex-wrap">
        {([
          ['services',    'Services'],
          ['store',       'Store'],
          ['preferences', 'Preferences'],
          ['machines',    'Machines'],
          ['folding',     'Folding/Packing'],
          ['delivery',    'Delivery'],
          ['integrations','Integrations'],
          ['staff',       'Staff'],
          ['businesses',  'Business Accounts'],
          ['hardware',    'Hardware'],
          ['promos',      'Promo Codes'],
        ] as [Tab, string][]).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'services'     && <ServicesTab />}
      {tab === 'store'        && <StoreTab />}
      {tab === 'preferences'  && <PreferencesTab />}
      {tab === 'machines'     && <MachinesTab />}
      {tab === 'folding'      && <FoldingPackingTab />}
      {tab === 'delivery'     && <ZonesTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'staff'        && <StaffTab />}
      {tab === 'businesses'   && <BusinessAccountsTab />}
      {tab === 'hardware'     && <HardwareTab />}
      {tab === 'promos'       && <PromoCodesTab />}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings">
      <SettingsContent />
    </RequirePermission>
  )
}
