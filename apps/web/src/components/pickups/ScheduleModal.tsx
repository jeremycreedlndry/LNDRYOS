'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'
import { useDebounce } from '@/hooks/useDebounce'

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FREQ_LABELS: Record<string, string> = {
  once: 'One-time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly',
}

type CustomerStub = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  address_street: string | null
  address_city: string | null
}

interface Props {
  onClose: () => void
  onSaved: () => void
  initialCustomer?: CustomerStub
}

export function ScheduleModal({ onClose, onSaved, initialCustomer }: Props) {
  const utils = trpc.useUtils()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerStub | null>(initialCustomer ?? null)

  const [form, setForm] = useState({
    frequency: 'weekly' as 'once' | 'weekly' | 'biweekly' | 'monthly',
    day_of_week: new Date().getDay(),
    next_pickup_date: isoDate(new Date()),
    pickup_start: '09:00',
    pickup_end: '12:00',
    delivery_start: '14:00',
    delivery_end: '18:00',
    delivery_days_later: 2,
    end_date: '',
    auto_create_order: true,
    notes: '',
  })
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const { data: searchResults = [] } = trpc.customers.list.useQuery(
    debouncedSearch ? { query: debouncedSearch } : undefined,
    { enabled: debouncedSearch.length >= 2 }
  )

  const create = trpc.pickupSchedules.create.useMutation({
    onSuccess: () => {
      utils.pickupSchedules.list.invalidate()
      utils.pickupStops.listUpcoming.invalidate()
      toast.success('Schedule created')
      onSaved()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSave = () => {
    if (!selectedCustomer) { toast.error('Select a customer'); return }
    create.mutate({
      customer_id: selectedCustomer.id,
      ...form,
      day_of_week: form.frequency !== 'once' ? form.day_of_week : null,
      end_date: form.end_date || null,
      notes: form.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add Pickup Schedule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Customer */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                  <p className="text-xs text-gray-500">
                    {[selectedCustomer.address_street, selectedCustomer.address_city].filter(Boolean).join(', ')}
                  </p>
                </div>
                {!initialCustomer && (
                  <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or phone…" autoFocus
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none" />
                {debouncedSearch.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                    {(searchResults as CustomerStub[]).map((c) => (
                      <button key={c.id} onClick={() => { setSelectedCustomer(c); setSearch('') }}
                        className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-gray-50">
                        <span className="text-sm font-medium text-gray-900">{c.first_name} {c.last_name}</span>
                        <span className="text-xs text-gray-500">{c.phone}{c.address_street ? ` · ${c.address_street}` : ''}</span>
                      </button>
                    ))}
                    {searchResults.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No customers found</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Frequency + day */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Frequency</label>
              <select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm">
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {form.frequency !== 'once' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pickup day</label>
                <select value={form.day_of_week} onChange={(e) => set('day_of_week', Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm">
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Start + end date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {form.frequency === 'once' ? 'Pickup Date' : 'First Pickup'}
              </label>
              <input type="date" value={form.next_pickup_date} onChange={(e) => set('next_pickup_date', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
            {form.frequency !== 'once' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  End Date <span className="normal-case font-normal text-gray-400">(optional)</span>
                </label>
                <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)}
                  min={form.next_pickup_date}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
              </div>
            )}
          </div>

          {/* Pickup window */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pickup window</label>
            <div className="flex gap-3">
              <input type="time" value={form.pickup_start} onChange={(e) => set('pickup_start', e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
              <span className="self-center text-gray-400">–</span>
              <input type="time" value={form.pickup_end} onChange={(e) => set('pickup_end', e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
          </div>

          {/* Delivery */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deliver after (days)</label>
              <input type="number" min={0} max={14} value={form.delivery_days_later}
                onChange={(e) => set('delivery_days_later', Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Delivery window</label>
              <div className="flex gap-2">
                <input type="time" value={form.delivery_start} onChange={(e) => set('delivery_start', e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 px-2 py-2.5 text-sm" />
                <span className="self-center text-gray-400">–</span>
                <input type="time" value={form.delivery_end} onChange={(e) => set('delivery_end', e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 px-2 py-2.5 text-sm" />
              </div>
            </div>
          </div>

          {/* Auto-create order */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.auto_create_order} onChange={(e) => set('auto_create_order', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-brand-600" />
            <span className="text-sm text-gray-700">Auto-create order when picked up</span>
          </label>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
              rows={2} placeholder="Pickup instructions…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4 shrink-0">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!selectedCustomer || create.isPending}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            {create.isPending ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
