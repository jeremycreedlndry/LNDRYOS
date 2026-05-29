import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer, CORS_HEADERS } from '../_lib/auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * POST /api/customer/book
 *
 * Body:
 * {
 *   tier: 'basic' | 'standard' | 'premium'
 *   bag_count: number
 *   preferences: { wash_temp, bleach, dryer_sheets, detergent_type, fabric_softener, dryer_heat }
 *   pickup_date: 'YYYY-MM-DD'
 *   pickup_time_start: 'HH:MM'
 *   pickup_time_end:   'HH:MM'
 *   delivery_date: 'YYYY-MM-DD'
 *   delivery_time_start: 'HH:MM'
 *   delivery_time_end:   'HH:MM'
 *   notes?: string
 * }
 */
export async function POST(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response

  if (!ctx.customer) {
    return NextResponse.json({ error: 'Customer profile not found. Please complete your profile first.' }, { status: 400, headers: CORS_HEADERS })
  }

  const body = await req.json()
  const {
    tier,
    bag_count,
    preferences,
    pickup_date,
    pickup_time_start,
    pickup_time_end,
    delivery_date,
    delivery_time_start,
    delivery_time_end,
    notes,
  } = body

  const customerId = (ctx.customer as { id: string }).id

  // Resolve delivery fee for this customer
  const deliveryFeeCents = (ctx.customer as { delivery_fee_cents?: number | null }).delivery_fee_cents
  let resolvedDeliveryFee = 0
  if (deliveryFeeCents != null) {
    resolvedDeliveryFee = deliveryFeeCents
  } else {
    const { data: tenant } = await ctx.supabase
      .from('tenants')
      .select('settings')
      .eq('id', ctx.tenantId)
      .maybeSingle()
    resolvedDeliveryFee = (tenant?.settings as { delivery_fee_cents?: number })?.delivery_fee_cents ?? 0
  }

  // Generate order number
  const { data: lastOrder } = await ctx.supabase
    .from('orders')
    .select('order_number')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextNum = 1
  if (lastOrder?.order_number) {
    const match = (lastOrder.order_number as string).match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const orderNumber = `ORD-${String(nextNum).padStart(5, '0')}`

  // Build order notes from tier + preferences
  const tierLabel = tier === 'basic' ? 'Basic Wash & Fold' : tier === 'standard' ? 'Standard Wash & Fold' : 'Premium Wash & Fold'
  const prefNotes = preferences
    ? Object.entries(preferences as Record<string, unknown>)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(', ')
    : ''
  const orderNotes = [tierLabel, bag_count ? `${bag_count} bag${bag_count > 1 ? 's' : ''}` : '', prefNotes, notes]
    .filter(Boolean).join(' · ')

  // Create order
  const { data: order, error: orderError } = await ctx.supabase
    .from('orders')
    .insert({
      tenant_id: ctx.tenantId,
      order_number: orderNumber,
      customer_id: customerId,
      // Customer's auth user ID is a valid auth.users reference — marks order as
      // self-booked vs staff-created. created_by is NOT NULL in the schema.
      created_by: ctx.authUserId,
      status: 'pending',
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      delivery_fee_cents: resolvedDeliveryFee,
      total_amount: resolvedDeliveryFee,
      notes: orderNotes || null,
    })
    .select('id, order_number')
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500, headers: CORS_HEADERS })

  // Save preferences back to customer profile
  if (preferences) {
    const prefMap: Record<string, string> = {
      wash_temp:       'pref_wash_temperature',
      bleach:          'pref_bleach',
      dryer_sheets:    'pref_dryer_sheets',
      detergent_type:  'pref_detergent_type',
      fabric_softener: 'pref_fabric_softener',
    }
    const prefUpdates: Record<string, string> = {}
    for (const [key, col] of Object.entries(prefMap)) {
      if ((preferences as Record<string, string>)[key]) {
        prefUpdates[col] = (preferences as Record<string, string>)[key]
      }
    }
    if (Object.keys(prefUpdates).length > 0) {
      await ctx.supabase.from('customers').update(prefUpdates).eq('id', customerId).eq('tenant_id', ctx.tenantId)
    }
  }

  // Create pickup stop (source=customer_app, approved_at=null until staff approves)
  const { data: pickupStop, error: pickupError } = await ctx.supabase
    .from('pickup_stops')
    .insert({
      tenant_id: ctx.tenantId,
      customer_id: customerId,
      order_id: order.id,
      type: 'pickup',
      status: 'pending',
      source: 'customer_app',
      scheduled_date: pickup_date,
      time_start: pickup_time_start ?? null,
      time_end: pickup_time_end ?? null,
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (pickupError) return NextResponse.json({ error: pickupError.message }, { status: 500, headers: CORS_HEADERS })

  // Create delivery stop
  await ctx.supabase
    .from('pickup_stops')
    .insert({
      tenant_id: ctx.tenantId,
      customer_id: customerId,
      order_id: order.id,
      type: 'delivery',
      status: 'pending',
      source: 'customer_app',
      scheduled_date: delivery_date,
      time_start: delivery_time_start ?? null,
      time_end: delivery_time_end ?? null,
    })

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number,
    pickup_stop_id: pickupStop.id,
  }, { status: 201, headers: CORS_HEADERS })
}
