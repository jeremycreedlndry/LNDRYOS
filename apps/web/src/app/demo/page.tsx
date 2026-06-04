'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { OrderCart, type CartLine } from '@/components/pos/OrderCart'
import { Search, UserPlus, Plus, Minus, Trash2, CreditCard, Banknote, CheckCircle, ShoppingCart, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'

const MOCK_ITEMS = [
  { id: '1', name: 'Wash & Fold', category: 'wash_fold', unit_price: 200, unit_label: 'lb' },
  { id: '2', name: 'Wash & Press Shirt', category: 'dry_clean', unit_price: 499, unit_label: 'item' },
  { id: '3', name: 'Dry Clean Jacket', category: 'dry_clean', unit_price: 1499, unit_label: 'item' },
  { id: '4', name: 'Dry Clean Pants', category: 'dry_clean', unit_price: 999, unit_label: 'item' },
  { id: '5', name: 'Dry Clean Dress', category: 'dry_clean', unit_price: 1799, unit_label: 'item' },
  { id: '6', name: 'Press Only Shirt', category: 'press_only', unit_price: 299, unit_label: 'item' },
  { id: '7', name: 'Press Only Pants', category: 'press_only', unit_price: 299, unit_label: 'item' },
  { id: '8', name: 'Alterations – Hem', category: 'alterations', unit_price: 1200, unit_label: 'item' },
  { id: '9', name: 'Alterations – Zipper', category: 'alterations', unit_price: 1500, unit_label: 'item' },
]

const CATEGORY_LABELS: Record<string, string> = {
  wash_fold: 'Wash & Fold', dry_clean: 'Dry Clean',
  press_only: 'Press Only', alterations: 'Alterations',
}
const CATEGORY_COLORS: Record<string, string> = {
  wash_fold: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  dry_clean: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
  press_only: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
  alterations: 'bg-green-50 border-green-200 hover:bg-green-100',
}

type PaymentStep = 'select' | 'cash_entry' | 'success'

export default function DemoPage() {
  const [cart, setCart] = useState<CartLine[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [showPayment, setShowPayment] = useState(false)
  const [payStep, setPayStep] = useState<PaymentStep>('select')
  const [payMethod, setPayMethod] = useState<'card' | 'cash'>('card')
  const [cashInput, setCashInput] = useState('')

  const filtered = activeCategory === 'all' ? MOCK_ITEMS : MOCK_ITEMS.filter(i => i.category === activeCategory)
  const categories = ['all', ...new Set(MOCK_ITEMS.map(i => i.category))]
  const subtotal = cart.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const total = subtotal
  const tendered = parseFloat(cashInput) * 100 || 0
  const change = tendered - total

  const addItem = useCallback((item: typeof MOCK_ITEMS[0]) => {
    setCart(prev => {
      const ex = prev.find(l => l.service_item_id === item.id)
      if (ex) return prev.map(l => l.key === item.id ? { ...l, quantity: l.quantity + (item.unit_label === 'lb' ? 0.5 : 1) } : l)
      return [...prev, { key: item.id, service_item_id: item.id, name: item.name, category: item.category as CartLine['category'], quantity: 1, unit_price: item.unit_price, unit_label: item.unit_label }]
    })
  }, [])

  const resetDemo = () => { setCart([]); setShowPayment(false); setPayStep('select'); setCashInput('') }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar tenantName="Main Street Cleaners" />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Demo mode</span>
            <span className="text-sm text-gray-400">No live data — for preview only</span>
          </div>
        </header>

        {/* POS body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: services */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 border-r border-gray-200">
            {/* Customer row */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input placeholder="Search customer by name or phone..." className="pl-9" readOnly />
                </div>
              </div>
            </div>

            {/* Category tabs */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services</p>
              <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      activeCategory === cat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                    {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {filtered.map(item => (
                  <button key={item.id} onClick={() => addItem(item)}
                    className={cn('relative flex flex-col items-start rounded-lg border p-3 text-left transition-colors', CATEGORY_COLORS[item.category] ?? 'bg-gray-50 border-gray-200 hover:bg-gray-100')}>
                    <Plus className="absolute right-2 top-2 h-4 w-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{CATEGORY_LABELS[item.category]}</span>
                    <span className="mt-1 text-sm font-semibold text-gray-900 leading-tight">{item.name}</span>
                    <span className="mt-1 text-sm font-bold text-gray-700">{formatCurrency(item.unit_price)}{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: cart */}
          <div className="flex w-[360px] shrink-0 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Order</h2>
              {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>}
            </div>

            <OrderCart
              lines={cart}
              taxRate={0}
              hasCustomer={true}
              onUpdateQuantity={(key, qty) => {
                if (qty <= 0) setCart(p => p.filter(l => l.key !== key))
                else setCart(p => p.map(l => l.key === key ? { ...l, quantity: qty } : l))
              }}
              onRemoveLine={(key) => setCart(p => p.filter(l => l.key !== key))}
              onCheckout={() => setShowPayment(true)}
              isSubmitting={false}
            />
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Payment</h2>

            {payStep === 'success' ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <h3 className="text-xl font-bold">Payment Complete</h3>
                {payMethod === 'cash' && change > 0 && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-6 py-4 text-center w-full">
                    <p className="text-sm text-yellow-700">Change Due</p>
                    <p className="text-3xl font-bold text-yellow-900">{formatCurrency(change)}</p>
                  </div>
                )}
                <Button onClick={resetDemo} size="lg" className="w-full">New Order</Button>
              </div>
            ) : payStep === 'cash_entry' ? (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">Amount Due</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</p>
                </div>
                <Input type="number" placeholder="0.00" value={cashInput} onChange={e => setCashInput(e.target.value)} className="text-xl h-14 text-center font-semibold" autoFocus />
                {tendered >= total && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center">
                    <p className="text-sm text-green-700">Change</p>
                    <p className="text-2xl font-bold text-green-900">{formatCurrency(change)}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {[total, Math.ceil(total/500)*500, Math.ceil(total/1000)*1000, 2000, 5000, 10000].map(amt => (
                    <button key={amt} onClick={() => setCashInput((amt/100).toFixed(2))}
                      className="rounded-md border border-gray-300 py-2 text-sm font-medium hover:bg-gray-50">
                      {formatCurrency(amt)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPayStep('select')} className="flex-1">Back</Button>
                  <Button disabled={tendered < total} onClick={() => setPayStep('success')} className="flex-1">Confirm</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">Total Due</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['card', 'cash'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={cn('flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors',
                        payMethod === m ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300')}>
                      {m === 'card' ? <CreditCard className="h-8 w-8 text-brand-600" /> : <Banknote className="h-8 w-8 text-brand-600" />}
                      <span className="font-medium text-gray-900">{m === 'card' ? 'Card' : 'Cash'}</span>
                    </button>
                  ))}
                </div>
                {payMethod === 'card' && (
                  <p className="text-sm text-amber-600 text-center">Connect a Stripe Terminal reader in Settings to accept cards.</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowPayment(false)} className="flex-1">Cancel</Button>
                  <Button onClick={() => payMethod === 'cash' ? setPayStep('cash_entry') : setPayStep('success')} className="flex-1">
                    {payMethod === 'card' ? 'Charge Card' : 'Enter Cash'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
