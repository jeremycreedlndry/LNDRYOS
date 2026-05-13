import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST(req: NextRequest) {
  const { order_id, payment_token } = await req.json()

  if (!order_id || !payment_token) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the token matches
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, total_amount, paid_amount, payment_status, payment_token, tenant_id,
      lines:order_lines(name, quantity, unit_price, line_total),
      tenant:tenants(name)
    `)
    .eq('id', order_id)
    .eq('payment_token', payment_token)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (order.payment_status === 'paid') {
    return NextResponse.json({ error: 'Already paid' }, { status: 400 })
  }

  const balance = order.total_amount - order.paid_amount
  if (balance <= 0) {
    return NextResponse.json({ error: 'Nothing due' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const storeName = (order.tenant as unknown as { name: string } | null)?.name ?? 'Laundry'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: `${storeName} — Order #${order.order_number}`,
        },
        unit_amount: balance,
      },
      quantity: 1,
    }],
    metadata: {
      order_id: order.id,
      tenant_id: order.tenant_id,
      payment_token,
    },
    success_url: `${appUrl}/pay/${order.id}/success?t=${payment_token}`,
    cancel_url: `${appUrl}/pay/${order.id}?t=${payment_token}`,
  })

  return NextResponse.json({ url: session.url })
}
