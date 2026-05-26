/**
 * Called by the pay page after HelcimPay.js fires a successful payment event.
 *
 * Supports two flows:
 *   - Order payment:  { order_id, payment_token, transaction_id, amount_cents, ... }
 *   - Invoice payment: { invoice_id, transaction_id, amount_cents }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Invoice payment flow ──────────────────────────────────────────────────
  if (body.invoice_id) {
    const { invoice_id, transaction_id, amount_cents } = body

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('id, tenant_id, total_cents, status')
      .eq('id', invoice_id)
      .single()

    if (invErr || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (inv.status === 'paid')  return NextResponse.json({ ok: true }) // idempotent

    const paidCents = amount_cents ?? inv.total_cents

    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        status:     'paid',
        paid_at:    new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Log in invoice_payments if the table exists (best-effort, ignore errors)
    try {
      await supabase.from('invoice_payments').insert({
        invoice_id,
        tenant_id:    inv.tenant_id,
        amount_cents: paidCents,
        method:       'card_online',
        processed_at: new Date().toISOString(),
        notes:        transaction_id ? `Helcim txn ${transaction_id}` : null,
      })
    } catch { /* table may not exist yet */ }

    return NextResponse.json({ ok: true })
  }

  // ── Order payment flow ────────────────────────────────────────────────────
  const {
    order_id,
    payment_token,
    transaction_id,
    amount_cents,
    card_token,
    card_last4,
    card_brand,
    save_card,
  } = body

  if (!order_id || !payment_token) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

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
    order_id:              order.id,
    tenant_id:             order.tenant_id,
    amount:                paidCents,
    method:                'card_online',
    status:                'paid',
    processed_by:          null,
    helcim_transaction_id: transaction_id ? String(transaction_id) : null,
    card_last4:            card_last4 ?? null,
    card_brand:            card_brand ?? null,
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
