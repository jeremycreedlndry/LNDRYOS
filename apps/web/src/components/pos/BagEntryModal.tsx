'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { cn, formatCurrency } from '@/lib/utils'
import type { ServiceItem, TenantSettings, OrderPreferenceOptions } from '@laundry/db'
import type { CartLine } from './OrderCart'
import toast from 'react-hot-toast'

const PREF_GROUP_LABELS: Record<string, string> = {
  bleach:           'Bleach',
  dryer_sheets:     'Dryer Sheets',
  detergent_type:   'Detergent Type',
  fabric_softener:  'Fabric Softener',
  wash_temperature: 'Wash Temperature',
}

// Default options shown when tenant hasn't customised them yet in Settings → Preferences
const PREF_DEFAULTS: Record<string, string[]> = {
  bleach:           ['Yes', 'No', 'Whites Only', 'Delicates Only'],
  dryer_sheets:     ['Yes', 'No', 'Fragrance Free'],
  detergent_type:   ['Store Default', 'HE', 'Sensitive', 'Fragrance Free', 'Pods'],
  fabric_softener:  ['Yes', 'No', 'Fragrance Free'],
  wash_temperature: ['Cold', 'Warm', 'Hot'],
}

interface Props {
  item: ServiceItem
  customerId?: string | null
  onSubmit: (lines: CartLine[], prefs: Record<string, string>) => void
  onCancel: () => void
}

