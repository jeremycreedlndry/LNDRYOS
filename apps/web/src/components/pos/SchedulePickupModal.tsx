'use client'

import { useState, useEffect } from 'react'
import { X, CalendarDays, Truck, MapPin } from 'lucide-react'
import { CustomerSearch } from '@/components/pos/CustomerSearch'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import type { Customer } from '@laundry/db'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onCreated?: (orderId: string) => void
}

export function SchedulePickupModal({ onClose, onCreated }: Props) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [scheduledDate, setScheduledDate] = useState('')
  const [notes, setNotes] = useState('')

  // Address — street uses Google Places autocomplete
  const [street, setStreet] = useState('')
  const [apt, setApt] = useState('')
  const [city, setCity] = useState('')
  const [postal, setPostal] = useState('')

  // When customer changes, populate address from their profile
  useEffect(() => {
    setStreet(customer?.address_street ?? '')
    setApt(customer?.address_apt ?? '')
    setCity(customer?.address_city ?? '')
    setPostal(customer?.address_postal_code ?? '')
  }, [customer])

  const utils = trpc.useUtils()
  const updateCustomer = trpc.customers.update.useMutation()

  const createPickup = trpc.orders.createPickup.useMutation({
    onSuccess: (order) => {
      utils.orders.list.invalidate()
      toast.success(`Pickup scheduled — ${(order as { order_number: string }).order_number}`)
      onCreated?.(order.id as string)
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = () => {
    if (!customer) { toast.error('Please select a customer'); return }
    if (!street.trim()) { toast.error('Pickup address is required'); return }

    // Save updated address back to customer if changed
    const addressChanged =
      street.trim() !== (customer.address_street ?? '') ||
      apt.trim()    !== (customer.address_apt ?? '') ||
      city.trim()   !== (customer.address_city ?? '') ||
      postal.trim() !== (customer.address_postal_code ?? '')

    if (addressChanged) {
      updateCustomer.mutate({
        id: customer.id,
        address_street:       street.trim() || null,
        address_apt:          apt.trim() || null,
        address_city:         city.trim() || null,
        address_postal_code:  postal.trim() || null,
      })
    }

    createPickup.mutate({
      customer_id:      customer.id,
      scheduled_date:   scheduledDate || null,
      notes:            notes.trim() || null,
    })
  }

  const isSubmitting = createPickup.isPending || updateCustomer.isPending
  const canSubmit = !!customer && !!street.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
              <Truck className="h-4 w-4 text-brand-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Schedule Pickup</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Customer */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            <CustomerSearch selected={customer} onSelect={setCustomer} />
          </div>

          {/* Pickup Address */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Pickup Address <span className="text-red-500">*</span>
              </span>
            </label>
            <div className="space-y-2">
              <AddressAutocomplete
                value={street}
                onChange={setStreet}
                onSelect={(fields) => {
                  setStreet(fields.street)
                  setCity(fields.city)
                  setPostal(fields.postal_code)
                }}
                placeholder="Start typing address…"
              />
              <div className="flex gap-2">
                <Input
                  value={apt}
                  onChange={(e) => setApt(e.target.value)}
                  placeholder="Apt / Unit"
                  className="text-sm w-28 shrink-0"
                />
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="text-sm flex-1"
                />
                <Input
                  value={postal}
                  onChange={(e) => setPostal(e.target.value)}
                  placeholder="Postal code"
                  className="text-sm w-28 shrink-0"
                />
              </div>
            </div>
            {customer && !street.trim() && (
              <p className="text-xs text-amber-600 mt-1.5">No address on file — please enter one above.</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Pickup Date (optional)
              </span>
            </label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. 2 bags, extra delicates, ring buzzer…"
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
            />
          </div>

          {/* Info callout */}
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            A pending order will be created with no items. Once laundry arrives, open the order and tap <strong className="text-gray-600">Detail Order</strong> to add services.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="gap-1.5"
          >
            <Truck className="h-4 w-4" />
            Schedule Pickup
          </Button>
        </div>
      </div>
    </div>
  )
}
