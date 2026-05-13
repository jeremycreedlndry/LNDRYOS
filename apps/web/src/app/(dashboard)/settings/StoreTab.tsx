'use client'

import { useState, useEffect, useCallback } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressAutocomplete, type AddressFields } from '@/components/ui/AddressAutocomplete'
import { trpc } from '@/lib/trpc'
import type { TenantSettings, TenantAddress } from '@laundry/db'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map((d) => [d, {
    enabled: !['saturday', 'sunday'].includes(d),
    open: '09:00',
    close: '18:00',
  }])
)

// ─── Hours editor ─────────────────────────────────────────────────────────────

interface HoursEditorProps {
  hours: Record<string, { enabled: boolean; open: string; close: string }>
  onChange: (hours: Record<string, { enabled: boolean; open: string; close: string }>) => void
}

function HoursEditor({ hours, onChange }: HoursEditorProps) {
  const set = (day: string, field: string, value: string | boolean) =>
    onChange({ ...hours, [day]: { ...hours[day], [field]: value } })

  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {DAYS.map((day) => {
        const h = hours[day] ?? { enabled: false, open: '09:00', close: '18:00' }
        return (
          <div key={day} className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => set(day, 'enabled', !h.enabled)}
              className={`shrink-0 transition-colors ${h.enabled ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}
            >
              {h.enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            </button>
            <span className={`w-8 text-sm font-medium shrink-0 ${h.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
              {DAY_LABELS[day]}
            </span>
            {h.enabled ? (
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="time"
                  value={h.open}
                  onChange={(e) => set(day, 'open', e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="time"
                  value={h.close}
                  onChange={(e) => set(day, 'close', e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ) : (
              <span className="text-sm text-gray-400">Closed</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`transition-colors ${value ? 'text-brand-600 hover:text-brand-700' : 'text-gray-300 hover:text-gray-400'}`}
      >
        {value ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
      </button>
    </div>
  )
}

// ─── Main Store tab ───────────────────────────────────────────────────────────

export function StoreTab() {
  const utils = trpc.useUtils()
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const [ready, setReady] = useState(false)

  // Store info
  const [name, setName] = useState('')
  const [addressRaw, setAddressRaw] = useState('')
  const [address, setAddress] = useState<AddressFields>({ street: '', city: '', province: '', postal_code: '', country: '' })
  const [phone, setPhone] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')

  // Hours
  const [hours, setHours] = useState<Record<string, { enabled: boolean; open: string; close: string }>>(DEFAULT_HOURS)

  // Services
  const [offersPickupDelivery, setOffersPickupDelivery] = useState(false)
  const [offersWashFold, setOffersWashFold] = useState(true)

  // Tax
  const [taxName, setTaxName] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [taxId, setTaxId] = useState('')

  useEffect(() => {
    if (!tenant || ready) return
    const s = tenant.settings as TenantSettings
    const a = tenant.address as TenantAddress | null

    setName(tenant.name ?? '')
    setPhone(s?.phone ?? '')
    setWebsiteUrl(s?.website_url ?? '')
    setTaxName(s?.tax_name ?? '')
    setTaxRate(s?.tax_rate != null ? (s.tax_rate * 100).toFixed(2) : '')
    setTaxId(s?.tax_id ?? '')
    setOffersPickupDelivery(s?.offers_pickup_delivery ?? false)
    setOffersWashFold(s?.offers_wash_fold ?? true)
    setHours(s?.hours ?? DEFAULT_HOURS)

    if (a) {
      setAddress({
        street: a.street ?? '',
        city: a.city ?? '',
        province: a.province ?? '',
        postal_code: a.postal_code ?? '',
        country: a.country ?? '',
        lat: a.lat,
        lng: a.lng,
      })
      setAddressRaw(a.formatted ?? a.street ?? '')
    }
    setReady(true)
  }, [tenant, ready])

  const update = trpc.tenants.updateSettings.useMutation({
    onSuccess: () => { utils.tenants.getCurrent.invalidate(); toast.success('Settings saved') },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const rate = parseFloat(taxRate)
    update.mutate({
      name,
      address: {
        ...address,
        formatted: addressRaw,
      },
      settings: {
        phone,
        website_url: websiteUrl,
        tax_name: taxName,
        tax_rate: isNaN(rate) ? 0 : rate / 100,
        tax_id: taxId,
        offers_pickup_delivery: offersPickupDelivery,
        offers_wash_fold: offersWashFold,
        hours,
      },
    })
  }

  const handleAddressSelect = useCallback((fields: AddressFields) => {
    setAddress(fields)
  }, [])

  return (
    <form onSubmit={handleSubmit} className="space-y-10 max-w-xl">

      {/* A. Store Info */}
      <Section title="Store Information">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Store name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <AddressAutocomplete
              value={addressRaw}
              onChange={setAddressRaw}
              onSelect={handleAddressSelect}
            />
            {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
              <p className="mt-1 text-xs text-amber-600">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable autocomplete</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <Input value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} placeholder="Vancouver" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province / State</label>
              <Input value={address.province} onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))} placeholder="BC" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal / ZIP code</label>
              <Input value={address.postal_code} onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))} placeholder="V6B 1A1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <Input value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} placeholder="Canada" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 604 555 0100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Business hours</label>
            <HoursEditor hours={hours} onChange={setHours} />
          </div>
        </div>
      </Section>

      {/* B. Services Offered */}
      <Section title="Services Offered">
        <ToggleRow
          label="Wash & Fold"
          description="Accept wash & fold orders at the POS"
          value={offersWashFold}
          onChange={setOffersWashFold}
        />
        <ToggleRow
          label="Pickup & Delivery"
          description="Enable scheduling pickups and deliveries"
          value={offersPickupDelivery}
          onChange={setOffersPickupDelivery}
        />
      </Section>

      {/* C. Tax */}
      <Section title="Tax">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax name</label>
            <Input value={taxName} onChange={(e) => setTaxName(e.target.value)} placeholder="HST" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
            <Input
              type="number" inputMode="decimal" step="0.001" min="0" max="100"
              value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="13" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tax registration number</label>
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="123456789 RT0001" />
        </div>
      </Section>

      <div className="pt-2">
        <Button type="submit" disabled={update.isPending} size="lg">
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}
