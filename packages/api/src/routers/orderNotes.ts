import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const orderNotesRouter = router({
  list: tenantProcedure
    .input(z.object({ order_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('order_notes')
        .select('id, body, created_at, user_id')
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: true })

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  add: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      body: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('order_notes')
        .insert({
          tenant_id: ctx.tenantId,
          order_id: input.order_id,
          user_id: ctx.userId,
          body: input.body,
        })
        .select('id, body, created_at, user_id')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('order_notes')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
