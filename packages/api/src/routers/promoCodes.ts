import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const promoCodesRouter = router({

  list: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('promo_codes')
      .select('*, uses:promo_code_uses(count)')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return (data ?? []).map((p) => ({
      ...p,
      use_count: (p.uses as unknown as { count: number }[])[0]?.count ?? 0,
    }))
  }),

  create: tenantProcedure
    .input(z.object({
      code:                  z.string().min(1).max(32).transform((s) => s.toUpperCase().trim()),
      description:           z.string().optional(),
      discount_type:         z.enum(['percent', 'flat']),
      discount_value:        z.number().int().positive(),   // percent 1-100 or cents
      max_uses:              z.number().int().positive().nullable().optional(),
      max_uses_per_customer: z.number().int().positive().nullable().optional(),
      expires_at:            z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.discount_type === 'percent' && input.discount_value > 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percent discount cannot exceed 100%' })
      }
      const { data, error } = await ctx.supabase
        .from('promo_codes')
        .insert({ ...input, tenant_id: ctx.tenantId })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') throw new TRPCError({ code: 'CONFLICT', message: `Code "${input.code}" already exists` })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id:                    z.string().uuid(),
      description:           z.string().optional(),
      discount_type:         z.enum(['percent', 'flat']).optional(),
      discount_value:        z.number().int().positive().optional(),
      max_uses:              z.number().int().positive().nullable().optional(),
      max_uses_per_customer: z.number().int().positive().nullable().optional(),
      expires_at:            z.string().nullable().optional(),
      is_active:             z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('promo_codes')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('promo_codes')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  // Validate a code without recording a use — used by the POS before confirming payment
  validate: tenantProcedure
    .input(z.object({
      code:        z.string().min(1).transform((s) => s.toUpperCase().trim()),
      customer_id: z.string().uuid().nullable().optional(),
      order_total: z.number().int().nonnegative(), // cents — used to cap flat discounts
    }))
    .query(async ({ ctx, input }) => {
      const { data: promo } = await ctx.supabase
        .from('promo_codes')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('code', input.code)
        .single()

      if (!promo) return { valid: false, reason: 'Code not found' } as const
      if (!promo.is_active) return { valid: false, reason: 'Code is no longer active' } as const
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { valid: false, reason: 'Code has expired' } as const

      // Check total uses
      if (promo.max_uses != null) {
        const { count } = await ctx.supabase
          .from('promo_code_uses')
          .select('*', { count: 'exact', head: true })
          .eq('promo_code_id', promo.id)
        if ((count ?? 0) >= promo.max_uses) return { valid: false, reason: 'Code has reached its usage limit' } as const
      }

      // Check per-customer uses
      if (promo.max_uses_per_customer != null && input.customer_id) {
        const { count } = await ctx.supabase
          .from('promo_code_uses')
          .select('*', { count: 'exact', head: true })
          .eq('promo_code_id', promo.id)
          .eq('customer_id', input.customer_id)
        if ((count ?? 0) >= promo.max_uses_per_customer) return { valid: false, reason: 'You have already used this code' } as const
      }

      const discountCents =
        promo.discount_type === 'percent'
          ? Math.round(input.order_total * promo.discount_value / 100)
          : Math.min(promo.discount_value, input.order_total)

      return {
        valid:          true,
        promo_code_id:  promo.id,
        discount_type:  promo.discount_type as 'percent' | 'flat',
        discount_value: promo.discount_value,
        discount_cents: discountCents,
        description:    promo.description ?? null,
      } as const
    }),

  // Record a use — called after payment succeeds
  recordUse: tenantProcedure
    .input(z.object({
      promo_code_id: z.string().uuid(),
      customer_id:   z.string().uuid().nullable().optional(),
      order_id:      z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('promo_code_uses')
        .insert({ ...input, tenant_id: ctx.tenantId })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),
})
