'use client'

import { useState, useEffect } from 'react'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNIT_SUGGESTIONS = ['lb', 'item', 'bag', 'bottle', 'pack']

const GIFT_CARD_DEFAULTS = [
  { name: 'Digital Gift Card',  description: 'Sent by email' },
  { name: 'Physical Gift Card', description: 'Printed card' },
]

// ─── Service item modal ───────────────────────────────────────────────────────

interface ServiceFormData {
  id?: string
  name: string
  category: ItemCategory
  unit_price_dollars: string
  unit_label: string
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
    initial ?? { name: '', category, unit_price_dollars: '', unit_label: 'item' }
  )
  const set = (k: keyof ServiceFormData, v: string) => setForm((f) => ({ ...f, [k]: v }))

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
              placeholder={category === 'wash_fold' ? 'e.g. Wash & Fold' : 'e.g. Laundry Detergent'} />
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
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isSaving} className="flex-1">{isSaving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Price list editor modal ──────────────────────────────────────────────────

interface PriceListEditorProps {
  priceListId: string
  priceListName: string
  isDefault: boolean
  onClose: () => void
}

function PriceListEditor({ priceListId, priceListName, isDefault, onClose }: PriceListEditorProps) {
  const utils = trpc.useUtils()
  const { data: items = [] } = trpc.catalog.list.useQuery({ includeInactive: true })
  const { data: priceMap = {} } = trpc.priceLists.getPrices.useQuery({ priceListId })
  const [localPrices, setLocalPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const setPrice = trpc.priceLists.setPrice.useMutation({
    onSuccess: () => { utils.priceLists.getPrices.invalidate(); utils.catalog.list.invalidate() },
    onError: (e) => toast.error(e.message),
  })

  const handleBlur = async (itemId: string, basePrice: number) => {
    const raw = localPrices[itemId]
    if (raw === undefined) return
    const cents = Math.round(parseFloat(raw) * 100)
    if (isNaN(cents) || cents < 0) { toast.error('Invalid price'); return }
    setSaving(itemId)
    await setPrice.mutateAsync({ priceListId, serviceItemId: itemId, unitPrice: cents })
    setSaving(null)
  }

  const displayPrice = (item: { id: string; unit_price: number }) => {
    if (localPrices[item.id] !== undefined) return localPrices[item.id]
    const override = priceMap[item.id]
    return ((override ?? item.unit_price) / 100).toFixed(2)
  }

  const categories: { value: ItemCategory; label: string }[] = [
    { value: 'wash_fold', label: 'Wash & Fold' },
    { value: 'gift_card', label: 'Gift Cards' },
    { value: 'product',   label: 'Products' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{priceListName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isDefault ? 'Base prices for all customers' : 'Overrides base prices for assigned customers'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {categories.map(({ value, label }) => {
            const catItems = items.filter((i) => i.category === value)
            if (catItems.length === 0) return null
            return (
              <div key={value}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{label}</h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {catItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {!isDefault && (
                          <p className="text-xs text-gray-400">
                            Base: {formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                          value={displayPrice(item)}
                          onChange={(e) => setLocalPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                          onBlur={() => handleBlur(item.id, item.unit_price)}
                          disabled={saving === item.id}
                        />
                        <span className="text-xs text-gray-400 w-8">
                          {item.unit_label !== 'item' ? `/${item.unit_label}` : ''}
                        </span>
                        {saving === item.id && <span className="text-xs text-gray-400">…</span>}
                        {!isDefault && priceMap[item.id] !== undefined && saving !== item.id && (
                          <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Price Lists section ──────────────────────────────────────────────────────

function PriceListsSection() {
  const utils = trpc.useUtils()
  const { data: lists = [] } = trpc.priceLists.list.useQuery()
  const [editing, setEditing] = useState<{ id: string; name: string; isDefault: boolean } | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const createList = trpc.priceLists.create.useMutation({
    onSuccess: () => { utils.priceLists.list.invalidate(); setAdding(false); setNewName('') },
    onError: (e) => toast.error(e.message),
  })
  const renameList = trpc.priceLists.rename.useMutation({
    onSuccess: () => { utils.priceLists.list.invalidate(); setRenameId(null) },
    onError: (e) => toast.error(e.message),
  })
  const deleteList = trpc.priceLists.delete.useMutation({
    onSuccess: () => { utils.priceLists.list.invalidate(); setDeleteConfirm(null) },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Price Lists</h3>
          <p className="text-xs text-gray-400">Assign customers to a list for custom pricing</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> New list
        </button>
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {lists.map((list) => (
          <div key={list.id} className="flex items-center gap-2 px-4 py-3">
            {renameId === list.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); renameList.mutate({ id: list.id, name: renameName }) }}
              >
                <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus className="h-7 text-sm" />
                <button type="submit" className="text-brand-600"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => setRenameId(null)} className="text-gray-400"><X className="h-4 w-4" /></button>
              </form>
            ) : (
              <>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{list.name}</span>
                  {list.is_default && <span className="ml-2 text-xs text-gray-400">default</span>}
                </div>

                <button
                  onClick={() => setEditing({ id: list.id, name: list.name, isDefault: list.is_default })}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Edit prices
                </button>

                {!list.is_default && (
                  <>
                    <button
                      onClick={() => { setRenameId(list.id); setRenameName(list.name) }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {deleteConfirm === list.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteList.mutate({ id: list.id })} className="text-red-500"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-400"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(list.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        ))}

        {adding && (
          <form
            className="flex items-center gap-2 px-4 py-3"
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createList.mutate({ name: newName.trim() }) }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="List name (e.g. Commercial)" autoFocus className="h-7 text-sm flex-1" />
            <button type="submit" className="text-brand-600"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => { setAdding(false); setNewName('') }} className="text-gray-400"><X className="h-4 w-4" /></button>
          </form>
        )}
      </div>

      {editing && (
        <PriceListEditor
          priceListId={editing.id}
          priceListName={editing.name}
          isDefault={editing.isDefault}
          onClose={() => setEditing(null)}
        />
      )}
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
  item: { id: string; name: string; unit_price: number; unit_label: string; is_active: boolean; category: string }
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
        <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? ` / ${item.unit_label}` : ''}</p>
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

function ServiceSection({ category, label, description }: { category: ItemCategory; label: string; description: string }) {
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
    if (data.id) {
      updateItem.mutate({ id: data.id, name: data.name, unit_price, unit_label: data.unit_label })
    } else {
      createItem.mutate({ name: data.name, category, unit_price, unit_label: data.unit_label, sort_order: items.length })
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <button onClick={() => setModal({ name: '', category, unit_price_dollars: '', unit_label: 'item' })}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {orderedItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
          No {label.toLowerCase()} yet.{' '}
          <button onClick={() => setModal({ name: '', category, unit_price_dollars: '', unit_label: 'item' })} className="text-brand-600 hover:underline">Add one</button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              {orderedItems.map((item) => (
                <SortableServiceRow
                  key={item.id}
                  item={item}
                  deleteConfirm={deleteConfirm}
                  onToggle={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}
                  onEdit={() => setModal({ id: item.id, name: item.name, category: item.category as ItemCategory, unit_price_dollars: (item.unit_price / 100).toFixed(2), unit_label: item.unit_label })}
                  onDeleteRequest={() => setDeleteConfirm(item.id)}
                  onDeleteConfirm={() => deleteItem.mutate({ id: item.id })}
                  onDeleteCancel={() => setDeleteConfirm(null)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Services &amp; Products</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage what appears on the POS</p>
      </div>
      <ServiceSection category="wash_fold"   label="Wash & Fold"   description="Laundry priced by weight or bag" />
      <ServiceSection category="upcharge"    label="Upcharges"     description="Add-ons shown during bag entry (e.g. Stain Remover, Sanitize)" />
      <ServiceSection category="dry_clean"   label="Dry Cleaning"  description="Dry clean items priced per piece" />
      <ServiceSection category="press_only"  label="Press Only"    description="Pressing and steaming services" />
      <ServiceSection category="alterations" label="Alterations"   description="Tailoring and repair services" />
      <GiftCardsSection />
      <ServiceSection category="product"     label="Products"      description="Detergent, bags, accessories" />
      <PriceListsSection />
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'services' | 'store' | 'preferences' | 'machines' | 'folding' | 'integrations' | 'delivery' | 'staff'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('services')
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit flex-wrap">
        {([['services', 'Services'], ['store', 'Store'], ['preferences', 'Preferences'], ['machines', 'Machines'], ['folding', 'Folding/Packing'], ['delivery', 'Delivery'], ['integrations', 'Integrations'], ['staff', 'Staff']] as [Tab, string][]).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'services'    && <ServicesTab />}
      {tab === 'store'       && <StoreTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'machines'    && <MachinesTab />}
      {tab === 'folding'     && <FoldingPackingTab />}
      {tab === 'delivery'    && <ZonesTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'staff'       && <StaffTab />}
    </div>
  )
}
