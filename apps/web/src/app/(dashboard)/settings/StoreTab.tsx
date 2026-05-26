'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

  // Logo
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Store info
  const [name, setName] = useState('')
  const [addressRaw, setAddressRaw] = useState('')
  const [address, setAddress] = useState<AddressFields>({ street: '', city: '', province: '', postal_code: '', country: '' })
  const [phone, setPhone] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [etransferEmail, setEtransferEmail] = useState('')

  // Hours
  const [hours, setHours] = useState<Record<string, { enabled: boolean; open: string; close: string }>>(DEFAULT_HOURS)

  // Services
  const [offersPickupDelivery, setOffersPickupDelivery] = useState(false)
  const [offersWashFold, setOffersWashFold] = useState(true)

  // Tax
  const [taxName, setTaxName] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [taxId, setTaxId] = useState('')

  // Order defaults
  const [defaultDueDays, setDefaultDueDays] = useState<string>('2')

  // Payments
  const [defaultPaymentType, setDefaultPaymentType] = useState<string>('saved_card')

  useEffect(() => {
    if (!tenant || ready) return
    const s = tenant.settings as TenantSettings
    const a = tenant.address as TenantAddress | null

    setName(tenant.name ?? '')
    setLogoUrl(s?.logo_url ?? '')
    setPhone(s?.phone ?? '')
    setWebsiteUrl(s?.website_url ?? '')
    setEtransferEmail(s?.etransfer_email ?? '')
    setTaxName(s?.tax_name ?? '')
    setTaxRate(s?.tax_rate != null ? (s.tax_rate * 100).toFixed(2) : '')
    setTaxId(s?.tax_id ?? '')
    setOffersPickupDelivery(s?.offers_pickup_delivery ?? false)
    setOffersWashFold(s?.offers_wash_fold ?? true)
    setHours(s?.hours ?? DEFAULT_HOURS)
    setDefaultDueDays(String(s?.default_due_days ?? 2))
    setDefaultPaymentType(s?.default_payment_type ?? 'saved_card')

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
        ...(logoUrl ? { logo_url: logoUrl } : {}),
        phone,
        website_url: websiteUrl,
        etransfer_email: etransferEmail.trim() || undefined,
        tax_name: taxName,
        tax_rate: isNaN(rate) ? 0 : rate / 100,
        tax_id: taxId,
        offers_pickup_delivery: offersPickupDelivery,
        offers_wash_fold: offersWashFold,
        hours,
        default_due_days: parseInt(defaultDueDays, 10) || 2,
        default_payment_type: defaultPaymentType as 'saved_card' | 'card_terminal' | 'pay_on_collection' | 'cash' | 'direct_deposit' | 'invoice',
      },
    })
  }

  const handleAddressSelect = useCallback((fields: AddressFields) => {
    setAddress(fields)
  }, [])

  const handleLogoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/logo', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Upload failed')
        return
      }
      const { logo_url } = await res.json() as { logo_url: string }
      setLogoUrl(logo_url)
      update.mutate({ settings: { logo_url } })
    } catch {
      toast.error('Upload failed')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }, [update])

  return (
    <form onSubmit={handleSubmit} className="space-y-10 max-w-xl">

      {/* A. Store Info */}
      <Section title="Store Information">
        <div className="grid grid-cols-1 gap-4">
          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Store Logo</label>
            <div className="flex items-center gap-4">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Store logo"
                  className="h-20 w-auto rounded-lg border border-gray-200 object-contain bg-gray-50 p-1"
                />
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logoUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => { setLogoUrl(''); update.mutate({ settings: { logo_url: undefined } }) }}
                    className="text-xs text-red-500 hover:underline text-left"
                  >
                    Remove logo
                  </button>
                )}
                <p className="text-xs text-gray-400">PNG, JPG, SVG — shown on invoices</p>
              </div>
            </div>
          </div>

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
            <label className="block text-sm font-medium text-gray-700 mb-1">e-Transfer email</label>
            <Input
              type="email"
              value={etransferEmail}
              onChange={(e) => setEtransferEmail(e.target.value)}
              placeholder="payments@yourstore.com"
            />
            <p className="mt-1 text-xs text-gray-400">
              Shown on invoices as the destination for Interac e-Transfer payments
            </p>
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

      {/* D. Order Defaults */}
      <Section title="Order Defaults">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ready by default</label>
          <p className="text-xs text-gray-500 mb-2">Sets the default "Ready by" date when creating a new order.</p>
          <select
            value={defaultDueDays}
            onChange={(e) => setDefaultDueDays(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="0">Same day</option>
            <option value="1">Next day (+1 day)</option>
            <option value="2">+2 days</option>
            <option value="3">+3 days</option>
            <option value="4">+4 days</option>
            <option value="5">+5 days</option>
            <option value="7">+1 week</option>
            <option value="14">+2 weeks</option>
          </select>
        </div>
      </Section>

      <Section title="Payments">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default payment method at checkout</label>
          <p className="text-xs text-gray-500 mb-2">Pre-selects this method when opening the payment screen. Overridden per-customer if they have a different payment type set.</p>
          <select
            value={defaultPaymentType}
            onChange={(e) => setDefaultPaymentType(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="saved_card">Saved Card</option>
            <option value="card_terminal">Terminal</option>
            <option value="pay_on_collection">Pay on Collection</option>
            <option value="cash">Cash</option>
            <option value="direct_deposit">E-Transfer</option>
            <option value="invoice">Invoice</option>
          </select>
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
