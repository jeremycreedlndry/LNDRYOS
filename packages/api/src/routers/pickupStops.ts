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
      time_start:     z.string().nullable().optional(),
      time_end:       z.string().nullable().optional(),
      zone_id:        z.string().uuid().nullable().optional(),
      driver_user_id: z.string().uuid().nullable().optional(),
      notes:          z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pickup_stops')
        .insert({ ...input, tenant_id: ctx.tenantId })
        .select(`*, customer:customers(id, first_name, last_name, phone, address_street, address_city)`)
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),
})

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
