import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

// OpenPhone (Quo) sends a webhook when a message is received.
// Payload shape: { type: "message.received", data: { object: { from, to, body, createdAt } } }
//
// Secure the endpoint by setting QUO_WEBHOOK_SECRET in .env.local and
// configuring the same value in the OpenPhone webhook URL as ?secret=...

export async function POST(req: NextRequest) {
  const secret = process.env.QUO_WEBHOOK_SECRET
  if (secret) {
    const provided = req.nextUrl.searchParams.get('secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = body as {
    type?: string
    data?: {
      object?: {
        from?: string
        to?: string
        body?: string
        createdAt?: string
      }
    }
  }

  // Only handle inbound messages
  if (payload?.type !== 'message.received') {
    return NextResponse.json({ ok: true })
  }

  const msgObj = payload.data?.object
  if (!msgObj?.from || !msgObj?.body) {
    return NextResponse.json({ ok: true })
  }

  const fromPhone = msgObj.from.replace(/\D/g, '')

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up the customer by phone number (strip non-digits for matching)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, tenant_id, phone')

  // Match by stripping all non-digits from stored phone and comparing last 10 digits
  const last10 = (p: string) => p.replace(/\D/g, '').slice(-10)
  const customer = (customers ?? []).find(
    (c) => c.phone && last10(c.phone) === last10(fromPhone)
  )

  if (!customer) {
    // Unknown sender — log without customer_id under the first tenant that has this number
    // or just drop it silently
    console.log(`[quo-webhook] Unknown sender: ${msgObj.from}`)
    return NextResponse.json({ ok: true })
  }

  await supabase.from('messages').insert({
    tenant_id:    customer.tenant_id,
    customer_id:  customer.id,
    direction:    'inbound',
    channel:      'sms',
    body:         msgObj.body,
    from_address: msgObj.from,
    to_address:   msgObj.to ?? null,
    read_at:      null,
  })

  return NextResponse.json({ ok: true })
}
