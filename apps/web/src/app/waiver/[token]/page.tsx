'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WaiverData {
  id: string
  name: string
  waiver_text: string | null
  waiver_token_expires_at: string | null
  waiver_acknowledged_at: string | null
  waiver_acknowledged_name: string | null
  order: {
    order_number: string
    tenant: { name: string }
  } | null
}

export default function WaiverPage() {
  const { token } = useParams<{ token: string }>()
  const [waiver, setWaiver] = useState<WaiverData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/waiver/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setFetchError((body as { error?: string }).error ?? 'Waiver not found')
        } else {
          setWaiver(await res.json())
        }
      })
      .catch(() => setFetchError('Could not load waiver. Please check your connection.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async () => {
    if (!agreed || name.trim().length < 2 || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/waiver/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: name.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSubmitError((body as { error?: string }).error ?? 'Something went wrong')
      } else {
        setSubmitted(true)
      }
    } catch {
      setSubmitError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const storeName = waiver?.order?.tenant?.name ?? 'LNDRY Co'
  const orderNumber = waiver?.order?.order_number

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 text-center space-y-3">
          <XCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">Waiver Unavailable</h1>
          <p className="text-sm text-gray-500">{fetchError}</p>
          {fetchError.includes('expired') && (
            <p className="text-xs text-gray-400">Please ask staff to send a new waiver link.</p>
          )}
        </div>
      </div>
    )
  }

  if (waiver?.waiver_acknowledged_at || submitted) {
    const signedBy = submitted ? name : (waiver?.waiver_acknowledged_name ?? 'Customer')
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">Waiver Signed ✓</h1>
          <p className="text-sm text-gray-500">
            Thank you, <span className="font-medium text-gray-800">{signedBy}</span>.
            {orderNumber && <> Your signature has been recorded for order <span className="font-medium text-gray-800">{orderNumber}</span>.</>}
          </p>
          <p className="text-xs text-gray-400 pt-2">You can close this tab.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg overflow-hidden">

        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <h1 className="text-base font-bold text-amber-900">Care Instruction Waiver</h1>
          </div>
          <p className="text-xs text-amber-700">
            {storeName}{orderNumber ? ` · Order ${orderNumber}` : ''}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Item name */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Item</p>
            <p className="text-sm font-semibold text-gray-900">{waiver?.name}</p>
          </div>

          {/* Waiver text */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Release of Liability
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {waiver?.waiver_text}
            </p>
          </div>

          {/* Name field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Your full name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="h-11"
              autoComplete="name"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-amber-500 cursor-pointer"
            />
            <span className="text-sm text-gray-700 leading-snug">
              I have read and understood the above, and I agree to release{' '}
              <span className="font-medium">{storeName}</span> from any liability arising from
              processing this item against its care label instructions.
            </span>
          </label>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!agreed || name.trim().length < 2 || submitting}
            className="w-full h-12 text-base font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Signing…
              </span>
            ) : (
              'I Agree — Sign Waiver'
            )}
          </Button>

          {submitError && (
            <p className="text-xs text-center text-red-500">{submitError}</p>
          )}

          <p className="text-xs text-center text-gray-400">
            By signing, you confirm this is your genuine name and consent.
          </p>
        </div>
      </div>
    </div>
  )
}
