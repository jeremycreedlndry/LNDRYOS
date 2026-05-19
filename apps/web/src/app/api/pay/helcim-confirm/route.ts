/**
 * Called by the pay page after HelcimPay.js fires a successful payment event.
 * Records the payment, optionally saves the card token on the customer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST(req: NextRequest) {
  const {
    order_id,
    payment_token,
    transaction_id,
    amount_cents,
    card_token,
    card_last4,
    card_brand,
    save_card,
  } = await req.json()

  if (!order_id || !payment_token || !transaction_id) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify order + token
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, tenant_id, customer_id, payment_status, total_amount, paid_amount')
    .eq('id', order_id)
    .eq('payment_token', payment_token)
    .single()

  if (oErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.payment_status === 'paid') return NextResponse.json({ ok: true }) // idempotent

  const paidCents = amount_cents ?? (order.total_amount - order.paid_amount)

  // Record payment
  const { error: payErr } = await supabase.from('payments').insert({
    order_id:       order.id,
    tenant_id:      order.tenant_id,
    amount:         paidCents,
    method:         'card_online',
    payment_status: 'completed',
    processed_at:   new Date().toISOString(),
    notes:          `Helcim txn ${transaction_id}`,
  })
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Update order payment status
  const newPaid = (order.paid_amount ?? 0) + paidCents
  const isPaid  = newPaid >= order.total_amount
  await supabase
    .from('orders')
    .update({
      paid_amount:    newPaid,
      payment_status: isPaid ? 'paid' : 'partial',
      updated_at:     new Date().toISOString(),
    })
    .eq('id', order.id)

  // Save card token on customer if requested
  if (save_card && card_token && order.customer_id) {
    await supabase
      .from('customers')
      .update({
        helcim_card_token: card_token,
        saved_card_last4:  card_last4 ?? null,
        saved_card_brand:  card_brand ?? null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', order.customer_id)
  }

  return NextResponse.json({ ok: true })
}
