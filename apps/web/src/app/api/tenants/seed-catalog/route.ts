import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await service
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'No tenant found' }, { status: 404 })

  // Check if catalog already has items
  const { count } = await service
    .from('service_items')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', member.tenant_id)

  if (count && count > 0) {
    return NextResponse.json({ message: 'Catalog already seeded', count })
  }

  const { error } = await service.rpc('seed_default_catalog', { p_tenant_id: member.tenant_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, tenant_id: member.tenant_id })
}
