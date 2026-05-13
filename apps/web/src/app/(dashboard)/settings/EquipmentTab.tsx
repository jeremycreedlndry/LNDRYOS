'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, WashingMachine, Wind, FoldVertical, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import type { EquipmentType } from '@laundry/db'
import toast from 'react-hot-toast'

const SECTIONS: { type: EquipmentType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'washer',  label: 'Washing Machines', icon: WashingMachine, description: 'Track which washer each order is in' },
  { type: 'dryer',   label: 'Dryers',           icon: Wind,           description: 'Track which dryer each order is in' },
  { type: 'folding', label: 'Folding Stations',  icon: FoldVertical,   description: 'Track folding location per order' },
]

interface EquipmentRowProps {
  id: string
  name: string
  onSave: (name: string) => void
  onDelete: () => void
}

function EquipmentRow({ id, name, onSave, onDelete }: EquipmentRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false) }
            if (e.key === 'Escape') { setDraft(name); setEditing(false) }
          }}
        />
        <button onClick={() => { onSave(draft); setEditing(false) }} className="text-green-600 hover:text-green-700">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => { setDraft(name); setEditing(false) }} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
      <span className="text-sm font-medium text-gray-800">{name}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-gray-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

interface AddRowProps {
  onAdd: (name: string) => void
}

function AddRow({ onAdd }: AddRowProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
      >
        <Plus className="h-4 w-4" /> Add
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-sm"
        placeholder="e.g. Washer 1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setName(''); setOpen(false) }
        }}
      />
      <button onClick={submit} className="text-green-600 hover:text-green-700">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => { setName(''); setOpen(false) }} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function EquipmentSection({ type, label, icon: Icon, description }: typeof SECTIONS[0]) {
  const utils = trpc.useUtils()
  const { data: items = [] } = trpc.equipment.list.useQuery({ type })

  const create = trpc.equipment.create.useMutation({
    onSuccess: () => utils.equipment.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })
  const update = trpc.equipment.update.useMutation({
    onSuccess: () => utils.equipment.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.equipment.delete.useMutation({
    onSuccess: () => utils.equipment.list.invalidate(),
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-200">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <EquipmentRow
            key={item.id}
            id={item.id}
            name={item.name}
            onSave={(name) => update.mutate({ id: item.id, name })}
            onDelete={() => remove.mutate({ id: item.id })}
          />
        ))}
        <AddRow
          onAdd={(name) => create.mutate({ type, name, sort_order: items.length })}
        />
      </div>
    </div>
  )
}

export function EquipmentTab() {
  const utils = trpc.useUtils()
  const sync = trpc.equipment.syncFromNayax.useMutation({
    onSuccess: (result) => {
      utils.equipment.list.invalidate()
      toast.success(`Synced from Nayax — ${result.created} added, ${result.updated} updated`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Equipment</h2>
          <p className="text-sm text-gray-500 mt-0.5">Set up machines and stations to track where each order is being processed</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
          className="gap-1.5 text-xs shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Syncing…' : 'Sync from Nayax'}
        </Button>
      </div>
      {SECTIONS.map((s) => (
        <EquipmentSection key={s.type} {...s} />
      ))}
    </div>
  )
}
