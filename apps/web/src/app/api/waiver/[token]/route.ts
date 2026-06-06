import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS so we can look up a waiver by token
// without requiring the customer to be authenticated.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// GET /api/waiver/[token] — fetch waiver details for the customer to review
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('order_lines')
    .select('id, name, waiver_text, waiver_token_expires_at, waiver_acknowledged_at, waiver_acknowledged_name, order:orders(order_number, tenant:tenants(name))')
    .eq('waiver_token', token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Waiver not found' }, { status: 404 })
  }

  const expires = data.waiver_token_expires_at ? new Date(data.waiver_token_expires_at) : null
  if (expires && expires < new Date()) {
    return NextResponse.json({ error: 'This waiver link has expired' }, { status: 410 })
  }

  return NextResponse.json(data)
}

// POST /api/waiver/[token] — customer submits name to acknowledge
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  let body: { customer_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const customerName = body.customer_name?.trim()
  if (!customerName || customerName.length < 2) {
    return NextResponse.json({ error: 'Please enter your full name' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Verify token exists and isn't expired or already signed
  const { data: line } = await supabase
    .from('order_lines')
    .select('id, waiver_token_expires_at, waiver_acknowledged_at')
    .eq('waiver_token', token)
    .maybeSingle()

  if (!line) return NextResponse.json({ error: 'Waiver not found' }, { status: 404 })
  if (line.waiver_acknowledged_at) return NextResponse.json({ error: 'Waiver already signed' }, { status: 409 })
  const expires = line.waiver_token_expires_at ? new Date(line.waiver_token_expires_at) : null
  if (expires && expires < new Date()) return NextResponse.json({ error: 'This waiver link has expired' }, { status: 410 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? null

  const { error: updateError } = await supabase
    .from('order_lines')
    .update({
      waiver_acknowledged_at:   new Date().toISOString(),
      waiver_acknowledged_name: customerName,
      waiver_acknowledged_ip:   ip,
    })
    .eq('waiver_token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to record signature' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
