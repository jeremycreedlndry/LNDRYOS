'use client'

import { useState, useEffect } from 'react'
import { Smartphone, Eye, EyeOff, Copy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

export function CustomerAppSection() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/tenants/me')
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        setToken(d?.customer_api_token ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const generate = () => {
    if (token && !confirm('Regenerate? Any connected apps will need to be updated with the new token.')) return
    setGenerating(true)
    fetch('/api/tenants/generate-token', { method: 'POST' })
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        if (d?.token) {
          setToken(d.token)
          setRevealed(true)
          toast.success('Token generated')
        } else {
          toast.error('Failed to generate token')
        }
      })
      .catch(() => toast.error('Failed to generate token'))
      .finally(() => setGenerating(false))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-indigo-50 border-indigo-100">
          <Smartphone className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Customer App</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">API token for connecting the LNDRYOS customer app to this store</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${token ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {loading ? '…' : token ? 'Token active' : 'No token'}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Enter this token in the customer app to connect it to your store. Keep it private — anyone with this token can access your store&apos;s customer-facing data.
          </p>

          {token ? (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="flex-1 font-mono text-xs text-gray-700 truncate">
                {revealed ? token : token.slice(0, 8) + '••••••••••••••••••••••••••••••••••••••••••••'}
              </span>
              <button
                onClick={() => setRevealed((r) => !r)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                title={revealed ? 'Hide' : 'Show'}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(token).then(() => toast.success('Copied'))}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                title="Copy"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {loading ? 'Loading…' : 'No token generated yet.'}
            </p>
          )}

          <button
            onClick={generate}
            disabled={generating || loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
            {token ? 'Regenerate token' : 'Generate token'}
          </button>
        </div>
      )}
    </div>
  )
}
