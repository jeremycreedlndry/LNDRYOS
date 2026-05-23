import { initTRPC, TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import superjson from 'superjson'

export interface TRPCContext {
  supabase: SupabaseClient
  userId: string
  tenantId: string
  ip: string
}

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

// All procedures that require an authenticated tenant member
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx })
})

export const mergeRouters = t.mergeRouters
