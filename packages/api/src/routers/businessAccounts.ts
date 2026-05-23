import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const businessAccountsRouter = router({
  list: tenantProcedure
    .input(z.object({ include_inactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from('business_accounts')
        .select(`
          *,
          customers:customers(id, first_name, last_name, email, phone)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('name')

      if (!input?.include_inactive) q = q.eq('is_active', true)

      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('business_accounts')
        .select(`*, customers:customers(id, first_name, last_name, email, phone, account_balance)`)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  create: tenantProcedure
    .input(z.object({
      name:                z.string().min(1),
      email:               z.string().email().nullable().optional(),
      phone:               z.string().nullable().optional(),
      address:             z.string().nullable().optional(),
      city:                z.string().nullable().optional(),
      province:            z.string().nullable().optional(),
      postal_code:         z.string().nullable().optional(),
      payment_terms_days:  z.number().int().min(0).default(30),
      notes:               z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('business_accounts')
        .insert({ ...input, tenant_id: ctx.tenantId })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id:                  z.string().uuid(),
      name:                z.string().min(1).optional(),
      email:               z.string().email().nullable().optional(),
      phone:               z.string().nullable().optional(),
      address:             z.string().nullable().optional(),
      city:                z.string().nullable().optional(),
      province:            z.string().nullable().optional(),
      postal_code:         z.string().nullable().optional(),
      payment_terms_days:  z.number().int().min(0).optional(),
      notes:               z.string().nullable().optional(),
      is_active:           z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { error } = await ctx.supabase
        .from('business_accounts')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Soft-delete: deactivate
      const { error } = await ctx.supabase
        .from('business_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Assign a customer to this business account
  assignCustomer: tenantProcedure
    .input(z.object({
      business_account_id: z.string().uuid(),
      customer_id:         z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('customers')
        .update({ business_account_id: input.business_account_id })
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Remove a customer from any business account
  unassignCustomer: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('customers')
        .update({ business_account_id: null })
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
