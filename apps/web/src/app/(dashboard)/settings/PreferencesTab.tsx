'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { KeyboardSensor } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import type { TenantSettings, OrderPreferenceOptions } from '@laundry/db'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

type PrefKey = keyof OrderPreferenceOptions

const PREF_CATEGORIES: { key: PrefKey; label: string; defaults: string[] }[] = [
  { key: 'bleach',           label: 'Bleach',           defaults: ['Yes', 'No', 'Whites Only', 'Delicates Only'] },
  { key: 'dryer_sheets',     label: 'Dryer Sheets',     defaults: ['Yes', 'No', 'Fragrance Free'] },
  { key: 'detergent_type',   label: 'Detergent Type',   defaults: ['Store Default', 'HE', 'Sensitive', 'Fragrance Free', 'Pods'] },
  { key: 'fabric_softener',  label: 'Fabric Softener',  defaults: ['Yes', 'No', 'Fragrance Free'] },
  { key: 'wash_temperature', label: 'Wash Temperature', defaults: ['Cold', 'Warm', 'Hot'] },
]

// ─── Sortable item ────────────────────────────────────────────────────────────

function SortableOption({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 last:border-0"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="touch-none text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm text-gray-800">{id}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-300 hover:text-red-500 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Single preference category editor ────────────────────────────────────────

function PrefCategoryEditor({
  label,
  options,
  onChange,
}: {
  label: string
  options: string[]
  onChange: (options: string[]) => void
}) {
  const [newOption, setNewOption] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = options.indexOf(active.id as string)
      const newIndex = options.indexOf(over.id as string)
      onChange(arrayMove(options, oldIndex, newIndex))
    }
  }

  const remove = (opt: string) => onChange(options.filter((o) => o !== opt))

  const add = () => {
    const v = newOption.trim()
    if (!v || options.includes(v)) return
    onChange([...options, v])
    setNewOption('')
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={options} strategy={verticalListSortingStrategy}>
          {options.map((opt) => (
            <SortableOption key={opt} id={opt} onRemove={() => remove(opt)} />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add option…"
          className="h-7 text-sm flex-1"
        />
        <button
          type="button"
          onClick={add}
          className="text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Preferences tab ──────────────────────────────────────────────────────────

export function PreferencesTab() {
  const utils = trpc.useUtils()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const [ready, setReady] = useState(false)
  const [options, setOptions] = useState<Required<OrderPreferenceOptions>>({
    bleach:           [],
    dryer_sheets:     [],
    detergent_type:   [],
    fabric_softener:  [],
    wash_temperature: [],
    dryer:            [],
  })

  useEffect(() => {
    if (!tenant || ready) return
    const existing = (tenant.settings as TenantSettings)?.order_preference_options
    setOptions({
      bleach:           existing?.bleach           ?? PREF_CATEGORIES.find((c) => c.key === 'bleach')!.defaults,
      dryer_sheets:     existing?.dryer_sheets     ?? PREF_CATEGORIES.find((c) => c.key === 'dryer_sheets')!.defaults,
      detergent_type:   existing?.detergent_type   ?? PREF_CATEGORIES.find((c) => c.key === 'detergent_type')!.defaults,
      fabric_softener:  existing?.fabric_softener  ?? PREF_CATEGORIES.find((c) => c.key === 'fabric_softener')!.defaults,
      wash_temperature: existing?.wash_temperature ?? PREF_CATEGORIES.find((c) => c.key === 'wash_temperature')!.defaults,
      dryer:            existing?.dryer            ?? [],
    })
    setReady(true)
  }, [tenant, ready])

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => utils.tenants.getCurrent.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const initialized = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const setCategory = (key: PrefKey, values: string[]) =>
    setOptions((o) => ({ ...o, [key]: values }))

  // Auto-save with 600ms debounce — skip the very first population from server
  useEffect(() => {
    if (!initialized.current) { initialized.current = ready; return }
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      update.mutate(
        { settings: { order_preference_options: options } },
        { onSuccess: () => setSaveStatus('saved'), onError: () => setSaveStatus('idle') }
      )
    }, 600)
    return () => clearTimeout(timer)
  }, [options]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset 'saved' indicator after 2s
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Order Preferences</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Drag to reorder. Changes apply to all customer profiles.
          </p>
        </div>
        <span className={`text-xs font-medium transition-opacity duration-300 ${
          saveStatus === 'saving' ? 'text-gray-400 opacity-100' :
          saveStatus === 'saved'  ? 'text-green-600 opacity-100' : 'opacity-0'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
        </span>
      </div>

      {PREF_CATEGORIES.map(({ key, label }) => (
        <PrefCategoryEditor
          key={key}
          label={label}
          options={options[key]}
          onChange={(vals) => setCategory(key, vals)}
        />
      ))}
    </div>
  )
}
