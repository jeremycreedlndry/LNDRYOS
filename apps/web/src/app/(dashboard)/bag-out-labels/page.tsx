'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Loader2, Plus, Tag, Printer, X, Package } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { printBagOutLabels, type LabelSize } from '@/lib/printJobs'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SearchOrder = Record<string, any>

function resolveCustomerName(order: SearchOrder): string {
  const c = order.customer as { first_name: string; last_name: string } | null
  if (c?.first_name || c?.last_name) return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
  return (order as { customer_name?: string | null }).customer_name ?? 'Walk-in'
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  cleaning:    'warning',
  ready:       'success',
  pending:     'secondary',
  in_progress: 'warning',
  picked_up:   'default',
  delivered:   'default',
  cancelled:   'destructive',
}

// ─── Order search sub-component ───────────────────────────────────────────────

function OrderSearch({ onSelect }: { onSelect: (order: SearchOrder) => void }) {
  const [query, setQuery]               = useState('')
  const [debouncedQuery, setDebounced]  = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(query), 350)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const { data: results = [], isFetching } = trpc.orders.search.useQuery(
    { query: debouncedQuery, limit: 20 },
    { enabled: debouncedQuery.trim().length >= 2 }
  )

  return (
    <div className="space-y-3">
      {/* search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer name or order #…"
          autoFocus
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>

      {/* results */}
      {results.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {results.map((order) => {
            const name    = resolveCustomerName(order)
            const summary = (order.lines as { name: string }[]).map((l) => l.name).join(', ')
            return (
              <button
                key={order.id}
                onClick={() => onSelect(order)}
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {order.order_number}
                    {order.due_date ? ` · Due ${order.due_date}` : ''}
                    {summary ? ` · ${summary}` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[order.status] ?? 'secondary'} className="ml-3 shrink-0 capitalize">
                  <Package className="h-3 w-3 mr-1" />
                  {order.status.replace('_', ' ')}
                </Badge>
              </button>
            )
          })}
        </div>
      )}

      {debouncedQuery.trim().length >= 2 && !isFetching && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-3">No orders found for "{debouncedQuery}"</p>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BagOutLabelsPage() {
  const [selectedOrder,   setSelectedOrder]   = useState<SearchOrder | null>(null)
  const [selectedPreset,  setSelectedPreset]  = useState('')
  const [bagCount,        setBagCount]        = useState(1)
  const [addingPreset,    setAddingPreset]    = useState(false)
  const [newPresetLabel,  setNewPresetLabel]  = useState('')
  const [printing,        setPrinting]        = useState(false)

  const { data: presets = [], refetch: refetchPresets } = trpc.linenPresets.list.useQuery()
  const { data: tenant }                                = trpc.tenants.getCurrent.useQuery(undefined, { staleTime: 60_000 })

  const addPreset = trpc.linenPresets.add.useMutation({
    onSuccess: (preset) => {
      refetchPresets()
      setSelectedPreset(preset.label)
      setNewPresetLabel('')
      setAddingPreset(false)
    },
  })

  const removePreset = trpc.linenPresets.remove.useMutation({
    onSuccess: () => refetchPresets(),
  })

  // Seed selectedPreset from first loaded preset
  useEffect(() => {
    if (presets.length > 0 && !selectedPreset) setSelectedPreset(presets[0].label)
  }, [presets, selectedPreset])

  const customerName = useMemo(
    () => (selectedOrder ? resolveCustomerName(selectedOrder) : ''),
    [selectedOrder]
  )

  const handleAddPreset = () => {
    const label = newPresetLabel.trim()
    if (!label) return
    addPreset.mutate({ label })
  }

  const handleRemovePreset = (id: string, label: string) => {
    if (selectedPreset === label) {
      const remaining = presets.filter((p) => p.id !== id)
      setSelectedPreset(remaining[0]?.label ?? '')
    }
    removePreset.mutate({ id })
  }

  const handlePrint = async () => {
    if (!selectedOrder) { toast.error('Select an order first'); return }
    if (!selectedPreset) { toast.error('Select a linen item'); return }

    const hw           = (tenant?.settings as Record<string, unknown> | null)?.hardware as Record<string, unknown> | undefined
    const printerName  = (hw?.label_printer as Record<string, string> | undefined)?.name
    const labelSize    = hw?.label_size as LabelSize | undefined

    if (!printerName) {
      toast.error('No label printer configured — set one up in Settings → Hardware')
      return
    }

    setPrinting(true)
    try {
      await printBagOutLabels(
        printerName,
        { order_number: selectedOrder.order_number, customer_name: customerName },
        bagCount,
        tenant?.name ?? undefined,
        labelSize,
      )
      toast.success(`Printed ${bagCount} label${bagCount === 1 ? '' : 's'} for ${customerName}`)
    } catch (err) {
      console.error('[bag-out print]', err)
      toast.error('Print failed — is QZ Tray running?')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5 text-gray-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bag Out Labels</h1>
            <p className="text-sm text-gray-500">Search an order, pick a linen item, and print.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-2xl w-full mx-auto space-y-5">

        {/* ── Step 1: Order ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1 · Order</h2>
            {selectedOrder && (
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" /> Change
              </button>
            )}
          </div>

          {!selectedOrder ? (
            <OrderSearch onSelect={setSelectedOrder} />
          ) : (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{customerName}</p>
              <p className="text-xs text-gray-500">
                {selectedOrder.order_number}
                {selectedOrder.due_date ? ` · Due ${selectedOrder.due_date}` : ''}
              </p>
            </div>
          )}
        </section>

        {/* ── Step 2: Linen item ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2 · Linen Item</h2>

          {presets.length === 0 && !addingPreset && (
            <p className="text-sm text-gray-400">No items yet — add one below.</p>
          )}

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedPreset(p.label)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      selectedPreset === p.label
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {p.label}
                  </button>
                  <button
                    onClick={() => handleRemovePreset(p.id, p.label)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingPreset ? (
            <div className="flex gap-2">
              <input
                autoFocus
                placeholder="e.g. King Sheet"
                value={newPresetLabel}
                onChange={(e) => setNewPresetLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPreset()
                  if (e.key === 'Escape') { setAddingPreset(false); setNewPresetLabel('') }
                }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={handleAddPreset}
                disabled={!newPresetLabel.trim() || addPreset.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {addPreset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </button>
              <button
                onClick={() => { setAddingPreset(false); setNewPresetLabel('') }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingPreset(true)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
          )}
        </section>

        {/* ── Step 3: Bag count + print ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">3 · Number of Bags</h2>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setBagCount((c) => Math.max(1, c - 1))}
              className="h-10 w-10 rounded-full border border-gray-200 text-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              −
            </button>
            <span className="w-14 text-center text-4xl font-bold text-gray-900">{bagCount}</span>
            <button
              onClick={() => setBagCount((c) => Math.min(50, c + 1))}
              className="h-10 w-10 rounded-full border border-gray-200 text-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              +
            </button>
            <div className="flex gap-1.5 ml-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setBagCount(n)}
                  className={cn(
                    'h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                    bagCount === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Preview pill */}
          {selectedOrder && selectedPreset && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Label preview</p>
              <p className="text-sm font-semibold text-gray-900">{customerName}</p>
              <p className="text-xs text-gray-600">
                {selectedOrder.order_number} · {selectedPreset} · {bagCount} bag{bagCount !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          <button
            onClick={handlePrint}
            disabled={!selectedOrder || !selectedPreset || printing}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {printing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Printing…</>
              : <><Printer className="h-4 w-4" /> Print {bagCount} Label{bagCount !== 1 ? 's' : ''}</>
            }
          </button>

          <p className="text-xs text-gray-400 text-center">
            Prints to the label printer configured in{' '}
            <a href="/settings" className="underline hover:text-gray-600">Settings → Hardware</a>.
          </p>
        </section>

      </div>
    </div>
  )
}
