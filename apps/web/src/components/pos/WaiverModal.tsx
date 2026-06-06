'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Hardcoded waiver templates ────────────────────────────────────────────────

export const WAIVER_TEMPLATES = [
  {
    id: 'dry_clean_override',
    label: 'Dry clean only — wet wash',
    text: 'I acknowledge this item is labelled "dry clean only." I am requesting that it be processed using wet washing. I understand this may result in shrinkage, colour bleeding, fabric damage, or other harm, and I release the store from any liability for damage resulting from this process.',
  },
  {
    id: 'duvet_wet_wash',
    label: 'Duvet — filling shift / loft risk',
    text: 'I acknowledge the risks associated with wet washing this duvet, including potential filling displacement, clumping, or permanent loss of loft. I am requesting this service at my own risk and release the store from liability for any resulting damage.',
  },
  {
    id: 'delicate_fabric',
    label: 'Delicate fabric — colour run / shrink risk',
    text: 'I acknowledge this item is made from delicate fabric and may be at risk of colour bleeding, shrinkage, or structural damage during standard cleaning. I am requesting processing at my own risk and release the store from any resulting liability.',
  },
  {
    id: 'custom',
    label: 'Custom description…',
    text: '',
  },
] as const

export type WaiverTemplateId = typeof WAIVER_TEMPLATES[number]['id']

interface Props {
  itemName: string
  onConfirm: (waiverText: string) => void
  onCancel: () => void
}

export function WaiverModal({ itemName, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<WaiverTemplateId | null>(null)
  const [customText, setCustomText] = useState('')

  const template = WAIVER_TEMPLATES.find((t) => t.id === selectedId)
  const waiverText = selectedId === 'custom' ? customText : (template?.text ?? '')
  const canConfirm = !!selectedId && waiverText.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">Add Care Waiver</h2>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-800">{itemName}</span> — customer is requesting we override the care label.
            Select the reason so they can sign a release on their phone.
          </p>

          {/* Template selector */}
          <div className="space-y-2">
            {WAIVER_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  selectedId === t.id
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/40 text-gray-700'
                }`}
              >
                <p className="font-medium">{t.label}</p>
                {t.id !== 'custom' && t.text && (
                  <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">{t.text}</p>
                )}
              </button>
            ))}
          </div>

          {/* Custom text area */}
          {selectedId === 'custom' && (
            <textarea
              autoFocus
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Describe the specific risk the customer is acknowledging…"
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          )}

          {/* Preview of selected template text */}
          {selectedId && selectedId !== 'custom' && waiverText && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Waiver text (customer will see this)</p>
              <p className="text-sm text-gray-700">{waiverText}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => canConfirm && onConfirm(waiverText)}
            disabled={!canConfirm}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
          >
            Add Waiver
          </Button>
        </div>
      </div>
    </div>
  )
}
