import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const linenPresetsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('linen_presets')
      .select('id, label, sort_order')
      .eq('tenant_id', ctx.tenantId)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  add: tenantProcedure
    .input(z.object({ label: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      // Get current max sort_order
      const { data: last } = await ctx.supabase
        .from('linen_presets')
        .select('sort_order')
        .eq('tenant_id', ctx.tenantId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextOrder = (last?.sort_order ?? 0) + 1

      const { data, error } = await ctx.supabase
        .from('linen_presets')
        .insert({ tenant_id: ctx.tenantId, label: input.label.trim(), sort_order: nextOrder })
        .select('id, label, sort_order')
        .single()

      if (error) {
        // Unique violation — return existing preset
        if (error.code === '23505') {
          const { data: existing } = await ctx.supabase
            .from('linen_presets')
            .select('id, label, sort_order')
            .eq('tenant_id', ctx.tenantId)
            .eq('label', input.label.trim())
            .single()
          if (existing) return existing
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      return data
    }),

  remove: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('linen_presets')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),
})
