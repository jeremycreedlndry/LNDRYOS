import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer, CORS_HEADERS } from '../_lib/auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// GET /api/customer/schedule — list active recurring schedules for this customer
export async function GET(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response
  if (!ctx.customer) return NextResponse.json([], { headers: CORS_HEADERS })

  const customerId = (ctx.customer as { id: string }).id

  const { data, error } = await ctx.supabase
    .from('pickup_schedules')
    .select('id, frequency, day_of_week, pickup_start, pickup_end, delivery_start, delivery_end, delivery_days_later, next_pickup_date, status, notes')
    .eq('customer_id', customerId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active')
    .neq('frequency', 'once')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(data ?? [], { headers: CORS_HEADERS })
}

// POST /api/customer/schedule — create a recurring weekly pickup schedule
export async function POST(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response
  if (!ctx.customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS })

  const customerId = (ctx.customer as { id: string }).id
  const body = await req.json()
  const { day_of_week, pickup_start, pickup_end, notes } = body

  // Validate day_of_week (0=Sun … 6=Sat)
  if (typeof day_of_week !== 'number' || day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json({ error: 'Invalid day_of_week' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!pickup_start || !pickup_end) {
    return NextResponse.json({ error: 'pickup_start and pickup_end are required' }, { status: 400, headers: CORS_HEADERS })
  }

  // Compute next occurrence of the chosen weekday
  const today = new Date()
  const todayDow = today.getDay()
  let daysUntil = day_of_week - todayDow
  if (daysUntil <= 0) daysUntil += 7 // always schedule at least 1 day ahead
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  const nextPickupDate = next.toISOString().split('T')[0]

  // Fetch store time slots to resolve delivery window (use same day + 2 by default)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (ctx.supabase as any)
    .from('tenants')
    .select('settings')
    .eq('id', ctx.tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryFee = (tenant?.settings as any)?.delivery_fee_cents ?? 0
  void deliveryFee // not used here but available

  const { data, error } = await ctx.supabase
    .from('pickup_schedules')
    .insert({
      tenant_id: ctx.tenantId,
      customer_id: customerId,
      frequency: 'weekly',
      day_of_week,
      pickup_start,
      pickup_end,
      delivery_start: null,
      delivery_end: null,
      delivery_days_later: 2,
      next_pickup_date: nextPickupDate,
      auto_create_order: true,
      status: 'active',
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(data, { status: 201, headers: CORS_HEADERS })
}

// DELETE /api/customer/schedule?id=<uuid> — cancel a recurring schedule
export async function DELETE(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response
  if (!ctx.customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: CORS_HEADERS })

  const customerId = (ctx.customer as { id: string }).id

  const { error } = await ctx.supabase
    .from('pickup_schedules')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('customer_id', customerId)   // customers can only cancel their own schedules
    .eq('tenant_id', ctx.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
}
