'use client'

import { useState, useRef } from 'react'
import { X, Camera, Plus, Trash2, ChevronDown } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface Props {
  orderId: string
  orderNumber: string
  onClose: () => void
}

export function OrderIssuesModal({ orderId, orderNumber, onClose }: Props) {
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: issues = [], isLoading } = trpc.orderIssues.listByOrder.useQuery({ order_id: orderId })
  const { data: categories = [] } = trpc.orderIssues.listCategories.useQuery()

  const [showAddForm, setShowAddForm] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [uploading, setUploading] = useState(false)

  const createIssue = trpc.orderIssues.create.useMutation({
    onSuccess: () => {
      utils.orderIssues.listByOrder.invalidate({ order_id: orderId })
      toast.success('Issue logged')
      resetForm()
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteIssue = trpc.orderIssues.delete.useMutation({
    onSuccess: () => {
      utils.orderIssues.listByOrder.invalidate({ order_id: orderId })
      toast.success('Issue removed')
    },
    onError: (e) => toast.error(e.message),
  })

  const addCategory = trpc.orderIssues.addCategory.useMutation({
    onSuccess: (cat) => {
      utils.orderIssues.listCategories.invalidate()
      setCategory(cat.label)
      setNewCategoryInput('')
      setShowNewCategory(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const resetForm = () => {
    setPreview(null)
    setFile(null)
    setCategory('')
    setNote('')
    setShowAddForm(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
    setShowAddForm(true)
  }

  const handleSubmit = async () => {
    if (!file || !category) {
      toast.error('Please select a photo and category')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('orderId', orderId)

      const res = await fetch('/api/upload/order-issue', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      await createIssue.mutateAsync({
        order_id: orderId,
        photo_url: json.photo_url,
        storage_path: json.storage_path,
        category,
        note: note.trim() || null,
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleAddNewCategory = () => {
    const label = newCategoryInput.trim()
    if (!label) return
    addCategory.mutate({ label })
  }

  const allCategories = categories.map((c: { id: string; label: string }) => c.label)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Order Issues</h2>
            <p className="text-xs text-gray-500 mt-0.5">{orderNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Existing issues */}
          {isLoading && <p className="p-6 text-center text-sm text-gray-400">Loading…</p>}

          {!isLoading && issues.length > 0 && (
            <div className="p-4 space-y-3">
              {issues.map((issue: {
                id: string; photo_url: string; category: string; note: string | null; created_at: string
              }) => (
                <div key={issue.id} className="flex gap-3 rounded-xl border border-gray-200 p-3">
                  <a href={issue.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img
                      src={issue.photo_url}
                      alt={issue.category}
                      className="h-20 w-20 rounded-lg object-cover border border-gray-100 hover:opacity-90 transition-opacity"
                    />
                  </a>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        {issue.category}
                      </span>
                      <button
                        onClick={() => deleteIssue.mutate({ id: issue.id })}
                        disabled={deleteIssue.isPending}
                        className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {issue.note && (
                      <p className="mt-1.5 text-sm text-gray-600">{issue.note}</p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(issue.created_at).toLocaleString('en-CA', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && issues.length === 0 && !showAddForm && (
            <p className="px-6 py-8 text-center text-sm text-gray-400">No issues logged for this order.</p>
          )}

          {/* Add issue form */}
          {showAddForm && (
            <div className="border-t border-gray-100 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">New Issue</p>

              {/* Photo preview */}
              {preview && (
                <div className="relative w-fit">
                  <img src={preview} alt="Preview" className="h-32 w-auto rounded-xl border border-gray-200 object-cover" />
                  <button
                    onClick={resetForm}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                {!showNewCategory ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={cn(
                          'w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-brand-400 focus:outline-none',
                          !category && 'text-gray-400'
                        )}
                      >
                        <option value="">Select category…</option>
                        {allCategories.map((label: string) => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                    <button
                      onClick={() => setShowNewCategory(true)}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" /> New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNewCategory()}
                      placeholder="Category name…"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none"
                    />
                    <button
                      onClick={handleAddNewCategory}
                      disabled={!newCategoryInput.trim() || addCategory.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowNewCategory(false); setNewCategoryInput('') }}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Describe the issue…"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-4 py-4 shrink-0">
          {!showAddForm ? (
            <>
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Close
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Camera className="h-4 w-4" /> Add Photo
              </button>
            </>
          ) : (
            <>
              <button onClick={resetForm} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!file || !category || uploading || createIssue.isPending}
                className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {uploading ? 'Uploading…' : 'Save Issue'}
              </button>
            </>
          )}
        </div>

        {/* Hidden file input — capture="environment" opens rear camera on mobile */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
