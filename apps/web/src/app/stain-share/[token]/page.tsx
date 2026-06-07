'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

interface ShareItem {
  linen_item: string
  photo_url: string
  add_stain_remover: boolean
  notes?: string | null
}

interface Share {
  customer_name: string
  order_number: string | null
  due_date: string | null
  order_summary: string | null
  items: ShareItem[]
  status: string
  created_at: string
}

const PAGE_SIZE = 10

export default function StainSharePage() {
  const { token } = useParams<{ token: string }>()
  const [share,   setShare]   = useState<Share | null>(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [lightbox, setLightbox] = useState('')
  const [page,    setPage]    = useState(1)

  useEffect(() => {
    if (!token) { setErr('Missing link token'); setLoading(false); return }
    fetch(`/api/stain-share/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error)
        else setShare(d as Share)
      })
      .catch(() => setErr('Failed to load report'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  )

  if (err || !share) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-bold text-gray-900">Report unavailable</h1>
        <p className="text-sm text-gray-500">{err || 'Not found'}</p>
      </div>
    </div>
  )

  const totalPages = Math.max(1, Math.ceil(share.items.length / PAGE_SIZE))
  const current    = Math.min(page, totalPages)
  const visible    = share.items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-6">

        {/* Header */}
        <header className="border-b border-gray-100 pb-5 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            THE LNDRY Co. · Stain Report
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{share.customer_name}</h1>
          <p className="text-sm text-gray-500">
            {share.order_number ? `Order #${share.order_number}` : ''}
            {share.due_date ? ` · Deliver ${share.due_date}` : ''}
          </p>
          {share.status === 'archived' && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              Archived
            </span>
          )}
        </header>

        <p className="text-sm text-gray-700">
          We found <strong>{share.items.length}</strong> item{share.items.length === 1 ? '' : 's'} with stains in your order.
          Tap any photo to enlarge.
        </p>

        {/* Items grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((item, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex gap-3">
              <button
                type="button"
                onClick={() => setLightbox(item.photo_url)}
                className="shrink-0 h-20 w-20 rounded-lg overflow-hidden bg-gray-200 border border-gray-200"
                aria-label="Enlarge photo"
              >
                <img
                  src={item.photo_url}
                  alt={`${item.linen_item} stain`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.linen_item}</p>
                  {item.add_stain_remover && (
                    <span className="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600">
                      Stain Remover
                    </span>
                  )}
                </div>
                {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
                <p className="text-[10px] text-gray-400">Tap photo to enlarge</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              disabled={current === 1}
              onClick={() => { setPage(current - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-xs text-gray-400">Page {current} of {totalPages}</p>
            <button
              disabled={current === totalPages}
              onClick={() => { setPage(current + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-2">
          Reported {new Date(share.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox('')}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox('')}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Stain enlarged"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  )
}
