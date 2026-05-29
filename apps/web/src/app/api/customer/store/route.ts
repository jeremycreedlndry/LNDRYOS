import { NextRequest, NextResponse } from 'next/server'
import { CORS_HEADERS, CUSTOMER_TENANT_ID, getServiceClient } from '../_lib/auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// GET /api/customer/store — public store info (no customer auth required)
export async function GET(_req: NextRequest) {
  const supabase = getServiceClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, settings')
    .eq('id', CUSTOMER_TENANT_ID)
    .maybeSingle()

  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS_HEADERS })

  const settings = tenant.settings as Record<string, unknown> ?? {}

  return NextResponse.json({
    name: tenant.name,
    phone: settings.phone ?? null,
    email: settings.email ?? null,
    address: settings.address ?? null,
    tax_rate: settings.tax_rate ?? 0,
    delivery_fee_cents: settings.delivery_fee_cents ?? 0,
  }, { headers: CORS_HEADERS })
}
