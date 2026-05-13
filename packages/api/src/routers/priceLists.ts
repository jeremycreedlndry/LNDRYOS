import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const priceListsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('price_lists')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('is_default', { ascending: false })
      .order('created_at')

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

    // Ensure default exists (first-time setup)
    if (!data || data.length === 0) {
      const { data: created, error: createError } = await ctx.supabase
        .from('price_lists')
        .insert({ tenant_id: ctx.tenantId, name: 'Default', is_default: true })
        .select()
        .single()
      if (createError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: createError.message })
      return [created]
    }

    return data ?? []
  }),

  create: tenantProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('price_lists')
        .insert({ tenant_id: ctx.tenantId, name: input.name, is_default: false })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  rename: tenantProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('price_lists')
        .update({ name: input.name })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Can't delete the default list
      const { data: pl } = await ctx.supabase
        .from('price_lists')
        .select('is_default')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!pl) throw new TRPCError({ code: 'NOT_FOUND' })
      if (pl.is_default) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the default price list' })

      const { error } = await ctx.supabase
        .from('price_lists')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Get price overrides for a specific list
  getPrices: tenantProcedure
    .input(z.object({ priceListId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('price_list_items')
        .select('service_item_id, unit_price')
        .eq('price_list_id', input.priceListId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      // Map to { [service_item_id]: unit_price }
      const map: Record<string, number> = {}
      for (const row of data ?? []) {
        map[row.service_item_id] = row.unit_price
      }
      return map
    }),

  // Upsert a price override for one item in a list
  setPrice: tenantProcedure
    .input(z.object({
      priceListId: z.string().uuid(),
      serviceItemId: z.string().uuid(),
      unitPrice: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the price list belongs to this tenant
      const { data: pl } = await ctx.supabase
        .from('price_lists')
        .select('id, is_default')
        .eq('id', input.priceListId)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!pl) throw new TRPCError({ code: 'NOT_FOUND' })

      if (pl.is_default) {
        // For default list, update the base price on the service item itself
        const { error } = await ctx.supabase
          .from('service_items')
          .update({ unit_price: input.unitPrice })
          .eq('id', input.serviceItemId)
          .eq('tenant_id', ctx.tenantId)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      } else {
        const { error } = await ctx.supabase
          .from('price_list_items')
          .upsert({
            price_list_id: input.priceListId,
            service_item_id: input.serviceItemId,
            unit_price: input.unitPrice,
          }, { onConflict: 'price_list_id,service_item_id' })
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { success: true }
    }),
})
