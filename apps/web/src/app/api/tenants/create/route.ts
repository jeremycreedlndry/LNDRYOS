import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST(req: NextRequest) {
  const { store_name, plan, user_id, email } = await req.json()

  if (!store_name || !plan || !user_id || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const slug = store_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name: store_name, slug, plan, status: 'active' })
    .select()
    .single()

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  // Add user as owner
  const { error: memberError } = await supabase.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id,
    role: 'owner',
    display_name: store_name,
    email,
  })

  if (memberError) {
    // Clean up tenant if member insert failed
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Seed default service catalog
  await supabase.rpc('seed_default_catalog', { p_tenant_id: tenant.id })

  return NextResponse.json({ tenant_id: tenant.id, checkout_url: null })
}
