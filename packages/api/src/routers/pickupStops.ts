import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendSms, logMessage } from '../lib/sms'
import { sendEmail, emailLayout, bookingDeclinedEmail, APP_URL } from '../lib/email'

export const pickupStopsRouter = router({
  listByDate: tenantProcedure
    .input(z.object({
      date: z.string(),  // ISO date "2026-05-07"
      zone_id: z.string().uuid().optional(),
      driver_user_id: z.string().uuid().optional(),
      type: z.enum(['pickup', 'delivery']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('pickup_stops')
        .select(`
          *,
          customer:customers(id, first_name, last_name, phone, address_street, address_city, address_postal_code, lat, lng, driver_instructions),
          zone:delivery_zones(id, name, color),
          order:orders(id, order_number, status)
        `)
        .eq('tenant_id', ctx.tenantId)
        .eq('scheduled_date', input.date)
        .order('sequence_order')
        .order('time_start')

      if (input.zone_id)          query = query.eq('zone_id', input.zone_id)
      if (input.driver_user_id)   query = query.eq('driver_user_id', input.driver_user_id)
      if (input.type)             query = query.eq('type', input.type)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // Upcoming stops (next 7 days) — for dashboard overview
  listUpcoming: tenantProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }).optional())
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split('T')[0]
      const end = new Date()
      end.setDate(end.getDate() + (input?.days ?? 7))
      const endDate = end.toISOString().split('T')[0]

      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .select(`
          *,
          customer:customers(id, first_name, last_name, phone, address_street, address_city),
          zone:delivery_zones(id, name, color)
        `)
        .eq('tenant_id', ctx.tenantId)
        .gte('scheduled_date', today)
        .lte('scheduled_date', endDate)
        .not('status', 'in', '("completed","skipped")')
        .order('scheduled_date')
        .order('sequence_order')

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── All pending customer-app requests (any date, not yet approved/skipped) ───
  // Returns one row per BOOKING (pickup stop only). Delivery info is merged in.
  listPendingRequests: tenantProcedure
    .query(async ({ ctx }) => {
      // Only pickup stops — one per booking
      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone, address_street, address_city, address_postal_code, driver_instructions),
          order:orders(id, order_number, status, notes)
        `)
        .eq('tenant_id', ctx.tenantId)
        .eq('source', 'customer_app')
        .eq('type', 'pickup')
        .is('approved_at', null)
        .neq('status', 'skipped')
        .order('scheduled_date')
        .order('time_start')

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      const pickups = data ?? []

      // Fetch linked delivery stops so the card can show the full booking
      const orderIds = pickups.map((s) => s.order_id).filter(Boolean) as string[]
      const deliveryMap: Record<string, { scheduled_date: string; time_start: string | null; time_end: string | null }> = {}
      if (orderIds.length > 0) {
        const { data: deliveries } = await ctx.supabase
          .from('pickup_stops')
          .select('order_id, scheduled_date, time_start, time_end')
          .in('order_id', orderIds)
          .eq('type', 'delivery')
          .eq('tenant_id', ctx.tenantId)
        for (const d of deliveries ?? []) {
          if (d.order_id) deliveryMap[d.order_id] = d
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return pickups.map((s: any) => ({
        ...s,
        delivery: s.order_id ? (deliveryMap[s.order_id] ?? null) : null,
      }))
    }),

  // ── Count pending customer-app requests (used by nav badge) ─────────────────
  countPendingRequests: tenantProcedure
    .query(async ({ ctx }) => {
      const { count, error } = await ctx.supabase
        .from('pickup_stops')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId)
        .eq('source', 'customer_app')
        .eq('type', 'pickup')
        .is('approved_at', null)
        .neq('status', 'skipped')
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { count: count ?? 0 }
    }),

  // ── Approve a customer-app booking (pickup + linked delivery) ────────────────
  approveStop: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the stop's order_id so we can approve all stops in the booking
      const { data: stop } = await ctx.supabase
        .from('pickup_stops')
        .select('order_id')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()

      const now = new Date().toISOString()
      if (stop?.order_id) {
        // Approve every stop in this booking (pickup + delivery)
        const { error } = await ctx.supabase
          .from('pickup_stops')
          .update({ approved_at: now, approved_by: ctx.userId })
          .eq('order_id', stop.order_id)
          .eq('tenant_id', ctx.tenantId)
          .eq('source', 'customer_app')
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      } else {
        const { error } = await ctx.supabase
          .from('pickup_stops')
          .update({ approved_at: now, approved_by: ctx.userId })
          .eq('id', input.id)
          .eq('tenant_id', ctx.tenantId)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      return { success: true }
    }),

  // ── Decline a customer-app stop request (marks as skipped + cancels order + emails customer) ──
  declineStop: tenantProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get the stop with scheduling info for the email
      const { data: stop } = await ctx.supabase
        .from('pickup_stops')
        .select('id, order_id, source, scheduled_date, time_start, time_end')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()

      if (!stop) throw new TRPCError({ code: 'NOT_FOUND' })

      // Mark all stops for this order as skipped
      if (stop.order_id) {
        await ctx.supabase
          .from('pickup_stops')
          .update({ status: 'skipped' })
          .eq('order_id', stop.order_id)
          .eq('tenant_id', ctx.tenantId)

        await ctx.supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', stop.order_id)
          .eq('tenant_id', ctx.tenantId)
      } else {
        await ctx.supabase
          .from('pickup_stops')
          .update({ status: 'skipped' })
          .eq('id', input.id)
          .eq('tenant_id', ctx.tenantId)
      }

      // Email customer — fire and forget
      sendDeclineNotification(ctx.supabase, ctx.tenantId, stop, input.reason).catch(console.error)

      return { success: true }
    }),

  // ── Edit a stop (date / time / notes / zone) ─────────────────────────────────
  patchStop: tenantProcedure
    .input(z.object({
      id:             z.string().uuid(),
      scheduled_date: z.string().optional(),
      time_start:     z.string().nullable().optional(),
      time_end:       z.string().nullable().optional(),
      notes:          z.string().nullable().optional(),
      zone_id:        z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const patch: Record<string, unknown> = {}
      if (rest.scheduled_date !== undefined) patch.scheduled_date = rest.scheduled_date
      if (rest.time_start !== undefined) patch.time_start = rest.time_start || null
      if (rest.time_end !== undefined) patch.time_end = rest.time_end || null
      if (rest.notes !== undefined) patch.notes = rest.notes || null
      if (rest.zone_id !== undefined) patch.zone_id = rest.zone_id

      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  assignDriver: tenantProcedure
    .input(z.object({
      // Assign a single stop or all stops for a zone+date
      stop_ids:       z.array(z.string().uuid()).optional(),
      zone_id:        z.string().uuid().optional(),
      date:           z.string().optional(),
      driver_user_id: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.stop_ids?.length) {
        const { error } = await ctx.supabase
          .from('pickup_stops')
          .update({ driver_user_id: input.driver_user_id })
          .in('id', input.stop_ids)
          .eq('tenant_id', ctx.tenantId)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      } else if (input.zone_id && input.date) {
        const { error } = await ctx.supabase
          .from('pickup_stops')
          .update({ driver_user_id: input.driver_user_id })
          .eq('zone_id', input.zone_id)
          .eq('scheduled_date', input.date)
          .eq('tenant_id', ctx.tenantId)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      return { success: true }
    }),

  updateStatus: tenantProcedure
    .input(z.object({
      id:           z.string().uuid(),
      status:       z.enum(['pending', 'en_route', 'completed', 'failed', 'skipped']),
      driver_notes: z.string().nullable().optional(),
      order_id:     z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {
        status: input.status,
        driver_notes: input.driver_notes ?? undefined,
      }
      if (input.status === 'completed') patch.completed_at = new Date().toISOString()
      if (input.order_id) patch.order_id = input.order_id

      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .update(patch)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // If completing a delivery, mark the linked order as delivered
      if (input.status === 'completed' && data.type === 'delivery' && data.order_id) {
        await ctx.supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', data.order_id)
          .eq('tenant_id', ctx.tenantId)
      }

      // If completing a pickup, move (or create) the linked order to "Detail" (pending)
      if (input.status === 'completed' && data.type === 'pickup') {
        await ensurePickupOrderDetail(ctx.supabase, ctx.tenantId, data)
      }

      // Notify customer when driver goes en route
      if (input.status === 'en_route' && data.customer_id) {
        sendEnRouteNotification(ctx.supabase, ctx.tenantId, data).catch(console.error)
      }

      return data
    }),

  // Create a one-off stop (not from a schedule)
  createOneOff: tenantProcedure
    .input(z.object({
      customer_id:    z.string().uuid(),
      type:           z.enum(['pickup', 'delivery']),
      scheduled_date: z.string(),
      status:         z.enum(['pending', 'en_route', 'completed', 'failed', 'skipped']).optional(),
      time_start:     z.string().nullable().optional(),
      time_end:       z.string().nullable().optional(),
      zone_id:        z.string().uuid().nullable().optional(),
      driver_user_id: z.string().uuid().nullable().optional(),
      order_id:       z.string().uuid().nullable().optional(),
      notes:          z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .insert({
          ...input,
          tenant_id: ctx.tenantId,
          completed_at: input.status === 'completed' ? new Date().toISOString() : null,
        })
        .select(`*, customer:customers(id, first_name, last_name, phone, address_street, address_city)`)
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // ── Driver: list today's + past-due stops for selected zones ─────────────
  listForDriver: tenantProcedure
    .input(z.object({
      zone_ids: z.array(z.string().uuid()),  // empty = all zones
      date: z.string(),                       // ISO date — today
    }))
    .query(async ({ ctx, input }) => {
      const select = `
        *,
        customer:customers(id, first_name, last_name, phone, address_street, address_apt, address_city, address_postal_code, lat, lng, driver_instructions, order_preferences),
        zone:delivery_zones(id, name, color),
        order:orders(id, order_number, status, payment_status, total_amount, paid_amount)
      `
      // Today's stops — exclude unapproved customer_app requests
      let todayQ = ctx.supabase
        .from('pickup_stops')
        .select(select)
        .eq('tenant_id', ctx.tenantId)
        .eq('scheduled_date', input.date)
        .not('status', 'in', '("completed","skipped")')
        .or('source.eq.staff,approved_at.not.is.null')
        .order('time_start', { nullsFirst: false })
        .order('sequence_order')

      if (input.zone_ids.length > 0) {
        todayQ = todayQ.in('zone_id', input.zone_ids)
      }

      // Past-due stops (before today, not completed)
      let pastQ = ctx.supabase
        .from('pickup_stops')
        .select(select)
        .eq('tenant_id', ctx.tenantId)
        .lt('scheduled_date', input.date)
        .not('status', 'in', '("completed","skipped")')
        .or('source.eq.staff,approved_at.not.is.null')
        .order('scheduled_date', { ascending: false })
        .order('time_start', { nullsFirst: false })

      if (input.zone_ids.length > 0) {
        pastQ = pastQ.in('zone_id', input.zone_ids)
      }

      const [{ data: today }, { data: pastDue }] = await Promise.all([todayQ, pastQ])
      return {
        today: today ?? [],
        pastDue: pastDue ?? [],
      }
    }),

  // ── Driver: claim a stop ─────────────────────────────────────────────────
  claimStop: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Only claim if unclaimed
      const { data: stop } = await ctx.supabase
        .from('pickup_stops')
        .select('driver_user_id, status')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!stop) throw new TRPCError({ code: 'NOT_FOUND' })
      if (stop.driver_user_id && stop.driver_user_id !== ctx.userId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Stop already claimed by another driver' })
      }

      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .update({
          driver_user_id: ctx.userId,
          claimed_at: new Date().toISOString(),
          status: 'en_route',
        })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Notify customer — driver is on the way
      if (data.customer_id) {
        sendEnRouteNotification(ctx.supabase, ctx.tenantId, data).catch(console.error)
      }

      return data
    }),

  // ── Driver: complete a stop with notes/bags/photo ────────────────────────
  completeStop: tenantProcedure
    .input(z.object({
      id:           z.string().uuid(),
      status:       z.enum(['completed', 'failed']),
      driver_notes: z.string().nullable().optional(),
      bag_count:    z.number().int().min(0).nullable().optional(),
      photo_url:    z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .update({
          ...rest,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .eq('driver_user_id', ctx.userId)
        .select(`*, customer:customers(id, first_name, last_name)`)
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Mark linked order as delivered if it was a delivery stop
      if (input.status === 'completed' && data.type === 'delivery' && data.order_id) {
        await ctx.supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', data.order_id)
          .eq('tenant_id', ctx.tenantId)
      }

      // If completing a pickup, move (or create) the linked order to "Detail" (pending)
      if (input.status === 'completed' && data.type === 'pickup') {
        await ensurePickupOrderDetail(ctx.supabase, ctx.tenantId, data)
      }

      return data
    }),

  // ── Driver: get a single stop (for detail page) ──────────────────────────
  getStop: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .select(`
          *,
          customer:customers(id, first_name, last_name, phone, address_street, address_apt, address_city, address_postal_code, lat, lng, driver_instructions, order_preferences),
          zone:delivery_zones(id, name, color),
          order:orders(id, order_number, status, payment_status, total_amount, paid_amount)
        `)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (error) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  // ── Driver: get staff name for claimed stop ──────────────────────────────
  getDriverName: tenantProcedure
    .input(z.object({ user_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from('tenant_members')
        .select('name, email')
        .eq('user_id', input.user_id)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()
      return data
    }),
})

// ─── Decline notification ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendDeclineNotification(supabase: any, tenantId: string, stop: any, reason: string) {
  if (!stop.order_id) return

  // Get customer_id from the order
  const { data: order } = await supabase
    .from('orders')
    .select('customer_id')
    .eq('id', stop.order_id)
    .maybeSingle()
  if (!order?.customer_id) return

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, email')
    .eq('id', order.customer_id)
    .maybeSingle()
  if (!customer?.email) return

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, settings')
    .eq('id', tenantId)
    .maybeSingle()

  const storeName: string = tenant?.name ?? 'Your laundry service'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storePhone: string | null = (tenant?.settings as any)?.phone ?? null

  // Format date and time window for the email
  const scheduledDate = stop.scheduled_date
    ? new Date(stop.scheduled_date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''
  const fmtT = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
  }
  const timeWindow: string | null = stop.time_start
    ? `${fmtT(stop.time_start)}${stop.time_end ? `–${fmtT(stop.time_end)}` : ''}`
    : null

  const { subject, html } = bookingDeclinedEmail({
    storeName,
    storePhone,
    customerName: customer.first_name,
    scheduledDate,
    timeWindow,
    reason,
  })

  await sendEmail({ to: customer.email, subject, html })
}

// ─── On pickup completion: ensure order exists and is set to "Detail" (pending) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePickupOrderDetail(supabase: any, tenantId: string, stop: any) {
  // If already has an order, just set it to pending ("Detail")
  if (stop.order_id) {
    await supabase
      .from('orders')
      .update({ status: 'pending' })
      .eq('id', stop.order_id)
      .eq('tenant_id', tenantId)
      .in('status', ['pending']) // only update if still in pending (don't downgrade)
    return
  }

  // No order yet — create one if we have a customer
  // (schedule_id is optional — one-off pickup stops also need detail orders)
  const customerId = stop.customer_id
  if (!customerId) return

  // If from a schedule, respect the auto_create_order flag
  if (stop.schedule_id) {
    const { data: schedule } = await supabase
      .from('pickup_schedules')
      .select('auto_create_order')
      .eq('id', stop.schedule_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!schedule?.auto_create_order) return
  }

  // Generate next order number
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('order_number')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextNum = 1
  if (lastOrder?.order_number) {
    const match = lastOrder.order_number.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const orderNumber = `ORD-${String(nextNum).padStart(5, '0')}`

  const deliveryFee = await resolveDeliveryFee(supabase, tenantId, customerId)

  const { data: order } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      customer_id: customerId,  // already resolved above
      status: 'pending',
      due_date: stop.scheduled_date ?? null,
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      delivery_fee_cents: deliveryFee,
      total_amount: deliveryFee,  // starts with just the delivery fee
    })
    .select('id')
    .single()

  if (order?.id) {
    // Link the new order back to this stop
    await supabase
      .from('pickup_stops')
      .update({ order_id: order.id })
      .eq('id', stop.id)
      .eq('tenant_id', tenantId)
  }
}

// ─── Resolve effective delivery fee for a customer ────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveDeliveryFee(supabase: any, tenantId: string, customerId: string | null): Promise<number> {
  if (!customerId) return 0

  // 1. Customer override
  const { data: customer } = await supabase
    .from('customers')
    .select('delivery_fee_cents')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (customer?.delivery_fee_cents != null) return customer.delivery_fee_cents

  // 2. Tenant default
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle()

  return (tenant?.settings as Record<string, unknown>)?.delivery_fee_cents as number ?? 0
}

// ─── En-route notification (fire-and-forget) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendEnRouteNotification(supabase: any, tenantId: string, stop: any) {
  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name, phone, email, notification_preference')
    .eq('id', stop.customer_id)
    .single()
  if (!customer) return

  const pref: string = customer.notification_preference ?? 'sms_email'
  if (pref === 'none') return

  const { data: tenant } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single()
  const storeName: string = tenant?.name ?? 'Your laundry service'
  const storePhone: string | null = (tenant?.settings as Record<string, unknown>)?.phone as string ?? null

  const action = stop.type === 'delivery' ? 'deliver your laundry' : 'pick up your laundry'
  const actionShort = stop.type === 'delivery' ? 'delivery' : 'pickup'
  const trackingUrl = `${APP_URL}/track/${stop.id}`

  if ((pref === 'sms' || pref === 'sms_email') && customer.phone) {
    const body = `${storeName}: Your driver is on the way to ${action}! Track them here: ${trackingUrl}`
    await sendSms(customer.phone, body)
    await logMessage(supabase, {
      tenant_id: tenantId,
      customer_id: stop.customer_id,
      direction: 'outbound',
      channel: 'sms',
      body,
      to_address: customer.phone,
    })
  }

  if ((pref === 'email' || pref === 'sms_email') && customer.email) {
    const subject = `Your driver is on the way — ${actionShort} today`
    const html = emailLayout(storeName, `
      <p>Hi ${customer.first_name},</p>
      <p>Your driver is <strong>on the way</strong> to ${action}. They should arrive shortly — please make sure your laundry is ready and accessible.</p>
      <p style="margin:20px 0">
        <a href="${trackingUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 24px;border-radius:8px;font-size:14px">
          Track Your Driver →
        </a>
      </p>
      ${storePhone ? `<p style="font-size:13px;color:#6b7280">Questions? Call us at ${storePhone}</p>` : ''}
    `)
    await sendEmail({ to: customer.email, subject, html })
    await logMessage(supabase, {
      tenant_id: tenantId,
      customer_id: stop.customer_id,
      direction: 'outbound',
      channel: 'email',
      body: `Your driver is on the way to ${action}. Track: ${trackingUrl}`,
      subject,
      to_address: customer.email,
    })
  }
}
