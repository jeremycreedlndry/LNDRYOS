'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Loader2, Plus, X, CheckCircle2, RotateCcw,
  Upload, Image as ImageIcon, Share2, Copy, Archive, Droplets,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SearchOrder = Record<string, any>

type StainReport = {
  id: string
  order_id: string | null
  order_number: string | null
  customer_name: string
  due_date: string | null
  linen_item: string
  photo_url: string
  add_stain_remover: boolean
  notes: string | null
  status: string
  created_by_name: string | null
  created_at: string
}

type ShareRow = {
  id: string
  token: string
  order_number: string | null
  customer_name: string
  due_date: string | null
  items: { linen_item: string; photo_url: string; add_stain_remover: boolean; notes?: string | null }[]
  status: string
  created_at: string
}

// ─── Order search ─────────────────────────────────────────────────────────────

function OrderSearch({ onSelect }: { onSelect: (o: SearchOrder) => void }) {
  const [query,    setQuery]    = useState('')
  const [debounced, setDebounced] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(query), 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query])

  const { data: results = [], isFetching } = trpc.orders.search.useQuery(
    { query: debounced, limit: 20 },
    { enabled: debounced.trim().length >= 2 }
  )

  const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
    cleaning: 'warning', ready: 'success', pending: 'secondary',
    in_progress: 'warning', picked_up: 'default', delivered: 'default', cancelled: 'destructive',
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer name or order #…"
          autoFocus
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {results.map((o) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = o as any
            const c = row.customer as { first_name: string; last_name: string } | null
            const name = c ? `${c.first_name} ${c.last_name}`.trim() : (row.customer_name ?? 'Walk-in')
            return (
              <button key={o.id} onClick={() => onSelect(o)}
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {o.order_number}{o.due_date ? ` · Due ${o.due_date}` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[o.status] ?? 'secondary'} className="ml-3 shrink-0 capitalize">
                  {o.status.replace('_', ' ')}
                </Badge>
              </button>
            )
          })}
        </div>
      )}
      {debounced.trim().length >= 2 && !isFetching && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-3">No orders found for "{debounced}"</p>
      )}
    </div>
  )
}

// ─── Report card ──────────────────────────────────────────────────────────────

