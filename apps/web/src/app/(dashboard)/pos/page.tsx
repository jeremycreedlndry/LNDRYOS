'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { X, ShoppingCart, ArrowLeft, Truck, Trash2, Pencil } from 'lucide-react'
import { CustomerSearch } from '@/components/pos/CustomerSearch'
import { ServiceGrid } from '@/components/pos/ServiceGrid'
import { OrderCart, type CartLine } from '@/components/pos/OrderCart'
import { FulfillmentModal, type FulfillmentValue } from '@/components/pos/FulfillmentModal'
import { useStation } from '@/components/station/StationProvider'
import { PaymentModal } from '@/components/pos/PaymentModal'
import { BagEntryModal } from '@/components/pos/BagEntryModal'
import { CustomItemModal } from '@/components/pos/CustomItemModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CancelOrderModal } from '@/components/orders/CancelOrderModal'
import { trpc } from '@/lib/trpc'
import { formatCurrency } from '@/lib/utils'
import { printBagLabels, printReceipt } from '@/lib/printJobs'
import type { Customer, ServiceItem, ItemCategory } from '@laundry/db'
import toast from 'react-hot-toast'

// ─── Gift card denomination prompt ───────────────────────────────────────────

const QUICK_AMOUNTS = [2500, 5000, 10000, 15000, 20000, 25000]

interface GiftCardConfirmPayload {
  item: ServiceItem
  amountCents: number
  cardDisplayNumber?: string
  cardUid?: string
}

function GiftCardPrompt({ item, onConfirm, onCancel }: {
  item: ServiceItem
  onConfirm: (payload: GiftCardConfirmPayload) => void
  onCancel: () => void
}) {
  const isPhysical = item.name.toLowerCase().includes('physical')
  const [value, setValue] = useState('')
  const [cardNumber, setCardNumber] = useState('')

  // Nayax card lookup — fires automatically when card number is 10 digits
  const {
    data: cardInfo,
    isFetching: cardLookingUp,
    error: cardError,
  } = trpc.nayax.lookupGiftCard.useQuery(
    { display_number: cardNumber },
    { enabled: isPhysical && cardNumber.replace(/\D/g, '').length === 10, retry: false }
  )

  const cents = Math.round(parseFloat(value) * 100) || 0
  const cardReady = !isPhysical || (cardInfo?.card_unique_identifier && !cardLookingUp)

  const confirm = () => {
    if (cents <= 0) { toast.error('Enter a valid amount'); return }
    if (isPhysical && !cardInfo?.card_unique_identifier) {
      toast.error('Enter a valid 10-digit card number first')
      return
    }
    onConfirm({
      item,
      amountCents: cents,
      cardDisplayNumber: cardInfo?.display_number,
      cardUid: cardInfo?.card_unique_identifier,
    })
  }

  const balanceLine = () => {
    if (!isPhysical) return null
    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length === 0) return null
    if (digits.length < 10) return (
      <p className="text-xs text-gray-400">{10 - digits.length} more digit{10 - digits.length !== 1 ? 's' : ''} needed</p>
    )
    if (cardLookingUp) return (
      <p className="text-xs text-gray-400 animate-pulse">Looking up card…</p>
    )
    if (cardError) return (
      <p className="text-xs text-red-500">Card not found — check the number and try again</p>
    )
    if (cardInfo) {
      const bal = cardInfo.balance_dollars
      return bal === null ? (
        <p className="text-xs text-green-600 font-medium">✓ Card verified</p>
      ) : bal === 0 ? (
        <p className="text-xs text-green-600 font-medium">✓ New card — $0.00 balance</p>
      ) : (
        <p className="text-xs text-amber-600 font-medium">
          ⚠ Card already has ${bal.toFixed(2)} loaded
        </p>
      )
    }
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Card number field — physical only */}
          {isPhysical && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card Number <span className="text-gray-400 font-normal">(10-digit number on card)</span>
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0000000000"
                className="h-11 text-center font-mono text-lg tracking-widest"
                autoFocus
              />
              <div className="mt-1 min-h-[1.25rem]">{balanceLine()}</div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              className="text-xl h-12 text-center font-semibold"
              autoFocus={!isPhysical}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
            />
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
            <Button onClick={confirm} disabled={cents <= 0 || !cardReady} className="flex-1">
              Add to order
            </Button>
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
          <OrderCart lines={lines} taxRate={taxRate} hasCustomer={hasCustomer}
            onUpdateQuantity={onUpdateQuantity} onRemoveLine={onRemoveLine}
            onCheckout={onCheckout} isSubmitting={isSubmitting} />
        </div>
        <div className="h-4" />
      </div>
    </div>
  )
}

