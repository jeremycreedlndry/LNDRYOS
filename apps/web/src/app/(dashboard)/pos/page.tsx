'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { X, ShoppingCart, ArrowLeft, Truck, Plus } from 'lucide-react'
import { CustomerSearch } from '@/components/pos/CustomerSearch'
import { ServiceGrid } from '@/components/pos/ServiceGrid'
import { OrderCart, type CartLine } from '@/components/pos/OrderCart'
import { PaymentModal } from '@/components/pos/PaymentModal'
import { BagEntryModal } from '@/components/pos/BagEntryModal'
import { SchedulePickupModal } from '@/components/pos/SchedulePickupModal'
import { CustomItemModal } from '@/components/pos/CustomItemModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import type { Customer, ServiceItem, ItemCategory } from '@laundry/db'
import toast from 'react-hot-toast'

// ─── Gift card denomination prompt ───────────────────────────────────────────

const QUICK_AMOUNTS = [2500, 5000, 10000, 15000, 20000, 25000]

function GiftCardPrompt({ item, onConfirm, onCancel }: {
  item: ServiceItem
  onConfirm: (item: ServiceItem, amountCents: number) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const cents = Math.round(parseFloat(value) * 100) || 0
  const confirm = () => {
    if (cents <= 0) { toast.error('Enter a valid amount'); return }
    onConfirm(item, cents)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <Input type="number" inputMode="decimal" step="0.01" min="1" value={value}
              onChange={(e) => setValue(e.target.value)} placeholder="0.00"
              className="text-xl h-12 text-center font-semibold" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && confirm()} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button key={amt} onClick={() => setValue((amt / 100).toFixed(2))}
                className="rounded-lg border border-gray-200 py-2 text-sm font-medium hover:bg-gray-50">
                ${amt / 100}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={confirm} disabled={cents <= 0} className="flex-1">Add to order</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile cart sheet ────────────────────────────────────────────────────────

function MobileCartSheet({ lines, taxRate, hasCustomer, isSubmitting, onUpdateQuantity, onRemoveLine, onCheckout, onClearAll, onClose }: {
  lines: CartLine[]
  taxRate: number
  hasCustomer: boolean
  isSubmitting: boolean
  onUpdateQuantity: (key: string, qty: number) => void
  onRemoveLine: (key: string) => void
  onCheckout: () => void
  onClearAll: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-3">
          <h2 className="text-base font-semibold text-gray-900">Order</h2>
          <div className="flex items-center gap-3">
            {lines.length > 0 && (
              <button onClick={onClearAll} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          <OrderCart lines={lines} taxRate={taxRate} discountCents={0} hasCustomer={hasCustomer}
            onUpdateQuantity={onUpdateQuantity} onRemoveLine={onRemoveLine}
            onCheckout={onCheckout} isSubmitting={isSubmitting} />
        </div>
        <div className="h-4" />
      </div>
    </div>
  )
}

// ─── POS inner (needs useSearchParams, wrapped in Suspense below) ─────────────

function POSInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editOrderId = searchParams.get('orderId')
  const isEditMode = !!editOrderId

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [activePriceListId, setActivePriceListId] = useState<string | null>(null)
  const [cartLines, setCartLines] = useState<CartLine[]>([])
  const [activeCategory, setActiveCategory] = useState<ItemCategory>('wash_fold')
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [orderTotal, setOrderTotal] = useState(0)
  const [giftCardPrompt, setGiftCardPrompt] = useState<ServiceItem | null>(null)
  const [bagEntryItem, setBagEntryItem] = useState<ServiceItem | null>(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [schedulePickupOpen, setSchedulePickupOpen] = useState(false)
  const [customItemOpen, setCustomItemOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Load existing order when in edit mode
  const { data: editOrder } = trpc.orders.getById.useQuery(
    { id: editOrderId! },
    { enabled: isEditMode }
  )

  useEffect(() => {
    if (!editOrder || initialized) return
    const lines = (editOrder.lines as {
      id: string; service_item_id: string | null; name: string
      category: string; quantity: number; unit_price: number
      unit_label?: string; notes?: string | null
    }[]).map((l) => ({
      key: l.id,
      service_item_id: l.service_item_id ?? '',
      name: l.name,
      category: l.category as ItemCategory,
      quantity: l.quantity,
      unit_price: l.unit_price,
      unit_label: l.unit_label ?? 'item',
      notes: l.notes ?? undefined,
    }))
    setCartLines(lines)
    if (editOrder.customer) setCustomer(editOrder.customer as Customer)
    setInitialized(true)
  }, [editOrder, initialized])

  const handleSelectCustomer = (c: Customer | null) => {
    setCustomer(c)
    setActivePriceListId(c?.price_list_id ?? null)
  }

  const { data: tenantSettings } = trpc.tenants.getCurrent.useQuery()
  const utils = trpc.useUtils()
  const ensureGiftCards = trpc.catalog.ensureGiftCards.useMutation({
    onSuccess: () => utils.catalog.list.invalidate(),
  })
  useEffect(() => { ensureGiftCards.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const taxRate = (tenantSettings?.settings as { tax_rate?: number })?.tax_rate ?? 0

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: (order) => {
      setPaymentOrderId(order.id as string)
      setOrderTotal(order.total_amount as number)
      setMobileCartOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const updateOrder = trpc.orders.updateOrder.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate()
      toast.success('Order updated')
      router.push('/orders')
    },
    onError: (e) => toast.error(e.message),
  })

  const addToCart = useCallback((item: ServiceItem, overridePrice?: number) => {
    const unit_price = overridePrice ?? item.unit_price
    const key = overridePrice ? `${item.id}-${Date.now()}` : item.id
    setCartLines((prev) => {
      if (overridePrice !== undefined) {
        return [...prev, { key, service_item_id: item.id, name: item.name, category: item.category as ItemCategory, quantity: 1, unit_price, unit_label: 'item' }]
      }
      const existing = prev.find((l) => l.service_item_id === item.id)
      if (existing) {
        const increment = item.unit_label === 'lb' ? 0.5 : 1
        return prev.map((l) => l.service_item_id === item.id ? { ...l, quantity: l.quantity + increment } : l)
      }
      return [...prev, { key, service_item_id: item.id, name: item.name, category: item.category as ItemCategory, quantity: 1, unit_price, unit_label: item.unit_label }]
    })
  }, [])

  const handleAddItem = useCallback((item: ServiceItem) => {
    if (item.category === 'gift_card') { setGiftCardPrompt(item); return }
    if (item.category === 'wash_fold') { setBagEntryItem(item); return }
    addToCart(item)
  }, [addToCart])

  const handleGiftCardConfirm = useCallback((item: ServiceItem, amountCents: number) => {
    addToCart(item, amountCents)
    setGiftCardPrompt(null)
  }, [addToCart])

  const handleUpdateQty = useCallback((key: string, qty: number) => {
    if (qty <= 0) setCartLines((prev) => prev.filter((l) => l.key !== key))
    else setCartLines((prev) => prev.map((l) => l.key === key ? { ...l, quantity: qty } : l))
  }, [])

  const buildLines = () => cartLines.map((l) => ({
    service_item_id: l.service_item_id || null,
    name: l.name,
    category: l.category,
    quantity: l.quantity,
    unit_price: l.unit_price,
    unit_label: l.unit_label,
    notes: l.notes ?? null,
  }))

  const handleCheckout = useCallback(() => {
    if (isEditMode && editOrderId) {
      updateOrder.mutate({
        id: editOrderId,
        customer_id: customer?.id ?? null,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : null,
        lines: buildLines(),
        tax_rate: taxRate,
      })
    } else {
      createOrder.mutate({
        customer_id: customer?.id ?? null,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : null,
        lines: buildLines(),
        tax_rate: taxRate,
      })
    }
  }, [customer, cartLines, taxRate, createOrder, updateOrder, isEditMode, editOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaymentComplete = useCallback(() => {
    setPaymentOrderId(null)
    setCartLines([])
    setCustomer(null)
    toast.success('Order complete!')
  }, [])

  const cartSubtotal = cartLines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const cartTotal = cartSubtotal + Math.round(cartSubtotal * taxRate)
  const cartItemCount = cartLines.reduce((s, l) => s + (l.unit_label === 'lb' ? 1 : l.quantity), 0)
  const isSubmitting = createOrder.isPending || updateOrder.isPending

  return (
    <>
      {/* Edit mode banner */}
      {isEditMode && editOrder && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-800">
              Editing {(editOrder as { order_number: string }).order_number}
            </span>
            <span className="text-xs text-amber-600">— changes replace the existing order</span>
          </div>
          <button onClick={() => router.push('/orders')} className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Orders
          </button>
        </div>
      )}

      {/* ── Desktop layout ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex h-[calc(100vh-4rem)] gap-0" style={isEditMode ? { height: 'calc(100vh - 4rem - 2.25rem)' } : {}}>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 border-r border-gray-200">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</h2>
              {!isEditMode && (
                <button
                  onClick={() => setSchedulePickupOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Truck className="h-3.5 w-3.5" />
                  Schedule Pickup
                </button>
              )}
            </div>
            <CustomerSearch selected={customer} onSelect={handleSelectCustomer} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Services</h2>
              <button
                onClick={() => setCustomItemOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Custom item
              </button>
            </div>
            <ServiceGrid onAddItem={handleAddItem} activeCategory={activeCategory}
              onCategoryChange={setActiveCategory} priceListId={activePriceListId} />
          </div>
        </div>

        <div className="flex w-[360px] shrink-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {isEditMode ? 'Updated Order' : 'Order'}
            </h2>
            {cartLines.length > 0 && (
              <button onClick={() => setCartLines([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
            )}
          </div>
          <OrderCart lines={cartLines} taxRate={taxRate} discountCents={0}
            hasCustomer={!!customer} onUpdateQuantity={handleUpdateQty}
            onRemoveLine={(key) => setCartLines((prev) => prev.filter((l) => l.key !== key))}
            onCheckout={handleCheckout} isSubmitting={isSubmitting}
            checkoutLabel={isEditMode ? 'Save Changes' : undefined} />
        </div>
      </div>

      {/* ── Mobile layout ───────────────────────────────────────────────────── */}
      <div className="flex lg:hidden flex-col h-[calc(100dvh-4rem-4rem)]">
        <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20">
          {!isEditMode && (
            <div className="flex gap-2">
              <button
                onClick={() => setSchedulePickupOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                <Truck className="h-4 w-4" />
                Schedule Pickup
              </button>
              <button
                onClick={() => setCustomItemOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                Custom Item
              </button>
            </div>
          )}
          <CustomerSearch selected={customer} onSelect={handleSelectCustomer} />
          <ServiceGrid onAddItem={handleAddItem} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} priceListId={activePriceListId} />
        </div>
        <div className="fixed bottom-16 inset-x-0 z-30 px-3 pb-2">
          <button onClick={() => setMobileCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-4 py-3 shadow-lg">
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart className="h-5 w-5 text-white" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand-600">
                    {cartItemCount}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-white">
                {isEditMode ? 'Updated order' : cartLines.length === 0 ? 'No items yet' : `${cartLines.length} line${cartLines.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <span className="text-sm font-bold text-white">{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      </div>

      {mobileCartOpen && (
        <MobileCartSheet lines={cartLines} taxRate={taxRate} hasCustomer={!!customer}
          isSubmitting={isSubmitting} onUpdateQuantity={handleUpdateQty}
          onRemoveLine={(key) => setCartLines((prev) => prev.filter((l) => l.key !== key))}
          onCheckout={handleCheckout} onClearAll={() => setCartLines([])}
          onClose={() => setMobileCartOpen(false)} />
      )}

      {bagEntryItem && (
        <BagEntryModal item={bagEntryItem}
          onSubmit={(lines) => { setCartLines((prev) => [...prev, ...lines]); setBagEntryItem(null) }}
          onCancel={() => setBagEntryItem(null)} />
      )}

      {giftCardPrompt && (
        <GiftCardPrompt item={giftCardPrompt} onConfirm={handleGiftCardConfirm}
          onCancel={() => setGiftCardPrompt(null)} />
      )}

      {paymentOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Payment</h2>
            <PaymentModal orderId={paymentOrderId} totalCents={orderTotal}
              customer={customer} onComplete={handlePaymentComplete} onCancel={() => setPaymentOrderId(null)} />
          </div>
        </div>
      )}

      {schedulePickupOpen && (
        <SchedulePickupModal
          onClose={() => setSchedulePickupOpen(false)}
        />
      )}

      {customItemOpen && (
        <CustomItemModal
          onAdd={(line) => setCartLines((prev) => [...prev, line])}
          onClose={() => setCustomItemOpen(false)}
        />
      )}
    </>
  )
}

// ─── Page (Suspense required for useSearchParams) ─────────────────────────────

export default function POSPage() {
  return (
    <Suspense fallback={null}>
      <POSInner />
    </Suspense>
  )
}