export function BagEntryModal({ item, customerId, onSubmit, onCancel }: Props) {
  const prefGroups = (item.preference_groups as string[] | null) ?? []
  const hasPrefs = prefGroups.length > 0

  // step: 'prefs' (if needed) → 'weight'
  const [step, setStep] = useState<'prefs' | 'weight'>(hasPrefs ? 'prefs' : 'weight')

  // Selected preference values keyed by group
  const [selectedPrefs, setSelectedPrefs] = useState<Record<string, string>>({})

  const [mode, setMode] = useState<'per_bag' | 'split'>('per_bag')

  // Per-bag mode state
  const [bagNumber, setBagNumber] = useState(1)
  const [weight, setWeight] = useState('')
  const [selectedUpchargeIds, setSelectedUpchargeIds] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [wetWeight, setWetWeight] = useState(false)
  const [accumulatedLines, setAccumulatedLines] = useState<CartLine[]>([])

  // Split mode state
  const [splitTotal, setSplitTotal] = useState('')
  const [splitBags, setSplitBags] = useState('')

  const { data: allItems = [] } = trpc.catalog.list.useQuery()
  const upcharges = allItems.filter((i) => i.category === 'upcharge' && i.is_active)

  // Tenant preference options
  const { data: tenant } = trpc.tenants.getCurrent.useQuery(undefined, { enabled: hasPrefs })
  const prefOptions = (tenant?.settings as TenantSettings | null)?.order_preference_options as OrderPreferenceOptions | undefined

  // Pre-populate from customer's last order for this service
  const { data: lastOrderPrefs } = trpc.orders.lastPrefsForService.useQuery(
    { customerId: customerId!, serviceItemId: item.id },
    { enabled: hasPrefs && !!customerId }
  )

  // Parse the notes string back into {groupKey: value} once prefOptions is loaded
  useEffect(() => {
    if (!lastOrderPrefs?.notesString || !prefOptions || Object.keys(selectedPrefs).length > 0) return
    const parts = lastOrderPrefs.notesString.split(' · ')
    const result: Record<string, string> = {}
    for (const groupKey of prefGroups) {
      const opts = (prefOptions?.[groupKey as keyof OrderPreferenceOptions] as string[] | undefined) ?? []
      for (const part of parts) {
        if (opts.includes(part)) { result[groupKey] = part; break }
      }
    }
    if (Object.keys(result).length > 0) setSelectedPrefs(result)
  }, [lastOrderPrefs, prefOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleUpcharge = (id: string) =>
    setSelectedUpchargeIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── Per-bag helpers ───────────────────────────────────────────────────────

  const buildBagLines = (bagNum: number, w: number): CartLine[] => {
    const bagLabel = `· Bag ${bagNum}`
    const prefNote = prefGroups
      .filter((g) => selectedPrefs[g])
      .map((g) => selectedPrefs[g])
      .join(' · ')
    const bagNotes = [prefNote, wetWeight ? 'Wet weight' : '', notes.trim()].filter(Boolean).join(' · ') || undefined

    const lines: CartLine[] = [{
      key: `${item.id}-bag${bagNum}-${Date.now()}`,
      service_item_id: item.id,
      name: `${item.name} ${bagLabel}`,
      category: 'wash_fold',
      quantity: w,
      unit_price: item.unit_price,
      unit_label: 'lb',
      notes: bagNotes,
    }]

    for (const id of selectedUpchargeIds) {
      const u = upcharges.find((u) => u.id === id)
      if (!u) continue
      lines.push({
        key: `${id}-bag${bagNum}-${Date.now()}`,
        service_item_id: u.id,
        name: `${u.name} ${bagLabel}`,
        category: 'upcharge',
        quantity: 1,
        unit_price: u.unit_price,
        unit_label: 'item',
      })
    }
    return lines
  }

  const resetPerBag = () => { setWeight(''); setSelectedUpchargeIds(new Set()); setNotes(''); setWetWeight(false) }

  const handleNextBag = () => {
    const w = parseFloat(weight)
    if (!w || w <= 0) { toast.error('Enter a weight for this bag'); return }
    setAccumulatedLines((prev) => [...prev, ...buildBagLines(bagNumber, w)])
    setBagNumber((n) => n + 1)
    resetPerBag()
  }

  const handleSubmitPerBag = () => {
    const w = parseFloat(weight)
    const currentLines = w > 0 ? buildBagLines(bagNumber, w) : []
    const finalLines = [...accumulatedLines, ...currentLines]
    if (finalLines.length === 0) { toast.error('Enter a weight for at least one bag'); return }
    onSubmit(finalLines, selectedPrefs)
  }

  // ── Split helpers ─────────────────────────────────────────────────────────

  const splitTotalW = parseFloat(splitTotal)
  const splitBagCount = parseInt(splitBags)
  const splitPerBag = splitTotalW > 0 && splitBagCount > 0 ? splitTotalW / splitBagCount : null

  const handleSubmitSplit = () => {
    if (!splitPerBag || splitBagCount < 1) { toast.error('Enter total weight and number of bags'); return }
    const perBag = Math.round(splitPerBag * 10) / 10
    const lines: CartLine[] = []
    for (let i = 1; i <= splitBagCount; i++) {
      lines.push(...buildBagLines(i, perBag))
    }
    onSubmit(lines, selectedPrefs)
  }

  const bagsAdded = bagNumber - 1
  const totalWeightSoFar = accumulatedLines.filter((l) => l.category === 'wash_fold').reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {step === 'prefs' ? 'Order Preferences' : 'Enter Weight'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 'prefs'
                ? item.name
                : mode === 'per_bag'
                  ? bagsAdded === 0 ? 'Bag 1' : `Bag ${bagNumber} · ${bagsAdded} bag${bagsAdded > 1 ? 's' : ''} added · ${totalWeightSoFar.toFixed(1)} lbs total`
                  : item.name
              }
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Step 1: Order Preferences ── */}
        {step === 'prefs' && (
          <div className="p-6 space-y-5">
            {prefGroups.map((groupKey) => {
              const label = PREF_GROUP_LABELS[groupKey] ?? groupKey
              const opts = (prefOptions?.[groupKey as keyof OrderPreferenceOptions] as string[] | undefined)
                ?? PREF_DEFAULTS[groupKey]
                ?? []
              return (
                <div key={groupKey}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
                  <div className="flex flex-wrap gap-2">
                    {opts.map((opt) => (
                      <button key={opt} type="button"
                        onClick={() => setSelectedPrefs((p) => ({ ...p, [groupKey]: p[groupKey] === opt ? '' : opt }))}
                        className={cn('rounded-xl border-2 px-3 py-2 text-sm font-medium transition-colors',
                          selectedPrefs[groupKey] === opt
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        )}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
              <Button onClick={() => setStep('weight')} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 'weight' && (<>

        {/* Mode toggle */}
        <div className="flex border-b border-gray-100">
          {(['per_bag', 'split'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn('flex-1 py-2.5 text-xs font-semibold transition-colors',
                mode === m
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-gray-400 hover:text-gray-600')}>
              {m === 'per_bag' ? 'Per Bag' : 'Split Total'}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">

          {mode === 'per_bag' ? (
            <>
              {/* Weight input */}
              <div className="text-center">
                <Input type="number" inputMode="decimal" step="0.1" min="0"
                  value={weight} onChange={(e) => setWeight(e.target.value)}
                  placeholder="0.0" autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleNextBag()}
                  className="text-4xl h-16 text-center font-bold tracking-tight" />
                <p className="text-xs text-gray-400 mt-1.5">lbs · {formatCurrency(item.unit_price)}/lb</p>
              </div>

              {/* Upcharges */}
              {upcharges.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Upcharges</p>
                  <div className="flex flex-wrap gap-2">
                    {upcharges.map((u) => (
                      <button key={u.id} type="button" onClick={() => toggleUpcharge(u.id)}
                        className={cn('rounded-xl border-2 px-4 py-2.5 text-left transition-colors',
                          selectedUpchargeIds.has(u.id) ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300')}>
                        <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                        <p className="text-xs font-bold text-gray-500">{formatCurrency(u.unit_price)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes + Wet Weight */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" className="h-9" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={wetWeight} onChange={(e) => setWetWeight(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-gray-700 whitespace-nowrap">Wet Weight</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={resetPerBag} className="flex-1">Reset</Button>
                <Button variant="outline" onClick={handleNextBag} className="flex-1">Next Bag</Button>
                <Button onClick={handleSubmitPerBag} className="flex-1 bg-green-600 hover:bg-green-700 text-white">Submit</Button>
              </div>
            </>
          ) : (
            <>
              {/* Split inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Total Weight (lbs)</label>
                  <Input type="number" inputMode="decimal" step="0.1" min="0"
                    value={splitTotal} onChange={(e) => setSplitTotal(e.target.value)}
                    placeholder="0.0" autoFocus className="text-xl h-14 text-center font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Number of Bags</label>
                  <Input type="number" inputMode="numeric" step="1" min="1"
                    value={splitBags} onChange={(e) => setSplitBags(e.target.value)}
                    placeholder="0" className="text-xl h-14 text-center font-bold" />
                </div>
              </div>

              {/* Preview */}
              {splitPerBag !== null && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-brand-700">{splitPerBag.toFixed(1)} lbs</p>
                  <p className="text-xs text-brand-500 mt-0.5">per bag × {splitBagCount} bags = {splitTotalW.toFixed(1)} lbs · {formatCurrency(Math.round(splitTotalW * item.unit_price))}</p>
                </div>
              )}

              {/* Upcharges */}
              {upcharges.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Upcharges <span className="normal-case font-normal">(applied per bag)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {upcharges.map((u) => (
                      <button key={u.id} type="button" onClick={() => toggleUpcharge(u.id)}
                        className={cn('rounded-xl border-2 px-4 py-2.5 text-left transition-colors',
                          selectedUpchargeIds.has(u.id) ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300')}>
                        <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                        <p className="text-xs font-bold text-gray-500">{formatCurrency(u.unit_price)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => { setSplitTotal(''); setSplitBags('') }} className="flex-1">Reset</Button>
                <Button onClick={handleSubmitSplit} disabled={!splitPerBag} className="flex-1 bg-green-600 hover:bg-green-700 text-white">Submit</Button>
              </div>
            </>
          )}
        </div>
        </>)}
      </div>
    </div>
  )
}
