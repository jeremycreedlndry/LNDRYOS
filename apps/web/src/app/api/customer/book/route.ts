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

  // Backfill blank name from auth user metadata so the request card shows
  // the customer's name immediately (without waiting for GET /me to self-heal)
  if (!(ctx.customer as { first_name?: string }).first_name) {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (token) {
      const { data: { user: authUser } } = await ctx.supabase.auth.getUser(token)
      const fullName = (authUser?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim()
      if (fullName) {
        const parts = fullName.split(' ')
        await ctx.supabase
          .from('customers')
          .update({ first_name: parts[0], last_name: parts.slice(1).join(' ') })
          .eq('id', customerId)
          .eq('tenant_id', ctx.tenantId)
      }
    }
  }

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

  // Build order notes from tier + bag count + any customer-entered note only (not preferences — those go on the customer profile)
  const tierLabel = tier === 'basic' ? 'Basic Wash & Fold' : tier === 'standard' ? 'Standard Wash & Fold' : 'Premium Wash & Fold'
  const orderNotes = [tierLabel, bag_count ? `${bag_count} bag${bag_count > 1 ? 's' : ''}` : '', notes]
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

  // Save preferences to customer profile order_preferences JSONB
  // (customer app key → DB key mapping)
  if (preferences) {
    const p = preferences as Record<string, string>
    const orderPreferences: Record<string, string> = {}
    if (p.wash_temp)       orderPreferences.wash_temperature = p.wash_temp
    if (p.detergent_type)  orderPreferences.detergent_type   = p.detergent_type
    if (p.bleach)          orderPreferences.bleach           = p.bleach
    if (p.dryer_sheets)    orderPreferences.dryer_sheets     = p.dryer_sheets
    if (p.fabric_softener) orderPreferences.fabric_softener  = p.fabric_softener
    if (p.dryer)           orderPreferences.dryer            = p.dryer

    if (Object.keys(orderPreferences).length > 0) {
      console.log('[book] saving order_preferences:', JSON.stringify(orderPreferences), 'for customer:', customerId, 'tenant:', ctx.tenantId)
      const { data: prefData, error: prefError } = await ctx.supabase
        .from('customers')
        .update({ order_preferences: orderPreferences })
        .eq('id', customerId)
        .eq('tenant_id', ctx.tenantId)
        .select('id, order_preferences')
      if (prefError) console.error('[book] order_preferences update failed:', prefError.message)
      else console.log('[book] order_preferences updated rows:', prefData?.length ?? 0, prefData)
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
