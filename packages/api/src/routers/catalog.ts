import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

const itemCategorySchema = z.enum([
  'wash_fold', 'dry_clean', 'press_only', 'alterations', 'other', 'gift_card', 'product', 'upcharge',
])

export const catalogRouter = router({
  list: tenantProcedure
    .input(z.object({
      includeInactive: z.boolean().default(false),
      priceListId: z.string().uuid().nullable().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('service_items')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('sort_order')

      if (!input?.includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      const items = data ?? []

      // Apply price list overrides if a non-default list is specified
      if (input?.priceListId) {
        const { data: overrides } = await ctx.supabase
          .from('price_list_items')
          .select('service_item_id, unit_price')
          .eq('price_list_id', input.priceListId)

        if (overrides && overrides.length > 0) {
          const map: Record<string, number> = {}
          for (const o of overrides) map[o.service_item_id] = o.unit_price
          return items.map((item) =>
            map[item.id] !== undefined ? { ...item, unit_price: map[item.id] } : item
          )
        }
      }

      return items
    }),

  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      category: itemCategorySchema,
      unit_price: z.number().int().nonnegative(),
      unit_label: z.string().default('item'),
      sort_order: z.number().int().default(0),
      preference_groups: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('service_items')
        .insert({ ...input, tenant_id: ctx.tenantId })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      category: itemCategorySchema.optional(),
      unit_price: z.number().int().nonnegative().optional(),
      unit_label: z.string().optional(),
      description: z.string().nullable().optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
      preference_groups: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('service_items')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  ensureGiftCards: tenantProcedure
    .mutation(async ({ ctx }) => {
      const defaults = [
        { name: 'Digital Gift Card',   description: 'Sent by email',   unit_label: 'item' },
        { name: 'Physical Gift Card',  description: 'Printed card',     unit_label: 'item' },
      ]

      const { data: existing } = await ctx.supabase
        .from('service_items')
        .select('name')
        .eq('tenant_id', ctx.tenantId)
        .eq('category', 'gift_card')

      const existingNames = new Set((existing ?? []).map((i) => i.name))

      for (const gc of defaults) {
        if (!existingNames.has(gc.name)) {
          await ctx.supabase.from('service_items').insert({
            tenant_id: ctx.tenantId,
            name: gc.name,
            description: gc.description,
            category: 'gift_card',
            unit_price: 0,
            unit_label: gc.unit_label,
            is_active: true,
            sort_order: 0,
          })
        }
      }
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('service_items')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
