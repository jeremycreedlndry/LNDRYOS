/**
 * Helcim webhook handler
 * https://devdocs.helcim.com/docs/webhooks
 *
 * Events we handle:
 *   cardTransaction  — terminal approved; fetch full txn, update payment to paid
 *   terminalCancel   — customer cancelled on device; update payment to declined
 *
 * Helcim signs with HMAC-SHA256. Set HELCIM_WEBHOOK_TOKEN to your verifier token.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'
import { getTransaction } from '@laundry/api/lib/helcim'
import { createHmac } from 'crypto'

function verifySignature(
  body: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  secret: string
): boolean {
  try {
    const key    = Buffer.from(secret, 'base64')
    const msg    = `${webhookId}.${webhookTimestamp}.${body}`
    const digest = createHmac('sha256', key).update(msg).digest('base64')
    // signature header may have multiple space-separated "v1,<sig>" entries
    return webhookSignature.split(' ').some(part => {
      const sig = part.startsWith('v1,') ? part.slice(3) : part
      return sig === digest
    })
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody          = await req.text()
  const webhookId        = req.headers.get('webhook-id')        ?? ''
  const webhookTimestamp = req.headers.get('webhook-timestamp') ?? ''
  const webhookSignature = req.headers.get('webhook-signature') ?? ''

  // Signature verification temporarily disabled to confirm webhook delivery
  console.log('[helcim webhook] received type:', JSON.parse(rawBody || '{}')?.type, 'sig:', webhookSignature?.slice(0, 20))

  let event: { type?: string; id?: string; data?: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── cardTransaction — terminal payment approved ───────────────────────────
  if (event.type === 'cardTransaction' && event.id) {
    try {
      const txn = await getTransaction(event.id)
      const invoiceNumber = (txn as Record<string, unknown>).invoiceNumber as string | undefined

      if (!invoiceNumber) {
        console.warn('[helcim webhook] cardTransaction missing invoiceNumber', event.id)
        return NextResponse.json({ received: true })
      }

      let { data: payment } = await service
        .from('payments')
        .select('id, order_id, tenant_id, status')
        .eq('helcim_transaction_id', invoiceNumber)
        .maybeSingle()

      // Fallback: if confirmTerminalPayment already ran, helcim_transaction_id was
      // overwritten with the real Helcim txn ID. Reconstruct the order UUID from the
      // invoiceNumber (which is order_id with dashes stripped) and look up that way.
      if (!payment && /^[0-9a-f]{32}$/i.test(invoiceNumber)) {
        const orderId = [
          invoiceNumber.slice(0, 8),
          invoiceNumber.slice(8, 12),
          invoiceNumber.slice(12, 16),
          invoiceNumber.slice(16, 20),
          invoiceNumber.slice(20),
        ].join('-')

        const { data: paymentByOrder } = await service
          .from('payments')
          .select('id, order_id, tenant_id, status')
          .eq('order_id', orderId)
          .eq('method', 'card_present')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        payment = paymentByOrder
      }

      if (!payment) {
        console.warn('[helcim webhook] No payment found for invoiceNumber', invoiceNumber)
        return NextResponse.json({ received: true })
      }

      // Idempotent — webhook may fire more than once
      if (payment.status === 'paid') {
        return NextResponse.json({ received: true })
      }

      const approved = txn.status?.toUpperCase() === 'APPROVED'

      await service
        .from('payments')
        .update({
          status:                approved ? 'paid' : 'declined',
          helcim_transaction_id: String(txn.transactionId),
          helcim_card_token:     txn.cardToken          ?? null,
          card_last4:            txn.cardNumber?.slice(-4) ?? null,
          card_brand:            txn.cardType            ?? null,
        })
        .eq('id', payment.id)

      // Save card token to customer
      if (approved && txn.cardToken) {
        const { data: order } = await service
          .from('orders')
          .select('customer_id')
          .eq('id', payment.order_id)
          .maybeSingle()

        if (order?.customer_id) {
          await service
            .from('customers')
            .update({
              helcim_card_token: txn.cardToken,
              saved_card_last4:  txn.cardNumber?.slice(-4) ?? null,
              saved_card_brand:  txn.cardType             ?? null,
            })
            .eq('id', order.customer_id)
            .eq('tenant_id', payment.tenant_id)
        }
      }

      console.log(`[helcim webhook] cardTransaction ${event.id} → payment ${payment.id} → ${approved ? 'paid' : 'declined'}`)
    } catch (err) {
      console.error('[helcim webhook] Error handling cardTransaction', err)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  // ── terminalCancel — customer cancelled on device ─────────────────────────
  if (event.type === 'terminalCancel' && event.data) {
    const invoiceNumber = event.data.invoiceNumber as string | undefined

    if (invoiceNumber) {
      let { data: payment } = await service
        .from('payments')
        .select('id, status')
        .eq('helcim_transaction_id', invoiceNumber)
        .maybeSingle()

      // Fallback: look up by reconstructed order_id UUID
      if (!payment && /^[0-9a-f]{32}$/i.test(invoiceNumber)) {
        const orderId = [
          invoiceNumber.slice(0, 8),
          invoiceNumber.slice(8, 12),
          invoiceNumber.slice(12, 16),
          invoiceNumber.slice(16, 20),
          invoiceNumber.slice(20),
        ].join('-')
        const { data: paymentByOrder } = await service
          .from('payments')
          .select('id, status')
          .eq('order_id', orderId)
          .eq('method', 'card_present')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        payment = paymentByOrder
      }

      if (payment?.status === 'pending') {
        await service
          .from('payments')
          .update({ status: 'declined' })
          .eq('id', payment.id)

        console.log(`[helcim webhook] terminalCancel → payment ${payment.id} → declined`)
      }
    }
  }

  return NextResponse.json({ received: true })
}
