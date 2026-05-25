import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendSms, logMessage } from '../lib/sms'
import { sendEmail, emailLayout } from '../lib/email'

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
      // Today's stops
      let todayQ = ctx.supabase
        .from('pickup_stops')
        .select(select)
        .eq('tenant_id', ctx.tenantId)
        .eq('scheduled_date', input.date)
        .not('status', 'in', '("completed","skipped")')
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

  // No order yet — check if the schedule wants auto-creation
  if (!stop.schedule_id) return
  const { data: schedule } = await supabase
    .from('pickup_schedules')
    .select('auto_create_order, customer_id')
    .eq('id', stop.schedule_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!schedule?.auto_create_order) return

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

  const { data: order } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      customer_id: stop.customer_id ?? schedule.customer_id,
      status: 'pending',
      due_date: stop.scheduled_date ?? null,
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 0,
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

  if ((pref === 'sms' || pref === 'sms_email') && customer.phone) {
    const body = `${storeName}: Your driver is on the way to ${action}! They should arrive shortly.`
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
      ${storePhone ? `<p style="font-size:13px;color:#6b7280">Questions? Call us at ${storePhone}</p>` : ''}
    `)
    await sendEmail({ to: customer.email, subject, html })
    await logMessage(supabase, {
      tenant_id: tenantId,
      customer_id: stop.customer_id,
      direction: 'outbound',
      channel: 'email',
      body: `Your driver is on the way to ${action}.`,
      subject,
      to_address: customer.email,
    })
  }
}
