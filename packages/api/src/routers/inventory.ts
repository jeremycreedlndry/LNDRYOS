import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireManagerOrOwner(supabase: any, tenantId: string, userId: string) {
  const { data: member } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .single()
  const role = member?.role as string | undefined
  if (role !== 'owner' && role !== 'manager') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Manager or owner role required' })
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const inventoryRouter = router({

  // ── Categories ──────────────────────────────────────────────────────────────

  listCategories: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('inventory_categories')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('sort_order')
      .order('name')
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  createCategory: tenantProcedure
    .input(z.object({
      name:  z.string().min(1).max(80),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { data, error } = await ctx.supabase
        .from('inventory_categories')
        .insert({ tenant_id: ctx.tenantId, name: input.name, color: input.color })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  updateCategory: tenantProcedure
    .input(z.object({
      id:    z.string().uuid(),
      name:  z.string().min(1).max(80).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { id, ...fields } = input
      const { error } = await ctx.supabase
        .from('inventory_categories')
        .update(fields)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  deleteCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { error } = await ctx.supabase
        .from('inventory_categories')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  // ── Items ────────────────────────────────────────────────────────────────────

  listItems: tenantProcedure
    .input(z.object({ categoryId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('inventory_items')
        .select('*, category:inventory_categories(id, name, color)')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('name')
      if (input?.categoryId) query = query.eq('category_id', input.categoryId)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  createItem: tenantProcedure
    .input(z.object({
      name:                z.string().min(1).max(120),
      unit:                z.string().min(1).max(40).default('units'),
      category_id:         z.string().uuid().nullable().optional(),
      current_stock:       z.number().int().min(0).default(0),
      low_stock_threshold: z.number().int().min(0).default(2),
      notes:               z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { data, error } = await ctx.supabase
        .from('inventory_items')
        .insert({ tenant_id: ctx.tenantId, ...input })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  updateItem: tenantProcedure
    .input(z.object({
      id:                  z.string().uuid(),
      name:                z.string().min(1).max(120).optional(),
      unit:                z.string().min(1).max(40).optional(),
      category_id:         z.string().uuid().nullable().optional(),
      low_stock_threshold: z.number().int().min(0).optional(),
      notes:               z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { id, ...fields } = input
      const { error } = await ctx.supabase
        .from('inventory_items')
        .update(fields)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  deleteItem: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      // Soft delete
      const { error } = await ctx.supabase
        .from('inventory_items')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  // ── Transactions ─────────────────────────────────────────────────────────────

  logUsage: tenantProcedure
    .input(z.object({
      item_id:  z.string().uuid(),
      quantity: z.number().int().min(1),
      notes:    z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('inventory_transactions')
        .insert({
          tenant_id:  ctx.tenantId,
          item_id:    input.item_id,
          type:       'use',
          quantity:   input.quantity,
          notes:      input.notes ?? null,
          created_by: ctx.userId,
        })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  restock: tenantProcedure
    .input(z.object({
      item_id:  z.string().uuid(),
      quantity: z.number().int().min(1),
      notes:    z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      const { error } = await ctx.supabase
        .from('inventory_transactions')
        .insert({
          tenant_id:  ctx.tenantId,
          item_id:    input.item_id,
          type:       'restock',
          quantity:   input.quantity,
          notes:      input.notes ?? null,
          created_by: ctx.userId,
        })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  adjustStock: tenantProcedure
    .input(z.object({
      item_id:       z.string().uuid(),
      new_stock:     z.number().int().min(0),
      notes:         z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireManagerOrOwner(ctx.supabase, ctx.tenantId, ctx.userId)
      // Get current stock, compute delta
      const { data: item, error: fetchError } = await ctx.supabase
        .from('inventory_items')
        .select('current_stock')
        .eq('id', input.item_id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (fetchError || !item) throw new TRPCError({ code: 'NOT_FOUND' })

      const delta = input.new_stock - item.current_stock
      if (delta === 0) return

      const { error } = await ctx.supabase
        .from('inventory_transactions')
        .insert({
          tenant_id:  ctx.tenantId,
          item_id:    input.item_id,
          type:       'adjust',
          quantity:   delta,
          notes:      input.notes ?? `Manual adjustment to ${input.new_stock}`,
          created_by: ctx.userId,
        })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  listTransactions: tenantProcedure
    .input(z.object({
      item_id: z.string().uuid().optional(),
      limit:   z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('inventory_transactions')
        .select('*, item:inventory_items(name, unit), staff:created_by(raw_user_meta_data)')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 50)
      if (input?.item_id) query = query.eq('item_id', input.item_id)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),
})
