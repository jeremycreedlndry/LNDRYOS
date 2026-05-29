import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// CORS headers for all customer API responses
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Token',
}

// Fallback tenant for backwards compatibility with hardcoded callers
export const CUSTOMER_TENANT_ID = 'b6b27886-565a-425e-93ce-c0e165aa8ac6'

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Resolve tenant_id from X-Tenant-Token header.
// Falls back to the hardcoded constant so existing callers keep working.
export async function resolveTenantId(req: NextRequest): Promise<string | null> {
  const tenantToken = req.headers.get('x-tenant-token')?.trim()
  if (!tenantToken) return CUSTOMER_TENANT_ID

  const supabase = getServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('tenants')
    .select('id')
    .eq('customer_api_token', tenantToken)
    .maybeSingle()

  return data?.id ?? null
}

export interface CustomerContext {
  tenantId: string
  authUserId: string
  email: string
  customer: Record<string, unknown> | null
  supabase: ReturnType<typeof getServiceClient>
}

export async function requireCustomer(req: NextRequest): Promise<
  { ctx: CustomerContext; response: null } | { ctx: null; response: Response }
> {
  const supabase = getServiceClient()

  // Validate customer JWT
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) {
    return { ctx: null, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS }) }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { ctx: null, response: new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: CORS_HEADERS }) }
  }

  // Resolve tenant from X-Tenant-Token (falls back to hardcoded if header absent)
  const tenantId = await resolveTenantId(req)
  if (!tenantId) {
    return { ctx: null, response: new Response(JSON.stringify({ error: 'Invalid tenant token' }), { status: 401, headers: CORS_HEADERS }) }
  }

  const email = user.email ?? ''
  // Phone from JWT user_metadata (set during signup if provided)
  const metaPhone = ((user.user_metadata as Record<string, unknown> | undefined)?.phone as string | undefined)
    ?.replace(/\D/g, '')

  const orParts = [`auth_user_id.eq.${user.id}`]
  if (email) orParts.push(`email.eq.${email}`)
  if (metaPhone) orParts.push(`phone.eq.${metaPhone}`)

  let { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(orParts.join(','))
    .limit(1)
    .maybeSingle()

  // Auto-link by email/phone if not yet linked
  if (customer && !customer.auth_user_id) {
    await supabase
      .from('customers')
      .update({ auth_user_id: user.id })
      .eq('id', customer.id)
    customer = { ...customer, auth_user_id: user.id }
  }

  return {
    ctx: { tenantId, authUserId: user.id, email, customer, supabase },
    response: null,
  }
}
