'use client'

import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, X, Check, User, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import type { Customer } from '@laundry/db'
import toast from 'react-hot-toast'
import { useDebounce } from '@/hooks/useDebounce'
import { CustomerModal } from '@/components/customers/CustomerModal'
import { CustomerProfilePanel } from '@/components/customers/CustomerProfilePanel'
import { ScheduleModal } from '@/components/pickups/ScheduleModal'

export default function CustomersPage() {
  const utils = trpc.useUtils()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileTab, setProfileTab] = useState<'orders' | 'edit'>('orders')
  const [scheduleCustomer, setScheduleCustomer] = useState<Customer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  const { data: customers = [], isLoading } = trpc.customers.list.useQuery(
    debouncedQuery ? { query: debouncedQuery } : undefined
  )

  const deleteCustomer = trpc.customers.delete.useMutation({
    onSuccess: () => { utils.customers.list.invalidate(); setDeleteConfirm(null); toast.success('Customer removed') },
    onError: (e) => toast.error(e.message),
  })

  const openProfile = (id: string, tab: 'orders' | 'edit' = 'orders') => {
    setProfileTab(tab)
    setProfileId(id)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading && (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        )}
        {!isLoading && customers.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            {query ? 'No customers found.' : 'No customers yet. Add your first one.'}
          </div>
        )}
        {customers.map((customer: Customer) => {
          const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ')
          const initials = [customer.first_name[0], customer.last_name?.[0]].filter(Boolean).join('').toUpperCase()
          return (
            <div
              key={customer.id}
              className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0 hover:bg-gray-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials || <User className="h-4 w-4" />}
              </div>

              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openProfile(customer.id, 'orders')}>
                <p className="text-sm font-medium text-gray-900 hover:text-brand-600 transition-colors">{name}</p>
                <p className="text-xs text-gray-500">
                  {customer.phone}
                  {customer.email && ` · ${customer.email}`}
                </p>
              </div>

              {customer.discount_percent > 0 && (
                <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  {customer.discount_percent}% off
                </span>
              )}

              {customer.account_balance > 0 && (
                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  ${(customer.account_balance / 100).toFixed(2)} credit
                </span>
              )}

              <button
                onClick={() => setScheduleCustomer(customer as Customer)}
                className="text-gray-400 hover:text-brand-600"
                title="Add pickup schedule"
              >
                <Truck className="h-4 w-4" />
              </button>
              <button
                onClick={() => openProfile(customer.id, 'edit')}
                className="text-gray-400 hover:text-gray-600"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {deleteConfirm === customer.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => deleteCustomer.mutate({ id: customer.id })} className="text-red-500 hover:text-red-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(customer.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {profileId && (
        <CustomerProfilePanel customerId={profileId} onClose={() => setProfileId(null)} initialTab={profileTab} />
      )}

      {showAdd && (
        <CustomerModal
          customer={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { utils.customers.list.invalidate(); setShowAdd(false) }}
        />
      )}

      {scheduleCustomer && (
        <ScheduleModal
          initialCustomer={{
            id: scheduleCustomer.id,
            first_name: scheduleCustomer.first_name,
            last_name: scheduleCustomer.last_name,
            phone: scheduleCustomer.phone,
            address_street: scheduleCustomer.address_street,
            address_city: scheduleCustomer.address_city,
          }}
          onClose={() => setScheduleCustomer(null)}
          onSaved={() => setScheduleCustomer(null)}
        />
      )}
    </div>
  )
}
