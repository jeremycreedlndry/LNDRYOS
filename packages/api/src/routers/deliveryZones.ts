import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { pointInPolygon } from '../lib/geocode'

const coordinateSchema = z.tuple([z.number(), z.number()]) // [lng, lat]

export const deliveryZonesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('delivery_zones')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      color: z.string().default('#3B82F6'),
      coordinates: z.array(coordinateSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from('delivery_zones')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
      const sort_order = (existing ?? []).length

      const { data, error } = await ctx.supabase
        .from('delivery_zones')
        .insert({ ...input, tenant_id: ctx.tenantId, sort_order })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Retroactively assign zone to existing customers whose coords fall inside
      await assignExistingCustomers(ctx.supabase, ctx.tenantId, data.id, input.coordinates as [number, number][])

      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
      coordinates: z.array(coordinateSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('delivery_zones')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      if (input.coordinates) {
        await assignExistingCustomers(ctx.supabase, ctx.tenantId, id, input.coordinates as [number, number][])
      }
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('delivery_zones')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Find which zone a lat/lng falls in
  detectZone: tenantProcedure
    .input(z.object({ lat: z.number(), lng: z.number() }))
    .query(async ({ ctx, input }) => {
      const { data: zones } = await ctx.supabase
        .from('delivery_zones')
        .select('id, name, color, coordinates')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)

      for (const zone of zones ?? []) {
        if (pointInPolygon(input.lng, input.lat, zone.coordinates as [number, number][])) {
          return { zone_id: zone.id as string, zone_name: zone.name as string, color: zone.color as string }
        }
      }
      return null
    }),
})

// ── Assign all geocoded customers to a zone after create/update ──────────────
async function assignExistingCustomers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  zoneId: string,
  coordinates: [number, number][]
) {
  const { data: customers } = await supabase
    .from('customers')
    .select('id, lat, lng')
    .eq('tenant_id', tenantId)
    .not('lat', 'is', null)

  const ids = (customers ?? [])
    .filter((c: { lat: number; lng: number }) => pointInPolygon(c.lng, c.lat, coordinates))
    .map((c: { id: string }) => c.id)

  if (ids.length === 0) return

  // Store zone_id on pickup_schedules for these customers
  await supabase
    .from('pickup_schedules')
    .update({ zone_id: zoneId })
    .eq('tenant_id', tenantId)
    .in('customer_id', ids)
    .is('zone_id', null)
}
