'use client'

import { useState, useCallback } from 'react'
import { Search, X, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import type { Customer } from '@laundry/db'
import { useDebounce } from '@/hooks/useDebounce'
import { CustomerModal } from '@/components/customers/CustomerModal'
import { CustomerProfilePanel } from '@/components/customers/CustomerProfilePanel'

interface Props {
  selected: Customer | null
  onSelect: (customer: Customer | null) => void
}

export function CustomerSearch({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showProfile, setShowProfile] = useState<'orders' | 'edit' | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  const { data: results, isLoading } = trpc.customers.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  )

  const handleSelect = useCallback((customer: Customer) => {
    onSelect(customer)
    setQuery('')
    setShowResults(false)
  }, [onSelect])

  const handleCreated = (customer: Customer) => {
    setShowCreate(false)
    setQuery('')
    setShowResults(false)
    onSelect(customer)
  }

  if (selected) {
    return (
      <>
        <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowProfile('orders')}
                className="font-medium text-gray-900 hover:text-brand-600 transition-colors text-left"
              >
                {selected.first_name} {selected.last_name}
              </button>
              <button
                onClick={() => setShowProfile('edit')}
                className="text-gray-400 hover:text-brand-600 transition-colors"
                aria-label="Edit customer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">{selected.phone ?? selected.email ?? 'No contact'}</p>
          </div>
          <button onClick={() => onSelect(null)} className="text-gray-400 hover:text-gray-600" aria-label="Remove customer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {showProfile && (
          <CustomerProfilePanel
            customerId={selected.id}
            onClose={() => setShowProfile(null)}
            initialTab={showProfile}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search customer by name or phone..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            className="pl-9 pr-9"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors text-lg font-medium leading-none"
            title="Create new customer"
          >
            +
          </button>
        </div>

        {showResults && debouncedQuery.length >= 2 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            {isLoading && (
              <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
            )}
            {!isLoading && results?.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">No customers found.</div>
            )}
            {results?.map((customer: Customer) => (
              <button
                key={customer.id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                onClick={() => handleSelect(customer as Customer)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {customer.first_name[0]}{customer.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {customer.first_name} {customer.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{customer.phone ?? customer.email}</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-brand-600 hover:bg-gray-50"
            >
              + Create new customer
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CustomerModal
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </>
  )
}
