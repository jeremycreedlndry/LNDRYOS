import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const tenantId = session.metadata?.tenant_id
      const plan = session.metadata?.plan
      const orderId = session.metadata?.order_id

      if (tenantId && plan) {
        await supabase
          .from('tenants')
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId)
      }

      // Online order payment via pay link
      if (orderId && tenantId && session.amount_total) {
        await supabase.from('payments').insert({
          tenant_id: tenantId,
          order_id: orderId,
          amount: session.amount_total,
          method: 'card_online',
          status: 'paid',
          stripe_payment_intent_id: session.payment_intent as string ?? null,
          processed_at: new Date().toISOString(),
        })

        // Recalculate paid_amount and payment_status
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('order_id', orderId)
          .eq('status', 'paid')

        const { data: order } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('id', orderId)
          .single()

        const paidAmount = (payments ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)
        const paymentStatus = order && paidAmount >= order.total_amount ? 'paid' : 'partial'

        await supabase
          .from('orders')
          .update({ paid_amount: paidAmount, payment_status: paymentStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await supabase
        .from('tenants')
        .update({
          status: sub.status === 'active' ? 'active' : 'suspended',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase
        .from('tenants')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      await supabase
        .from('payments')
        .update({ status: 'paid' })
        .eq('stripe_payment_intent_id', pi.id)
      break
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', pi.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
