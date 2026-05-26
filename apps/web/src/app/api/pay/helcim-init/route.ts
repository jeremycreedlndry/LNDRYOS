import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

async function initHelcimPay(amountCents: number) {
  const token = process.env.HELCIM_API_TOKEN
  if (!token) throw new Error('HELCIM_API_TOKEN is not set')

  const res = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-token': token,
    },
    body: JSON.stringify({
      paymentType: 'purchase',
      amount: +(amountCents / 100).toFixed(2),
      currency: 'CAD',
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message ?? json?.message ?? `HTTP ${res.status}`
    throw new Error(`Helcim init: ${msg}`)
  }
  return json as { checkoutToken: string; secretToken: string }
}

export async function POST(req: NextRequest) {
  const { order_id, payment_token, tip_cents } = await req.json()

  if (!order_id || !payment_token) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, total_amount, paid_amount, payment_status, customer_id')
    .eq('id', order_id)
    .eq('payment_token', payment_token)
    .single()

  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.payment_status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  const balance  = order.total_amount - order.paid_amount
  const tipCents = Math.max(0, Math.round(tip_cents ?? 0))
  const total    = balance + tipCents

  if (total <= 0) return NextResponse.json({ error: 'Nothing due' }, { status: 400 })

  try {
    const session = await initHelcimPay(total)
    return NextResponse.json({ checkoutToken: session.checkoutToken, total_cents: total })
  } catch (err) {
    console.error('Helcim init error:', err)
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}