// ─── POS inner (needs useSearchParams, wrapped in Suspense below) ─────────────

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysIso(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtShortDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

function POSInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editOrderId = searchParams.get('orderId')
  const isEditMode = !!editOrderId
  const preselectedCustomerId = searchParams.get('customer')

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [activePriceListId, setActivePriceListId] = useState<string | null>(null)
  const [cartLines, setCartLines] = useState<CartLine[]>([])
  const [activeCategory, setActiveCategory] = useState<ItemCategory>('wash_fold')
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [paymentOrderNumber, setPaymentOrderNumber] = useState<string | null>(null)
  const [orderTotal, setOrderTotal] = useState(0)
  const [giftCardPrompt, setGiftCardPrompt] = useState<ServiceItem | null>(null)
  const [bagEntryItem, setBagEntryItem] = useState<ServiceItem | null>(null)
  const [pendingPrefs, setPendingPrefs] = useState<Record<string, string> | null>(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [customItemOpen, setCustomItemOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cartDiscountCents, setCartDiscountCents] = useState(0)
  const [cartPromoCodeId, setCartPromoCodeId] = useState<string | undefined>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastCreatedOrder, setLastCreatedOrder] = useState<any>(null)

  // Order type: in_store | +delivery | +pickup | +both
  type OrderType = 'in_store' | 'delivery' | 'pickup' | 'both'
  const [orderType, setOrderType] = useState<OrderType>('in_store')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [pickupTimeEnd, setPickupTimeEnd] = useState('')
  const [deliveryTimeEnd, setDeliveryTimeEnd] = useState('')
  // "Ready by" / due date (date 2) — surfaced from settings default, editable in the modal
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false)

  const handleCartDiscountChange = (cents: number, promoCodeId?: string) => {
    setCartDiscountCents(cents)
    setCartPromoCodeId(promoCodeId)
  }

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

    // Pre-fill the fulfillment selector from the order's existing pending stops
    const stops = ((editOrder as { stops?: { type: string; status: string; scheduled_date: string; time_start: string | null; time_end: string | null }[] }).stops) ?? []
    const pendingPickup   = stops.find((s) => s.type === 'pickup'   && s.status === 'pending')
    const pendingDelivery = stops.find((s) => s.type === 'delivery' && s.status === 'pending')
    if (pendingPickup && pendingDelivery) setOrderType('both')
    else if (pendingPickup)               setOrderType('pickup')
    else if (pendingDelivery)             setOrderType('delivery')
    else                                  setOrderType('in_store')
    if (pendingPickup)   { setPickupDate(pendingPickup.scheduled_date);     setPickupTime(pendingPickup.time_start?.slice(0, 5) ?? '');     setPickupTimeEnd(pendingPickup.time_end?.slice(0, 5) ?? '') }
    if (pendingDelivery) { setDeliveryDate(pendingDelivery.scheduled_date); setDeliveryTime(pendingDelivery.time_start?.slice(0, 5) ?? ''); setDeliveryTimeEnd(pendingDelivery.time_end?.slice(0, 5) ?? '') }
    if ((editOrder as { due_date?: string }).due_date) setDueDate((editOrder as { due_date?: string }).due_date!)

    setInitialized(true)
  }, [editOrder, initialized])

  // Pre-select customer when navigating from /customers?customer=<id>
  const { data: preselectedCustomer } = trpc.customers.getById.useQuery(
    { id: preselectedCustomerId! },
    { enabled: !!preselectedCustomerId && !isEditMode }
  )
  useEffect(() => {
    if (preselectedCustomer && !customer) {
      setCustomer(preselectedCustomer as Customer)
      setActivePriceListId(preselectedCustomer.price_list_id ?? null)
    }
  }, [preselectedCustomer]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectCustomer = (c: Customer | null) => {
    setCustomer(c)
    setActivePriceListId(c?.price_list_id ?? null)
  }

  const { data: tenantSettings } = trpc.tenants.getCurrent.useQuery()
  const { hardware: stationHw } = useStation()
  const { data: myRole } = trpc.staff.myRole.useQuery()
  const canDelete = isEditMode && editOrder && editOrder.status !== 'cancelled'
  const utils = trpc.useUtils()
  const ensureGiftCards = trpc.catalog.ensureGiftCards.useMutation({
    onSuccess: () => utils.catalog.list.invalidate(),
  })
  useEffect(() => { ensureGiftCards.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const taxRate = (tenantSettings?.settings as { tax_rate?: number })?.tax_rate ?? 0
  const defaultDueDays = (tenantSettings?.settings as { default_due_days?: number })?.default_due_days ?? 2
  // "Ready by" date — what's set in the modal, else today + the store default
  const effectiveDueDate = dueDate || addDaysIso(isoToday(), defaultDueDays)

  // Apply the fulfillment modal's selection back into the POS state
  const applyFulfillment = (v: FulfillmentValue) => {
    setOrderType(v.type)
    if (v.type === 'pickup' || v.type === 'both') { setPickupDate(v.date1); setPickupTime(v.time1); setPickupTimeEnd(v.time1End) }
    else { setPickupDate(''); setPickupTime(''); setPickupTimeEnd('') }
    if (v.type === 'delivery' || v.type === 'both') { setDeliveryDate(v.date2); setDeliveryTime(v.time2); setDeliveryTimeEnd(v.time2End) }
    else { setDeliveryDate(''); setDeliveryTime(''); setDeliveryTimeEnd('') }
    // Date 2 is always the "out/ready" date → the order's due date
    setDueDate(v.date2); setDueTime(v.time2)
    setFulfillmentOpen(false)
  }

  // Summary shown on the POS button that opens the modal
  const fulfillmentSummary = (() => {
    const ready = fmtShortDate(effectiveDueDate)
    if (orderType === 'in_store') return `In-Store · Ready ${ready}`
    if (orderType === 'pickup')   return `Pickup ${fmtShortDate(pickupDate)} · Ready ${ready}`
    if (orderType === 'delivery') return `Delivery ${ready}`
    return `Pickup ${fmtShortDate(pickupDate)} · Delivery ${fmtShortDate(deliveryDate)}`
  })()

  const tenantDeliveryFee = (tenantSettings?.settings as { delivery_fee_cents?: number })?.delivery_fee_cents ?? 0
  // Effective delivery fee: customer override > tenant default; null on customer = use tenant default
  const customerDeliveryFee = customer
    ? (customer.delivery_fee_cents != null ? customer.delivery_fee_cents : tenantDeliveryFee)
    : 0

  const saveCustomerPrefs = trpc.customers.update.useMutation()
  const createStop = trpc.pickupStops.createOneOff.useMutation()
  const patchStop  = trpc.pickupStops.patchStop.useMutation()
  const skipStop   = trpc.pickupStops.updateStatus.useMutation()
  const createPickupOrder = trpc.orders.createPickup.useMutation()

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: (order) => {
      setPaymentOrderId(order.id as string)
      setPaymentOrderNumber(order.order_number as string)
      setOrderTotal(order.total_amount as number)
      setLastCreatedOrder(order)
      setMobileCartOpen(false)
      // Save order preferences back to customer profile so they persist
      if (customer?.id && pendingPrefs && Object.keys(pendingPrefs).length > 0) {
        saveCustomerPrefs.mutate({
          id: customer.id,
          order_preferences: {
            bleach:           pendingPrefs.bleach,
            dryer_sheets:     pendingPrefs.dryer_sheets,
            detergent_type:   pendingPrefs.detergent_type,
            fabric_softener:  pendingPrefs.fabric_softener,
            wash_temperature: pendingPrefs.wash_temperature,
          },
        })
      }
      setPendingPrefs(null)
      // Print bag labels if label printer configured
      const hw = stationHw as Record<string, unknown> | undefined
      const labelPrinter = (hw?.label_printer as Record<string, string> | undefined)?.name
      if (labelPrinter) {
        const storeName = tenantSettings?.name as string | undefined
        printBagLabels(labelPrinter, {
          order_number: order.order_number as string,
          customer_name: order.customer_name as string | null,
          lines: (order.lines as Array<{ name: string; category: string; notes?: string | null }>),
        }, storeName).catch((e) => console.warn('[label print]', e))
      }

      // Create pickup/delivery stops if order type requires them
      if (customer?.id && orderType !== 'in_store') {
        const stopBase = { customer_id: customer.id, order_id: order.id as string }
        if (orderType === 'pickup' || orderType === 'both') {
          createStop.mutate({ ...stopBase, type: 'pickup', scheduled_date: pickupDate || (order.due_date as string), time_start: pickupTime || null, time_end: pickupTimeEnd || null })
        }
        if (orderType === 'delivery' || orderType === 'both') {
          createStop.mutate({ ...stopBase, type: 'delivery', scheduled_date: deliveryDate || (order.due_date as string), time_start: deliveryTime || null, time_end: deliveryTimeEnd || null })
        }
      }
    },
    onError: (e) => toast.error(e.message),
  })

  const updateOrder = trpc.orders.updateOrder.useMutation({
    onError: (e) => toast.error(e.message),
  })

  // Reconcile pickup/delivery stops on an existing order to match the selected order type.
  // Adds a newly-wanted stop, patches date/time on an existing one, or skips one no longer wanted.
  const reconcileStops = async (orderId: string, customerId: string) => {
    const stops = ((editOrder as { stops?: { id: string; type: string; status: string; scheduled_date: string; time_start: string | null }[] })?.stops) ?? []
    const pendingPickup   = stops.find((s) => s.type === 'pickup'   && s.status === 'pending')
    const pendingDelivery = stops.find((s) => s.type === 'delivery' && s.status === 'pending')
    const wantPickup   = orderType === 'pickup'   || orderType === 'both'
    const wantDelivery = orderType === 'delivery' || orderType === 'both'
    const fallbackDate = ((editOrder as { due_date?: string })?.due_date) || new Date().toISOString().split('T')[0]

    // Pickup
    if (wantPickup && !pendingPickup) {
      await createStop.mutateAsync({ customer_id: customerId, order_id: orderId, type: 'pickup', scheduled_date: pickupDate || fallbackDate, time_start: pickupTime || null, time_end: pickupTimeEnd || null })
    } else if (wantPickup && pendingPickup) {
      await patchStop.mutateAsync({ id: pendingPickup.id, scheduled_date: pickupDate || pendingPickup.scheduled_date, time_start: pickupTime || null, time_end: pickupTimeEnd || null })
    } else if (!wantPickup && pendingPickup) {
      await skipStop.mutateAsync({ id: pendingPickup.id, status: 'skipped' })
    }

    // Delivery
    if (wantDelivery && !pendingDelivery) {
      await createStop.mutateAsync({ customer_id: customerId, order_id: orderId, type: 'delivery', scheduled_date: deliveryDate || fallbackDate, time_start: deliveryTime || null, time_end: deliveryTimeEnd || null })
    } else if (wantDelivery && pendingDelivery) {
      await patchStop.mutateAsync({ id: pendingDelivery.id, scheduled_date: deliveryDate || pendingDelivery.scheduled_date, time_start: deliveryTime || null, time_end: deliveryTimeEnd || null })
    } else if (!wantDelivery && pendingDelivery) {
      await skipStop.mutateAsync({ id: pendingDelivery.id, status: 'skipped' })
    }
  }

  const loadGiftCard = trpc.nayax.loadGiftCard.useMutation()

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

  const handleGiftCardConfirm = useCallback(({ item, amountCents, cardDisplayNumber, cardUid }: GiftCardConfirmPayload) => {
    const key = `${item.id}-${Date.now()}`
    setCartLines((prev) => [...prev, {
      key,
      service_item_id: item.id,
      name: item.name,
      category: item.category as ItemCategory,
      quantity: 1,
      unit_price: amountCents,
      unit_label: 'item',
      ...(cardDisplayNumber ? { notes: `Card: ${cardDisplayNumber}` } : {}),
      gift_card_display_number: cardDisplayNumber,
      gift_card_uid: cardUid,
    }])
    setGiftCardPrompt(null)
  }, [])

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

  const handleCheckout = useCallback(async () => {
    if (isEditMode && editOrderId) {
      await updateOrder.mutateAsync({
        id: editOrderId,
        customer_id: customer?.id ?? null,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : null,
        lines: buildLines(),
        tax_rate: taxRate,
        delivery_fee_cents: customerDeliveryFee,
        due_date: effectiveDueDate,
      })
      if (customer?.id) {
        try { await reconcileStops(editOrderId, customer.id) }
        catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update delivery/pickup') }
      }
      utils.orders.list.invalidate()
      toast.success('Order updated')
      router.push('/orders')
    } else if (cartLines.length === 0 && (orderType === 'pickup' || orderType === 'both') && customer?.id) {
      // Empty pickup: no items yet (laundry not collected) → create a $0 pending
      // "Detail" order + scheduled stops; it gets weighed when it arrives.
      const today = new Date().toISOString().split('T')[0]
      try {
        const order = await createPickupOrder.mutateAsync({
          customer_id: customer.id,
          scheduled_date: pickupDate || today,
          skip_stop: true,
        })
        await createStop.mutateAsync({
          customer_id: customer.id, order_id: order.id as string, type: 'pickup',
          scheduled_date: pickupDate || today, time_start: pickupTime || null, time_end: pickupTimeEnd || null,
        })
        if (orderType === 'both') {
          await createStop.mutateAsync({
            customer_id: customer.id, order_id: order.id as string, type: 'delivery',
            scheduled_date: deliveryDate || today, time_start: deliveryTime || null, time_end: deliveryTimeEnd || null,
          })
        }
        utils.orders.list.invalidate()
        toast.success('Pickup order created — sent to Detail')
        setCartLines([]); setCustomer(null); setOrderType('in_store')
        setPickupDate(''); setPickupTime(''); setDeliveryDate(''); setDeliveryTime('')
        setPickupTimeEnd(''); setDeliveryTimeEnd('')
        setDueDate(''); setDueTime('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create pickup order')
      }
    } else {
      createOrder.mutate({
        customer_id: customer?.id ?? null,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : null,
        lines: buildLines(),
        tax_rate: taxRate,
        due_date: effectiveDueDate,
        delivery_fee_cents: customerDeliveryFee,
      })
    }
  }, [customer, cartLines, taxRate, createOrder, updateOrder, createPickupOrder, createStop, isEditMode, editOrderId, orderType, pickupDate, pickupTime, pickupTimeEnd, deliveryDate, deliveryTime, deliveryTimeEnd, dueDate, effectiveDueDate, editOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaymentComplete = useCallback(async () => {
    // Load funds onto any physical gift cards in the order
    const physicalGiftCards = cartLines.filter(
      (l) => l.category === 'gift_card' && l.gift_card_uid
    )
    for (const line of physicalGiftCards) {
      const amountCents = Math.round(line.quantity * line.unit_price)
      try {
        const result = await loadGiftCard.mutateAsync({
          card_unique_identifier: line.gift_card_uid!,
          amount_cents: amountCents,
          order_number: paymentOrderNumber ?? undefined,
        })
        const newBal = result.new_balance_dollars != null
          ? ` — new balance $${result.new_balance_dollars.toFixed(2)}`
          : ''
        toast.success(`Gift card loaded: $${(amountCents / 100).toFixed(2)}${newBal}`)
      } catch (err) {
        toast.error(
          `Payment taken but gift card load failed — please load manually.\n` +
          `Card: ${line.gift_card_display_number}, Amount: $${(amountCents / 100).toFixed(2)}`
        )
        console.error('[gift card load]', err)
      }
    }

    // Print receipt if receipt printer configured
    const hw = stationHw as Record<string, unknown> | undefined
    const receiptPrinter = (hw?.receipt_printer as Record<string, string> | undefined)?.name
    if (receiptPrinter && lastCreatedOrder) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr = (tenantSettings as any)?.address as Record<string, string> | undefined
      printReceipt(receiptPrinter, {
        order_number:   lastCreatedOrder.order_number,
        customer_name:  lastCreatedOrder.customer_name,
        customer_phone: customer?.phone ?? null,
        lines:          lastCreatedOrder.lines ?? [],
        total_amount:   lastCreatedOrder.total_amount,
        tax_rate:       taxRate,
        due_date:       lastCreatedOrder.due_date ?? null,
      }, {
        name:       tenantSettings?.name as string | undefined,
        address:    addr?.street ?? null,
        cityPostal: addr ? [addr.city, addr.postal_code].filter(Boolean).join(', ') : null,
        phone:      (tenantSettings?.settings as Record<string, unknown> | null)?.phone as string ?? null,
      }, (myRole as Record<string, unknown> | undefined)?.display_name as string ?? null)
        .catch((e) => console.warn('[receipt print]', e))
    }

    setPaymentOrderId(null)
    setPaymentOrderNumber(null)
    setCartLines([])
    setCustomer(null)
    setLastCreatedOrder(null)
    setOrderType('in_store')
    setDeliveryDate(''); setDeliveryTime(''); setPickupDate(''); setPickupTime('')
    setPickupTimeEnd(''); setDeliveryTimeEnd('')
    setDueDate(''); setDueTime('')
    if (physicalGiftCards.length === 0) toast.success('Order complete!')
  }, [cartLines, paymentOrderNumber, loadGiftCard, lastCreatedOrder, tenantSettings, taxRate])

  const cartSubtotal = cartLines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const cartTaxableSubtotal = cartLines
    .filter((l) => l.category !== 'gift_card')
    .reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const cartTotal = cartSubtotal + Math.round(cartTaxableSubtotal * taxRate)
  const cartItemCount = cartLines.reduce((s, l) => s + (l.unit_label === 'lb' ? 1 : l.quantity), 0)
  const isSubmitting = createOrder.isPending || updateOrder.isPending || createPickupOrder.isPending || createStop.isPending
  // A pickup with no items yet → allow a $0 pending "Detail" order (weighed after pickup)
  const isEmptyPickup = !isEditMode && cartLines.length === 0 && (orderType === 'pickup' || orderType === 'both')

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
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Customer</h2>
            <CustomerSearch selected={customer} onSelect={handleSelectCustomer} />
          </div>

          {/* Fulfillment — type + dates, edited in a modal */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Fulfillment</h2>
            <button
              onClick={() => setFulfillmentOpen(true)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:border-brand-300 hover:bg-brand-50/40"
            >
              <span className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-500" />
                {fulfillmentSummary}
              </span>
              <Pencil className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Services</h2>
            <ServiceGrid onAddItem={handleAddItem} onCustomItem={() => setCustomItemOpen(true)}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory} priceListId={activePriceListId} />
          </div>
        </div>

        <div className="flex w-[360px] shrink-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {isEditMode ? 'Updated Order' : 'Order'}
            </h2>
            <div className="flex items-center gap-2">
              {canDelete && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
              {cartLines.length > 0 && (
                <button onClick={() => setCartLines([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
              )}
            </div>
          </div>
          <OrderCart lines={cartLines} taxRate={taxRate}
            hasCustomer={!!customer} customerId={customer?.id ?? null}
            deliveryFeeCents={isEmptyPickup ? 0 : customerDeliveryFee}
            allowEmpty={isEmptyPickup}
            onUpdateQuantity={handleUpdateQty}
            onRemoveLine={(key) => setCartLines((prev) => prev.filter((l) => l.key !== key))}
            onCheckout={handleCheckout} isSubmitting={isSubmitting}
            checkoutLabel={isEditMode ? 'Save Changes' : isEmptyPickup ? 'Create Pickup Order' : undefined}
            onDiscountChange={handleCartDiscountChange} />
        </div>
      </div>

      {/* ── Mobile layout ───────────────────────────────────────────────────── */}
      <div className="flex lg:hidden flex-col h-[calc(100dvh-4rem-4rem)]">
        <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20">
          <CustomerSearch selected={customer} onSelect={handleSelectCustomer} />
          <button
            onClick={() => setFulfillmentOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:border-brand-300"
          >
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-500" />
              {fulfillmentSummary}
            </span>
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <ServiceGrid onAddItem={handleAddItem} onCustomItem={() => setCustomItemOpen(true)}
            activeCategory={activeCategory}
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

      {fulfillmentOpen && (
        <FulfillmentModal
          defaultDueDays={defaultDueDays}
          initial={{
            type: orderType,
            date1: (orderType === 'pickup' || orderType === 'both') ? pickupDate : isoToday(),
            time1: pickupTime,
            time1End: pickupTimeEnd,
            date2: (orderType === 'delivery' || orderType === 'both') ? deliveryDate : effectiveDueDate,
            time2: (orderType === 'delivery' || orderType === 'both') ? deliveryTime : dueTime,
            time2End: deliveryTimeEnd,
          }}
          onApply={applyFulfillment}
          onClose={() => setFulfillmentOpen(false)}
        />
      )}

      {mobileCartOpen && (
        <MobileCartSheet lines={cartLines} taxRate={taxRate} hasCustomer={!!customer}
          isSubmitting={isSubmitting} onUpdateQuantity={handleUpdateQty}
          onRemoveLine={(key) => setCartLines((prev) => prev.filter((l) => l.key !== key))}
          onCheckout={handleCheckout} onClearAll={() => setCartLines([])}
          onClose={() => setMobileCartOpen(false)} />
      )}

      {bagEntryItem && (
        <BagEntryModal item={bagEntryItem} customerId={customer?.id ?? null}
          onSubmit={(lines, prefs) => {
            setCartLines((prev) => [...prev, ...lines])
            if (Object.keys(prefs).length > 0) setPendingPrefs(prefs)
            setBagEntryItem(null)
          }}
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
              discountCents={cartDiscountCents} promoCodeId={cartPromoCodeId}
              customer={customer}
              excludeMethods={[
                // Can't pay for a gift card purchase with another gift card
                ...(cartLines.some(l => l.category === 'gift_card') ? ['prepaid_card' as const] : []),
                // Gift cards and products are fulfilled instantly — "pay later" makes no sense
                ...(cartLines.length > 0 && cartLines.every(l => ['gift_card', 'product'].includes(l.category))
                  ? ['pay_on_collection' as const]
                  : []),
              ]}
              onComplete={handlePaymentComplete} onCancel={() => setPaymentOrderId(null)} />
          </div>
        </div>
      )}


      {showCancelModal && editOrderId && editOrder && (
        <CancelOrderModal
          orderId={editOrderId}
          orderNumber={editOrder.order_number as string}
          onClose={() => setShowCancelModal(false)}
          onCancelled={() => router.push('/orders')}
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
