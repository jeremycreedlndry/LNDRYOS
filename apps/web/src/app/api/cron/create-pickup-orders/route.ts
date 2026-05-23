import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

/**
 * Cron: create-pickup-orders
 * Runs daily at 12:00 UTC-4 (noon local) — configured in vercel.json as "0 16 * * *" (UTC).
 *
 * For every pickup stop scheduled for TOMORROW where:
 *   - auto_create_order = true on the linked schedule
 *   - stop.order_id IS NULL (order not yet created)
 *   - stop.status = 'pending'
 *
 * Creates a shell pending order and links it back to the stop.
 * The order then appears immediately in the Pending queue for staff.
 */
export async function GET(req: NextRequest) {
  // Accept x-cron-secret header, query param, or Vercel's Authorization: Bearer header
  const secret = req.headers.get('x-cron-secret')
    ?? req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Find all pickup stops for tomorrow that need an order created
  const { data: stops, error } = await supabase
    .from('pickup_stops')
    .select(`
      id, tenant_id, customer_id, notes, scheduled_date,
      schedule:pickup_schedules(id, auto_create_order)
    `)
    .eq('scheduled_date', tomorrowStr)
    .eq('type', 'pickup')
    .eq('status', 'pending')
    .is('order_id', null)

  if (error) {
    console.error('[cron/create-pickup-orders] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const stop of stops ?? []) {
    const schedule = stop.schedule as unknown as { id: string; auto_create_order: boolean } | null

    // Skip if schedule has auto_create_order disabled, or stop has no schedule (one-off)
    if (!schedule?.auto_create_order) {
      skipped++
      continue
    }

    // Get next order number for this tenant
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('order_number')
      .eq('tenant_id', stop.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextNum = 1
    if (lastOrder?.order_number) {
      const match = lastOrder.order_number.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const orderNumber = `ORD-${String(nextNum).padStart(5, '0')}`

    // Create shell pending order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        tenant_id:       stop.tenant_id,
        order_number:    orderNumber,
        customer_id:     stop.customer_id,
        status:          'pending',
        notes:           stop.notes ?? null,
        due_date:        stop.scheduled_date,
        subtotal:        0,
        tax_amount:      0,
        discount_amount: 0,
        total_amount:    0,
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      console.error(`[cron/create-pickup-orders] Failed to create order for stop ${stop.id}:`, orderErr)
      errors.push(stop.id)
      continue
    }

    // Link order back to the pickup stop
    const { error: stopErr } = await supabase
      .from('pickup_stops')
      .update({ order_id: order.id })
      .eq('id', stop.id)

    if (stopErr) {
      console.error(`[cron/create-pickup-orders] Failed to link order ${order.id} to stop ${stop.id}:`, stopErr)
      errors.push(stop.id)
      continue
    }

    created++
  }

  console.log(`[cron/create-pickup-orders] date=${tomorrowStr} created=${created} skipped=${skipped} errors=${errors.length}`)
  return NextResponse.json({ date: tomorrowStr, created, skipped, errors })
}
