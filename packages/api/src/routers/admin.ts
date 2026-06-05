import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, platformAdminProcedure } from '../trpc'
import { isPlatformAdmin } from '../lib/platformAdmin'

export const adminRouter = router({
  // Any authenticated user — used to decide whether to show the Master Admin link
  amIPlatformAdmin: publicProcedure.query(({ ctx }) => {
    return { isAdmin: !!ctx.userId && isPlatformAdmin(ctx.userEmail) }
  }),

  // Cross-tenant list of all stores with light stats
  listStores: platformAdminProcedure.query(async ({ ctx }) => {
    const { data: tenants, error } = await ctx.supabase
      .from('tenants')
      .select('id, name, slug, status, plan, created_at')
      .order('created_at', { ascending: true })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

    return Promise.all((tenants ?? []).map(async (t) => {
      const [customers, orders, owner] = await Promise.all([
        ctx.supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
        ctx.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
        ctx.supabase.from('tenant_members').select('email, display_name').eq('tenant_id', t.id).eq('role', 'owner').limit(1).maybeSingle(),
      ])
      return {
        ...t,
        customer_count: customers.count ?? 0,
        order_count: orders.count ?? 0,
        owner_email: owner.data?.email ?? null,
        owner_name: owner.data?.display_name ?? null,
      }
    }))
  }),

  setStoreStatus: platformAdminProcedure
    .input(z.object({ tenant_id: z.string().uuid(), status: z.enum(['active', 'suspended', 'cancelled']) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('tenants')
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq('id', input.tenant_id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  setStorePlan: platformAdminProcedure
    .input(z.object({ tenant_id: z.string().uuid(), plan: z.enum(['starter', 'professional', 'enterprise']) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('tenants')
        .update({ plan: input.plan, updated_at: new Date().toISOString() })
        .eq('id', input.tenant_id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