function ReportCard({ r, onToggleStatus }: { r: StainReport; onToggleStatus: (id: string, next: 'active' | 'resolved') => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-4">
      <a href={r.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
        <img src={r.photo_url} alt={r.linen_item}
          className="h-24 w-24 rounded-lg object-cover border border-gray-200" />
      </a>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 truncate">{r.customer_name}</p>
          <Badge variant={r.status === 'active' ? 'warning' : 'secondary'} className="capitalize">{r.status}</Badge>
          {r.add_stain_remover && <Badge variant="outline">Stain Remover</Badge>}
        </div>
        <p className="text-sm text-gray-700">{r.linen_item}</p>
        <p className="text-xs text-gray-500 truncate">
          {r.order_number ? `Order ${r.order_number}` : ''}
          {r.due_date ? ` · Due ${r.due_date}` : ''}
        </p>
        {r.notes && <p className="text-xs text-gray-400 truncate">📝 {r.notes}</p>}
        <p className="text-[10px] text-gray-400">
          {new Date(r.created_at).toLocaleString()}{r.created_by_name ? ` · ${r.created_by_name}` : ''}
        </p>
      </div>
      <div className="shrink-0">
        {r.status === 'active' ? (
          <button onClick={() => onToggleStatus(r.id, 'resolved')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
          </button>
        ) : (
          <button onClick={() => onToggleStatus(r.id, 'active')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = ['new', 'active', 'history', 'build', 'shares'] as const
type Tab = typeof TABS[number]

function resolveOrderName(o: SearchOrder): string {
  const c = o.customer as { first_name: string; last_name: string } | null
  return c ? `${c.first_name} ${c.last_name}`.trim() : (o.customer_name ?? 'Walk-in')
}

export default function StainTrackerPage() {
  const [tab, setTab] = useState<Tab>('new')

  // ── New report form ──
  const [newOrder,         setNewOrder]         = useState<SearchOrder | null>(null)
  const [selectedPreset,   setSelectedPreset]   = useState('')
  const [addingPreset,     setAddingPreset]      = useState(false)
  const [newPresetLabel,   setNewPresetLabel]    = useState('')
  const [photoFile,        setPhotoFile]         = useState<File | null>(null)
  const [photoPreview,     setPhotoPreview]      = useState('')
  const [addStainRemover,  setAddStainRemover]   = useState(false)
  const [notes,            setNotes]             = useState('')
  const [submitting,       setSubmitting]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Build report / share ──
  const [buildOrder,   setBuildOrder]   = useState<SearchOrder | null>(null)
  const [pickedIds,    setPickedIds]    = useState<Set<string>>(new Set())
  const [lastShareUrl, setLastShareUrl] = useState('')
  const [creatingShare, setCreatingShare] = useState(false)

  // ── Data ──
  const { data: reports = [],   refetch: refetchReports } = trpc.stainTracker.listReports.useQuery()
  const { data: shares  = [],   refetch: refetchShares  } = trpc.stainTracker.listShares.useQuery()
  const { data: presets = [],   refetch: refetchPresets } = trpc.linenPresets.list.useQuery()

  const addPreset    = trpc.linenPresets.add.useMutation({ onSuccess: () => refetchPresets() })
  const removePreset = trpc.linenPresets.remove.useMutation({ onSuccess: () => refetchPresets() })
  const setStatus    = trpc.stainTracker.setReportStatus.useMutation({ onSuccess: () => refetchReports() })
  const setShareStatus = trpc.stainTracker.setShareStatus.useMutation({ onSuccess: () => refetchShares() })
  const createShare  = trpc.stainTracker.createShare.useMutation()
  const createReport = trpc.stainTracker.createReport.useMutation()

  // Seed preset selection
  useEffect(() => {
    if (presets.length > 0 && !selectedPreset) setSelectedPreset(presets[0].label)
  }, [presets, selectedPreset])

  const activeReports  = useMemo(() => (reports as StainReport[]).filter((r) => r.status === 'active'),  [reports])
  const historyReports = useMemo(() => (reports as StainReport[]).filter((r) => r.status !== 'active'), [reports])

  const buildOrderReports = useMemo(() =>
    buildOrder
      ? (reports as StainReport[]).filter((r) => r.order_id === buildOrder.id && r.status === 'active')
      : [],
    [reports, buildOrder]
  )

  // ── Handlers ──

  const handleFile = (f: File | null) => {
    setPhotoFile(f)
    if (!f) { setPhotoPreview(''); return }
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(String(reader.result || ''))
    reader.readAsDataURL(f)
  }

  const resetForm = (keepOrder = false) => {
    if (!keepOrder) setNewOrder(null)
    setPhotoFile(null); setPhotoPreview('')
    setAddStainRemover(false); setNotes('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!newOrder)       { toast.error('Pick an order first'); return }
    if (!selectedPreset) { toast.error('Choose a linen item'); return }
    if (!photoFile)      { toast.error('Upload a photo'); return }

    setSubmitting(true)
    try {
      // 1. Upload photo
      const fd = new FormData()
      fd.append('file', photoFile)
      const res = await fetch('/api/upload/stain-photo', { method: 'POST', body: fd })
      const { photo_url, error: upErr } = await res.json()
      if (upErr || !photo_url) throw new Error(upErr ?? 'Upload failed')

      // 2. Save report
      const c = newOrder.customer as { first_name: string; last_name: string } | null
      const customerName = c ? `${c.first_name} ${c.last_name}`.trim() : (newOrder.customer_name ?? 'Walk-in')
      const summary = (newOrder.lines as { name: string }[] | null)?.map((l) => l.name).join(', ')

      await createReport.mutateAsync({
        order_id:          newOrder.id,
        order_number:      newOrder.order_number,
        customer_name:     customerName,
        order_summary:     summary ?? null,
        due_date:          newOrder.due_date ?? null,
        linen_item:        selectedPreset,
        photo_url,
        add_stain_remover: addStainRemover,
        notes:             notes.trim() || null,
      })

      toast.success('Stain report saved — order kept for another entry')
      resetForm(true)
      refetchReports()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddPreset = () => {
    const label = newPresetLabel.trim()
    if (!label) return
    addPreset.mutate({ label }, {
      onSuccess: (p) => { setSelectedPreset(p.label); setNewPresetLabel(''); setAddingPreset(false) }
    })
  }

  const handleRemovePreset = (id: string, label: string) => {
    if (selectedPreset === label) {
      const remaining = presets.filter((p) => p.id !== id)
      setSelectedPreset(remaining[0]?.label ?? '')
    }
    removePreset.mutate({ id })
  }

  const handleToggleStatus = (id: string, next: 'active' | 'resolved') => {
    setStatus.mutate({ id, status: next })
  }

  const handleCreateShare = async () => {
    if (!buildOrder)         { toast.error('Pick an order'); return }
    const picked = buildOrderReports.filter((r) => pickedIds.has(r.id))
    if (!picked.length)      { toast.error('Select at least one stain'); return }

    setCreatingShare(true)
    try {
      const c = buildOrder.customer as { first_name: string; last_name: string } | null
      const customerName = c ? `${c.first_name} ${c.last_name}`.trim() : (buildOrder.customer_name ?? 'Walk-in')

      const { token } = await createShare.mutateAsync({
        order_id:      buildOrder.id,
        order_number:  buildOrder.order_number,
        customer_name: customerName,
        due_date:      buildOrder.due_date ?? null,
        items: picked.map((r) => ({
          linen_item:        r.linen_item,
          photo_url:         r.photo_url,
          add_stain_remover: r.add_stain_remover,
          notes:             r.notes,
        })),
      })

      const url = `${window.location.origin}/stain-share/${token}`
      setLastShareUrl(url)
      try { await navigator.clipboard.writeText(url) } catch { /* ignore */ }
      toast.success('Share link created & copied to clipboard')
      setPickedIds(new Set())
      setBuildOrder(null)
      refetchShares()
      setTab('shares')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create share')
    } finally {
      setCreatingShare(false)
    }
  }

  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied') }
    catch { toast.error('Copy failed') }
  }

  // ─── Tab labels ───────────────────────────────────────────────────────────

  const tabLabel: Record<Tab, string> = {
    new:     'New',
    active:  `Active (${activeReports.length})`,
    history: `History (${historyReports.length})`,
    build:   'Build Report',
    shares:  `Shares (${(shares as ShareRow[]).length})`,
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Droplets className="h-5 w-5 text-gray-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Stain Tracker</h1>
            <p className="text-sm text-gray-500">Log linen stains with a photo and share reports.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-5">

        {/* Tab nav */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}>
              {tabLabel[t]}
            </button>
          ))}
        </div>

        {/* ── New ── */}
        {tab === 'new' && (
          <div className="space-y-4">
            {/* Order picker */}
            <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</h2>
                {newOrder && (
                  <button onClick={() => setNewOrder(null)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <X className="h-3 w-3" /> Change
                  </button>
                )}
              </div>
              {!newOrder
                ? <OrderSearch onSelect={setNewOrder} />
                : (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{resolveOrderName(newOrder)}</p>
                    <p className="text-xs text-gray-500">
                      {newOrder.order_number}{newOrder.due_date ? ` · Due ${newOrder.due_date}` : ''}
                    </p>
                  </div>
                )
              }
            </section>

            {newOrder && (
              <>
                {/* Linen item + Photo + Options */}
                <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">

                  {/* Linen item */}
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Linen Item</h2>
                    {presets.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {presets.map((p) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <button onClick={() => setSelectedPreset(p.label)}
                              className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                                selectedPreset === p.label
                                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}>
                              {p.label}
                            </button>
                            <button onClick={() => handleRemovePreset(p.id, p.label)}
                              className="text-gray-300 hover:text-red-400 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {addingPreset ? (
                      <div className="flex gap-2">
                        <input autoFocus placeholder="e.g. Pillow Case" value={newPresetLabel}
                          onChange={(e) => setNewPresetLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreset(); if (e.key === 'Escape') { setAddingPreset(false); setNewPresetLabel('') } }}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <button onClick={handleAddPreset} disabled={!newPresetLabel.trim() || addPreset.isPending}
                          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                          Add
                        </button>
                        <button onClick={() => { setAddingPreset(false); setNewPresetLabel('') }}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingPreset(true)}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
                        <Plus className="h-4 w-4" /> Add item
                      </button>
                    )}
                  </div>

                  {/* Photo */}
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Photo of Stain</h2>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment"
                      className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
                    {photoPreview ? (
                      <div className="space-y-2">
                        <img src={photoPreview} alt="Stain preview"
                          className="max-h-64 rounded-xl border border-gray-200 object-cover" />
                        <button onClick={() => fileRef.current?.click()}
                          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                          <Upload className="h-4 w-4" /> Replace photo
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-10 text-sm text-gray-400 hover:bg-gray-100 transition-colors">
                        <ImageIcon className="h-5 w-5" /> Take or upload photo
                      </button>
                    )}
                  </div>

                  {/* Stain remover */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={addStainRemover}
                      onChange={(e) => setAddStainRemover(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-sm font-medium text-gray-700">Add Stain Remover</span>
                  </label>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes (optional)</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="e.g. red wine, top-left corner"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </section>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button onClick={() => resetForm()} disabled={submitting}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save report
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Active ── */}
        {tab === 'active' && (
          <div className="space-y-3">
            {activeReports.length === 0
              ? <EmptyState label="No active stain reports." />
              : activeReports.map((r) => <ReportCard key={r.id} r={r} onToggleStatus={handleToggleStatus} />)
            }
          </div>
        )}

        {/* ── History ── */}
        {tab === 'history' && (
          <div className="space-y-3">
            {historyReports.length === 0
              ? <EmptyState label="No resolved reports yet." />
              : historyReports.map((r) => <ReportCard key={r.id} r={r} onToggleStatus={handleToggleStatus} />)
            }
          </div>
        )}

        {/* ── Build Report ── */}
        {tab === 'build' && (
          <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</h2>
                {buildOrder && (
                  <button onClick={() => { setBuildOrder(null); setPickedIds(new Set()) }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <X className="h-3 w-3" /> Change
                  </button>
                )}
              </div>
              {!buildOrder
                ? <OrderSearch onSelect={setBuildOrder} />
                : (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{resolveOrderName(buildOrder)}</p>
                    <p className="text-xs text-gray-500">
                      {buildOrder.order_number}{buildOrder.due_date ? ` · Due ${buildOrder.due_date}` : ''}
                    </p>
                  </div>
                )
              }
            </section>

            {buildOrder && (
              <>
                {buildOrderReports.length === 0 ? (
                  <EmptyState label="No active stain reports for this order. Log one in the New tab first." />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">Pick stains to include:</p>
                      <button onClick={() => setPickedIds(
                        pickedIds.size === buildOrderReports.length
                          ? new Set()
                          : new Set(buildOrderReports.map((r) => r.id))
                      )} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {pickedIds.size === buildOrderReports.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {buildOrderReports.map((r) => {
                        const checked = pickedIds.has(r.id)
                        return (
                          <button key={r.id} onClick={() => setPickedIds((prev) => {
                            const next = new Set(prev); checked ? next.delete(r.id) : next.add(r.id); return next
                          })} className={cn(
                            'text-left rounded-xl border p-3 flex gap-3 transition-colors',
                            checked ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                          )}>
                            <img src={r.photo_url} alt={r.linen_item}
                              className="h-16 w-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <input type="checkbox" checked={checked} readOnly
                                  className="h-4 w-4 rounded border-gray-300 text-brand-600 pointer-events-none" />
                                <p className="text-sm font-semibold text-gray-900 truncate">{r.linen_item}</p>
                              </div>
                              {r.add_stain_remover && <Badge variant="outline" className="text-[10px]">Stain Remover</Badge>}
                              {r.notes && <p className="text-xs text-gray-500 truncate">{r.notes}</p>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button onClick={handleCreateShare} disabled={creatingShare || pickedIds.size === 0}
                    className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {creatingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    Create share link
                  </button>
                </div>

                {lastShareUrl && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Latest link</p>
                    <div className="flex gap-2">
                      <input readOnly value={lastShareUrl} onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none" />
                      <button onClick={() => copyUrl(lastShareUrl)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Shares ── */}
        {tab === 'shares' && (
          <div className="space-y-3">
            {(shares as ShareRow[]).length === 0 ? (
              <EmptyState label="No shared reports yet." />
            ) : (shares as ShareRow[]).map((s) => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/stain-share/${s.token}`
              return (
                <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{s.customer_name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {s.order_number ? `Order ${s.order_number}` : ''}
                        {s.due_date ? ` · Due ${s.due_date}` : ''}
                        {` · ${s.items.length} item${s.items.length === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <Badge variant={s.status === 'active' ? 'success' : 'secondary'} className="shrink-0 capitalize">
                      {s.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-1.5 text-xs bg-gray-50 focus:outline-none" />
                    <button onClick={() => copyUrl(url)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                    <button onClick={() => window.open(url, '_blank')}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      Open
                    </button>
                    {s.status === 'active' ? (
                      <button onClick={() => setShareStatus.mutate({ id: s.id, status: 'archived' })}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                    ) : (
                      <button onClick={() => setShareStatus.mutate({ id: s.id, status: 'active' })}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400">Created {new Date(s.created_at).toLocaleString()}</p>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
      {label}
    </div>
  )
}
