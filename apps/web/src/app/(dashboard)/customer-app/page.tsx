'use client'

import { useState, useEffect } from 'react'
import { Smartphone, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CustomerAppPage() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
          <Smartphone className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customer App</h1>
          <p className="text-sm text-gray-500">API token for connecting the LNDRYOS customer app to this store</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <p className="text-sm text-gray-500">
          Enter this token in the customer app to connect it to your store. Keep it private — anyone with this token can access your store&apos;s customer-facing data.
        </p>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">API Token</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : token ? (
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
            <p className="text-sm text-gray-400 italic">No token generated yet.</p>
          )}
        </div>

        <button
          onClick={generate}
          disabled={generating || loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {token ? 'Regenerate token' : 'Generate token'}
        </button>
      </div>
    </div>
  )
}
