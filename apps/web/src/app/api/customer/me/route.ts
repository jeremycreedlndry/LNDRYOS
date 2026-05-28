import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer, resolveTenantId, CORS_HEADERS, getServiceClient } from '../_lib/auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

function withComputedFields(c: Record<string, unknown>) {
  const first = String(c.first_name ?? '')
  const last = String(c.last_name ?? '')
  const street = String(c.address_street ?? '')
  const city = String(c.address_city ?? '')
  const postal = String(c.address_postal_code ?? '')
  // Province is always Ontario for this store — not stored as a column
  const province = postal ? 'ON' : ''
  return {
    ...c,
    address_postal: postal,           // expose as address_postal for the customer app
    address_province: province,       // synthesised — not a real column
    name: [first, last].filter(Boolean).join(' '),
    address: [street, city, [province, postal].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  }
}

// GET /api/customer/me — return current customer profile
export async function GET(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response

  if (!ctx.customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS })
  }

  return NextResponse.json(withComputedFields(ctx.customer), { headers: CORS_HEADERS })
}

// PATCH /api/customer/me — update name, phone, address
export async function PATCH(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response

  if (!ctx.customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS })
  }

  const body = await req.json()
  const { first_name, last_name, phone, address_street, address_city, address_postal } = body
  // address_province is not a DB column (always Ontario) — ignore if sent

  const updates: Record<string, unknown> = {}
  if (first_name !== undefined) updates.first_name = first_name
  if (last_name !== undefined) updates.last_name = last_name
  if (phone !== undefined) updates.phone = phone
  if (address_street !== undefined) updates.address_street = address_street
  if (address_city !== undefined) updates.address_city = address_city
  if (address_postal !== undefined) updates.address_postal_code = address_postal

  const { data, error } = await ctx.supabase
    .from('customers')
    .update(updates)
    .eq('id', (ctx.customer as { id: string }).id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(data, { headers: CORS_HEADERS })
}

// POST /api/customer/me — create customer record (called immediately after signup)
// The client passes the access_token directly so this doesn't race against onAuthStateChange.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })

  const supabase = getServiceClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS_HEADERS })

  // Resolve tenant from X-Tenant-Token header
  const tenantId = await resolveTenantId(req)
  if (!tenantId) return NextResponse.json({ error: 'Invalid tenant token' }, { status: 401, headers: CORS_HEADERS })

  const body = await req.json()
  const { first_name, last_name, phone } = body

  // Return existing record if already created (idempotent — safe to call twice)
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email ?? ''}`)
    .maybeSingle()

  if (existing) {
    if (!existing.auth_user_id) {
      await supabase.from('customers').update({ auth_user_id: user.id }).eq('id', existing.id)
    }
    return NextResponse.json({ ...existing, auth_user_id: user.id }, { headers: CORS_HEADERS })
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      auth_user_id: user.id,
      first_name: first_name ?? user.user_metadata?.full_name?.split(' ')[0] ?? '',
      last_name: last_name ?? user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ?? '',
      email: user.email ?? '',
      phone: phone ?? '',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(data, { status: 201, headers: CORS_HEADERS })
}
