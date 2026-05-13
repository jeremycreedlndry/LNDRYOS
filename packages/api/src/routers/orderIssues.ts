import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

const DEFAULT_CATEGORIES = ['Stain', 'Tear', 'Missing button', 'Discoloration', 'Damage', 'Other']

export const orderIssuesRouter = router({
  listCategories: tenantProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('issue_categories')
      .select('id, label, sort_order')
      .eq('tenant_id', ctx.tenantId)
      .order('sort_order')
      .order('label')

    if (data && data.length > 0) return data

    // Seed defaults for new tenant on first call
    const defaults = DEFAULT_CATEGORIES.map((label, i) => ({
      tenant_id: ctx.tenantId,
      label,
      sort_order: i,
    }))
    const { data: seeded, error } = await ctx.supabase
      .from('issue_categories')
      .insert(defaults)
      .select('id, label, sort_order')

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return seeded ?? []
  }),

  addCategory: tenantProcedure
    .input(z.object({ label: z.string().min(1).max(50).trim() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('issue_categories')
        .insert({ tenant_id: ctx.tenantId, label: input.label })
        .select('id, label, sort_order')
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  listByOrder: tenantProcedure
    .input(z.object({ order_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('order_issues')
        .select('*')
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  create: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      photo_url: z.string().url(),
      storage_path: z.string().min(1),
      category: z.string().min(1),
      note: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('order_issues')
        .insert({
          tenant_id: ctx.tenantId,
          order_id: input.order_id,
          photo_url: input.photo_url,
          storage_path: input.storage_path,
          category: input.category,
          note: input.note ?? null,
          created_by: ctx.userId,
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: issue } = await ctx.supabase
        .from('order_issues')
        .select('storage_path')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (issue?.storage_path) {
        await ctx.supabase.storage.from('order-issues').remove([issue.storage_path])
      }

      const { error } = await ctx.supabase
        .from('order_issues')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
