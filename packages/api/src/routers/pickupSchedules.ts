import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { pointInPolygon } from '../lib/geocode'

const scheduleSchema = z.object({
  customer_id:         z.string().uuid(),
  frequency:           z.enum(['once', 'weekly', 'biweekly', 'monthly']),
  day_of_week:         z.number().int().min(0).max(6).nullable().optional(),
  next_pickup_date:    z.string().nullable().optional(),  // ISO date
  pickup_start:        z.string().nullable().optional(),  // "09:00"
  pickup_end:          z.string().nullable().optional(),
  delivery_start:      z.string().nullable().optional(),
  delivery_end:        z.string().nullable().optional(),
  delivery_days_later: z.number().int().min(0).max(14).default(2),
  auto_create_order:   z.boolean().default(true).optional(),
  end_date:            z.string().nullable().optional(),   // ISO date — null = no end
  notes:               z.string().nullable().optional(),
})

export const pickupSchedulesRouter = router({
  list: tenantProcedure
    .input(z.object({
      status: z.enum(['active', 'paused', 'cancelled']).optional(),
      customer_id: z.string().uuid().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('pickup_schedules')
        .select(`
          *,
          customer:customers(id, first_name, last_name, phone, address_street, address_city, lat, lng),
          zone:delivery_zones(id, name, color)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })

      if (input?.status) query = query.eq('status', input.status)
      else query = query.neq('status', 'cancelled')
      if (input?.customer_id) query = query.eq('customer_id', input.customer_id)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  create: tenantProcedure
    .input(scheduleSchema)
    .mutation(async ({ ctx, input }) => {
      // Auto-detect zone from customer coordinates
      const { data: customer } = await ctx.supabase
        .from('customers')
        .select('lat, lng')
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      let zone_id: string | null = null
      if (customer?.lat && customer?.lng) {
        const { data: zones } = await ctx.supabase
          .from('delivery_zones')
          .select('id, coordinates')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true)

        for (const zone of zones ?? []) {
          if (pointInPolygon(customer.lng, customer.lat, zone.coordinates as [number, number][])) {
            zone_id = zone.id as string
            break
          }
        }
      }

      const { data, error } = await ctx.supabase
        .from('pickup_schedules')
        .insert({ ...input, tenant_id: ctx.tenantId, zone_id, auto_create_order: true })
        .select(`*, customer:customers(id, first_name, last_name, phone, address_street, address_city), zone:delivery_zones(id, name, color)`)
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Generate the first stop(s) immediately
      if (data.next_pickup_date) {
        await generateStopsForSchedule(ctx.supabase, ctx.tenantId, data)
      }

      return data
    }),

  update: tenantProcedure
    .input(z.object({ id: z.string().uuid() }).merge(scheduleSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('pickup_schedules')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select(`*, customer:customers(id, first_name, last_name, phone), zone:delivery_zones(id, name, color)`)
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  cancel: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('pickup_schedules')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Manually trigger stop generation for a schedule (e.g., next 4 weeks)
  generateStops: tenantProcedure
    .input(z.object({ id: z.string().uuid(), weeks_ahead: z.number().int().min(1).max(12).default(4) }))
    .mutation(async ({ ctx, input }) => {
      const { data: schedule } = await ctx.supabase
        .from('pickup_schedules')
        .select('*')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (!schedule) throw new TRPCError({ code: 'NOT_FOUND' })

      const count = await generateStopsForSchedule(ctx.supabase, ctx.tenantId, schedule, input.weeks_ahead)
      return { generated: count }
    }),
})

// ─── Stop generation helper ───────────────────────────────────────────────────

async function generateStopsForSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule: any,
  weeksAhead = 1
): Promise<number> {
  if (!schedule.next_pickup_date) return 0

  const dates: string[] = []
  const start = new Date(schedule.next_pickup_date)

  if (schedule.frequency === 'once') {
    dates.push(schedule.next_pickup_date)
  } else {
    const intervalDays =
      schedule.frequency === 'weekly'   ? 7  :
      schedule.frequency === 'biweekly' ? 14 : 30

    const end = new Date()
    end.setDate(end.getDate() + weeksAhead * 7)
    if (schedule.end_date) {
      const schedEnd = new Date(schedule.end_date)
      if (schedEnd < end) end.setTime(schedEnd.getTime())
    }

    let cur = new Date(start)
    while (cur <= end) {
      dates.push(cur.toISOString().split('T')[0])
      cur = new Date(cur)
      cur.setDate(cur.getDate() + intervalDays)
    }
  }

  const stops = []
  for (const date of dates) {
    // Check if stop already exists
    const { data: existing } = await supabase
      .from('pickup_stops')
      .select('id')
      .eq('schedule_id', schedule.id)
      .eq('scheduled_date', date)
      .eq('type', 'pickup')
      .maybeSingle()

    if (existing) continue

    // Pickup stop
    stops.push({
      tenant_id: tenantId,
      schedule_id: schedule.id,
      customer_id: schedule.customer_id,
      zone_id: schedule.zone_id,
      type: 'pickup',
      scheduled_date: date,
      time_start: schedule.pickup_start,
      time_end: schedule.pickup_end,
    })

    // Delivery stop (N days later)
    if (schedule.delivery_days_later > 0) {
      const delivDate = new Date(date)
      delivDate.setDate(delivDate.getDate() + schedule.delivery_days_later)
      stops.push({
        tenant_id: tenantId,
        schedule_id: schedule.id,
        customer_id: schedule.customer_id,
        zone_id: schedule.zone_id,
        type: 'delivery',
        scheduled_date: delivDate.toISOString().split('T')[0],
        time_start: schedule.delivery_start,
        time_end: schedule.delivery_end,
      })
    }
  }

  if (stops.length === 0) return 0
  const { error } = await supabase.from('pickup_stops').insert(stops)
  if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
  return stops.length
}
