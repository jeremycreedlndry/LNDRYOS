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

  // Self-healing: if the stored name is blank, backfill from auth user metadata.
  // Handles customers created before the || fix was deployed.
  let customer = ctx.customer
  if (!customer.first_name) {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (token) {
      const { data: { user } } = await ctx.supabase.auth.getUser(token)
      const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim()
      if (fullName) {
        const parts = fullName.split(' ')
        const first_name = parts[0]
        const last_name = parts.slice(1).join(' ')
        await ctx.supabase
          .from('customers')
          .update({ first_name, last_name })
          .eq('id', (customer as { id: string }).id)
        customer = { ...customer, first_name, last_name }
      }
    }
  }

  return NextResponse.json(withComputedFields(customer), { headers: CORS_HEADERS })
}

// PATCH /api/customer/me — update name, phone, address
export async function PATCH(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response

  if (!ctx.customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS })
  }

  const body = await req.json()
  const { first_name, last_name, phone, address_street, address_city, address_postal, notification_preference } = body
  // address_province is not a DB column (always Ontario) — ignore if sent

  const VALID_NOTIF_PREFS = ['sms_email', 'sms', 'email', 'none']

  const updates: Record<string, unknown> = {}
  if (first_name !== undefined) updates.first_name = first_name
  if (last_name !== undefined) updates.last_name = last_name
  if (phone !== undefined) updates.phone = phone
  if (address_street !== undefined) updates.address_street = address_street
  if (address_city !== undefined) updates.address_city = address_city
  if (address_postal !== undefined) updates.address_postal_code = address_postal
  if (notification_preference !== undefined && VALID_NOTIF_PREFS.includes(notification_preference)) {
    updates.notification_preference = notification_preference
  }

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

  // Use admin.getUserById to guarantee we get the full user record including
  // user_metadata. auth.getUser(token) can return empty metadata on brand-new
  // tokens before the DB write has propagated to the JWT decode path.
  const { data: adminData } = await supabase.auth.admin.getUserById(user.id)
  const fullName = adminData?.user?.user_metadata?.full_name?.trim() ?? ''
  const metaFirst = fullName ? fullName.split(' ')[0] : ''
  const metaLast  = fullName ? fullName.split(' ').slice(1).join(' ') : ''

  const body = await req.json()
  const { first_name, last_name, phone } = body
  const cleanPhone = phone?.toString().replace(/\D/g, '') // strip non-digits for matching

  // Look up existing customer by auth_user_id, email, OR phone.
  // Phone matching allows a customer who was manually added in LNDRYOS to
  // "marry up" with their new app account, inheriting their existing profile
  // (preferences, address, notes, etc.) without creating a duplicate.
  const orParts = [`auth_user_id.eq.${user.id}`]
  if (user.email) orParts.push(`email.eq.${user.email}`)
  if (cleanPhone) orParts.push(`phone.eq.${cleanPhone}`)

  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(orParts.join(','))
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Link auth user + backfill any blank fields — never overwrite populated values
    const updates: Record<string, unknown> = {}
    if (!existing.auth_user_id) updates.auth_user_id = user.id
    if (!existing.email && user.email) updates.email = user.email
    if (!existing.first_name) updates.first_name = first_name || metaFirst || ''
    if (!existing.last_name)  updates.last_name  = last_name  || metaLast  || ''
    if (!existing.phone && cleanPhone) updates.phone = cleanPhone
    if (Object.keys(updates).length > 0) {
      await supabase.from('customers').update(updates).eq('id', existing.id)
    }
    return NextResponse.json({ ...existing, ...updates }, { headers: CORS_HEADERS })
  }

  // Use || so empty strings from the client body fall through to the metadata fallback
  const resolvedFirst = first_name || metaFirst || ''
  const resolvedLast  = last_name  || metaLast  || ''

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      auth_user_id: user.id,
      first_name: resolvedFirst,
      last_name: resolvedLast,
      email: user.email ?? '',
      phone: phone ?? '',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(data, { status: 201, headers: CORS_HEADERS })
}
