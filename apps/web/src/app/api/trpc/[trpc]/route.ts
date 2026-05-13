import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, type TRPCContext } from '@laundry/api'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

async function createContext(req: NextRequest): Promise<TRPCContext> {
  const cookieStore = await cookies()

  // Use SSR client only for auth session validation
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return { supabase: authClient, userId: '', tenantId: '' }
  }

  // Use service client for all data operations — tenant isolation is enforced by tenantProcedure
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const tenantId = req.headers.get('x-tenant-id')
    ?? cookieStore.get('tenant_id')?.value
    ?? ''

  return { supabase, userId: user.id, tenantId }
}

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: process.env.NODE_ENV === 'development'
      ? ({ path, error }) => console.error(`tRPC error on ${path}:`, error)
      : undefined,
  })

export { handler as GET, handler as POST }
