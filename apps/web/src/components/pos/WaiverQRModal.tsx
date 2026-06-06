'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

interface WaiverLine {
  id: string
  name: string
  waiver_text: string | null
  waiver_token: string | null
  waiver_acknowledged_at: string | null
  waiver_acknowledged_name: string | null
}

interface Props {
  orderId: string
  onClose: () => void
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (typeof window !== 'undefined' ? window.location.origin : '')

export function WaiverQRModal({ orderId, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)

  // Poll for waiver lines every 3 seconds
  const { data: waiverLines = [], refetch } = trpc.orders.getWaiverLines.useQuery(
    { order_id: orderId },
    { refetchInterval: 3000 }
  )

  // Advance to next unsigned waiver automatically once current one is signed
  useEffect(() => {
    if (waiverLines.length === 0) return
    const current = waiverLines[activeIdx]
    if (current?.waiver_acknowledged_at && activeIdx < waiverLines.length - 1) {
      setActiveIdx((i) => i + 1)
    }
  }, [waiverLines, activeIdx])

  const allSigned = waiverLines.length > 0 && waiverLines.every((l) => !!l.waiver_acknowledged_at)
  const current = waiverLines[activeIdx] as WaiverLine | undefined

  const waiverUrl = current?.waiver_token
    ? `${APP_URL}/waiver/${current.waiver_token}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">
              {allSigned ? 'Waivers Complete' : 'Customer Signature Required'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* All signed */}
          {allSigned ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-base font-semibold text-gray-900">All waivers signed!</p>
              <p className="text-sm text-center text-gray-500">
                {waiverLines.map((l) => l.waiver_acknowledged_name ?? 'Customer').join(', ')} has acknowledged the care instruction override.
              </p>
              <Button onClick={onClose} className="w-full mt-2">
                Continue to Payment
              </Button>
            </div>
          ) : current ? (
            <>
              {/* Progress indicator */}
              {waiverLines.length > 1 && (
                <div className="flex gap-1.5">
                  {waiverLines.map((l, i) => (
                    <div
                      key={l.id}
                      className={`flex-1 h-1.5 rounded-full ${
                        l.waiver_acknowledged_at
                          ? 'bg-green-400'
                          : i === activeIdx
                          ? 'bg-amber-400'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Current waiver item */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Item</p>
                <p className="text-sm font-medium text-gray-900">{current.name}</p>
              </div>

              {/* QR code */}
              {waiverUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl border-2 border-gray-100 p-4 bg-white">
                    <QRCodeSVG
                      value={waiverUrl}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="text-xs text-center text-gray-500">
                    Ask the customer to scan this QR code with their phone and sign the waiver.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    <span>Waiting for signature…</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-center text-red-500">No waiver token — please contact support.</p>
              )}

              {/* Already-signed lines */}
              {waiverLines.some((l) => l.waiver_acknowledged_at) && (
                <div className="space-y-1">
                  {waiverLines.filter((l) => l.waiver_acknowledged_at).map((l) => (
                    <div key={l.id} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      <span><span className="font-medium">{l.name}</span> — signed by {l.waiver_acknowledged_name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={onClose} className="flex-1 text-xs">
                  Skip for now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  className="flex-1 text-xs"
                >
                  Refresh
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-center text-gray-400 py-4">Loading waiver details…</p>
          )}
        </div>
      </div>
    </div>
  )
}
