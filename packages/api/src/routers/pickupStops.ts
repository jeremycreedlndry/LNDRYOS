import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

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
