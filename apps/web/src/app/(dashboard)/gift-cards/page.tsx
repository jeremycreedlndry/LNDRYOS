'use client'

import { useState, useRef } from 'react'
import { Search, CreditCard, User, UserPlus, Link2, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type LookupResult = Awaited<ReturnType<ReturnType<typeof trpc.prepaidCards.lookup.useQuery>['data']>> | undefined

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusPill(status: string) {
  if (status === 'active')   return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle className="h-3 w-3" />Active</span>
  if (status === 'inactive') return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"><XCircle className="h-3 w-3" />Inactive</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700"><AlertCircle className="h-3 w-3" />{status}</span>
}

// ─── Customer search picker ───────────────────────────────────────────────────

function CustomerPicker({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [q, setQ] = useState('')
  const { data: results } = trpc.customers.search.useQuery(
    { query: q, limit: 8 },
    { enabled: q.length >= 2 }
  )

  return (
    <div className="space-y-2">
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by name, phone or email…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      {results && results.length > 0 && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id, `${c.first_name} ${c.last_name}`)}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm"
            >
              <span className="font-medium text-gray-900">{c.first_name} {c.last_name}</span>
              {c.phone && <span className="ml-2 text-gray-400 text-xs">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && results?.length === 0 && (
        <p className="text-xs text-gray-400 px-1">No customers found.</p>
      )}
    </div>
  )
}

// ─── New customer mini-form ───────────────────────────────────────────────────

function NewCustomerForm({ onCreated }: { onCreated: (id: string, name: string) => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: (data) => {
      onCreated(data.id, `${data.first_name} ${data.last_name}`)
      toast.success('Customer created')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">First name *</label>
          <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Last name *</label>
          <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Phone *</label>
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="Required"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Email</label>
        <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="Optional"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <button
        type="button"
        disabled={!form.first_name || !form.last_name || !form.phone || createCustomer.isPending}
        onClick={() => createCustomer.mutate({
          first_name: form.first_name,
          last_name:  form.last_name,
          phone:      form.phone,
          email:      form.email || null,
        })}
        className="w-full rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {createCustomer.isPending ? 'Creating…' : 'Create & Link'}
      </button>
    </div>
  )
}

// ─── Lookup result card ───────────────────────────────────────────────────────

function LookupResultCard({ result, onLinked }: {
  result: NonNullable<LookupResult>
  onLinked: () => void
}) {
  const [mode, setMode] = useState<null | 'find' | 'create'>(null)

  const linkMutation = trpc.prepaidCards.linkToCustomer.useMutation({
    onSuccess: () => { toast.success('Card linked!'); onLinked(); setMode(null) },
    onError:   (e) => toast.error(e.message),
  })

  // ── Card found in our DB ──────────────────────────────────────────────────
  if (result.source === 'db') {
    const card     = result.card as typeof result.card & { customer: { id: string; first_name: string; last_name: string } | null }
    const customer = card.customer

    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <CreditCard className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">Card #</p>
              <p className="text-base font-bold text-gray-900 font-mono">{card.card_display_number}</p>
            </div>
          </div>
          {statusPill(card.status ?? 'active')}
        </div>

        {/* Balance */}
        <div className="rounded-lg bg-gray-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">Balance</span>
          <span className="text-2xl font-bold text-gray-900">{formatCurrency(card.balance_cents)}</span>
        </div>

        {/* Owner */}
        {customer ? (
          <div className="flex items-center gap-3 rounded-lg border border-gray-100 px-4 py-3">
            <User className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">Owner</p>
              <p className="text-sm font-semibold text-gray-900">{customer.first_name} {customer.last_name}</p>
            </div>
            <button
              type="button"
              onClick={() => { linkMutation.mutate({ card_id: card.id, customer_id: null }); onLinked() }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Unlink customer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
              <User className="h-4 w-4" />
              <span>No owner assigned</span>
            </div>

            {mode === null && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('find')}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Link2 className="h-4 w-4" />
                  Find Customer
                </button>
                <button
                  type="button"
                  onClick={() => setMode('create')}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <UserPlus className="h-4 w-4" />
                  New Customer
                </button>
              </div>
            )}

            {mode === 'find' && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Find Customer</p>
                  <button type="button" onClick={() => setMode(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                </div>
                <CustomerPicker onSelect={(customerId) => {
                  linkMutation.mutate({ card_id: card.id, customer_id: customerId })
                }} />
              </div>
            )}

            {mode === 'create' && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">New Customer</p>
                  <button type="button" onClick={() => setMode(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                </div>
                <NewCustomerForm onCreated={(customerId) => {
                  linkMutation.mutate({ card_id: card.id, customer_id: customerId })
                }} />
              </div>
            )}
          </div>
        )}

        {card.notes && (
          <p className="text-xs text-gray-400 italic">{card.notes}</p>
        )}
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3 text-sm text-red-600">
      <AlertCircle className="h-4 w-4 shrink-0" />
      Card not found. Check the number and try again.
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GiftCardsPage() {
  const [cardNumber, setCardNumber]   = useState('')
  const [lookupKey,  setLookupKey]    = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: lookupResult, isFetching: lookingUp } = trpc.prepaidCards.lookup.useQuery(
    { display_number: lookupKey ?? '' },
    { enabled: !!lookupKey }
  )

  const { data: allCards, refetch: refetchAll } = trpc.prepaidCards.listAll.useQuery()

  function handleLookup() {
    const num = cardNumber.trim()
    if (!num) return
    setLookupKey(num)
  }

  function handleLinked() {
    setLookupKey(null)
    setCardNumber('')
    refetchAll()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gift Cards</h1>
        <p className="text-sm text-gray-500 mt-0.5">Look up a card balance or manage ownership</p>
      </div>

      {/* Lookup */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Balance Check</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              value={cardNumber}
              onChange={e => { setCardNumber(e.target.value); setLookupKey(null) }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="Enter card display number…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <button
            type="button"
            onClick={handleLookup}
            disabled={!cardNumber.trim() || lookingUp}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {lookingUp ? 'Looking up…' : 'Look Up'}
          </button>
        </div>

        {lookupResult && (
          <LookupResultCard result={lookupResult} onLinked={handleLinked} />
        )}
      </div>

      {/* All cards table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">All Cards ({allCards?.length ?? 0})</h2>
        </div>
        {!allCards || allCards.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No gift cards yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card #</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allCards.map((card) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const customer = (card as any).customer as { id: string; first_name: string; last_name: string } | null
                return (
                  <tr
                    key={card.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setCardNumber(card.card_display_number); setLookupKey(card.card_display_number) }}
                  >
                    <td className="px-5 py-3 font-mono font-medium text-gray-900">{card.card_display_number}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{formatCurrency(card.balance_cents)}</td>
                    <td className="px-5 py-3">{statusPill(card.status ?? 'active')}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {customer
                        ? <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-gray-400" />{customer.first_name} {customer.last_name}</span>
                        : <span className="text-gray-400 italic">Unassigned</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
