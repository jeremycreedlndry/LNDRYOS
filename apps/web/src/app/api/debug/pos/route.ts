import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const tenantIdFromCookie = req.cookies.get('tenant_id')?.value ?? null
  const tenantIdFromHeader = req.headers.get('x-tenant-id') ?? null

  if (!user) {
    return NextResponse.json({ error: 'not authenticated', tenantIdFromCookie, tenantIdFromHeader })
  }

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: members } = await service
    .from('tenant_members')
    .select('tenant_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { count: itemCount } = await service
    .from('service_items')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantIdFromCookie ?? '')

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    tenantIdFromCookie,
    tenantIdFromHeader,
    allTenants: members?.map(m => m.tenant_id) ?? [],
    serviceItemsForCookieTenant: itemCount,
  })
}
