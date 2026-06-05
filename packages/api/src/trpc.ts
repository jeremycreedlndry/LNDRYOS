import { initTRPC, TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import superjson from 'superjson'
import { isPlatformAdmin } from './lib/platformAdmin'

export interface TRPCContext {
  supabase: SupabaseClient
  userId: string
  userEmail: string
  tenantId: string
  ip: string
}

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

// All procedures that require an authenticated tenant member.
// Verifies the user actually belongs to the tenant (or is a platform admin) —
// otherwise any logged-in user could point tenant_id at another store.
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  if (!isPlatformAdmin(ctx.userEmail)) {
    const { data: member } = await ctx.supabase
      .from('tenant_members')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle()
    if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this store' })
  }
  return next({ ctx })
})

// Platform-level (master admin) procedures — cross-tenant, no tenant required.
export const platformAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (!isPlatformAdmin(ctx.userEmail)) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx })
})

export const mergeRouters = t.mergeRouters
