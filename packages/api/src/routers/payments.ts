import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { router, tenantProcedure } from '../trpc'

export const paymentsRouter = router({
  // Create a Stripe Terminal payment intent
  createTerminalPaymentIntent: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      amount: z.number().int().positive(),
      reader_id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

      // Verify order belongs to tenant
      const { data: order, error: orderError } = await ctx.supabase
        .from('orders')
        .select('id, total_amount, tenant_id')
        .eq('id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (orderError || !order) throw new TRPCError({ code: 'NOT_FOUND' })

      const paymentIntent = await stripe.paymentIntents.create({
        amount: input.amount,
        currency: 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        metadata: {
          order_id: input.order_id,
          tenant_id: ctx.tenantId,
        },
      })

      // Present on reader
      await stripe.terminal.readers.processPaymentIntent(input.reader_id, {
        payment_intent: paymentIntent.id,
      })

      // Record pending payment
      await ctx.supabase.from('payments').insert({
        tenant_id: ctx.tenantId,
        order_id: input.order_id,
        amount: input.amount,
        method: 'card_present',
        status: 'pending',
        stripe_payment_intent_id: paymentIntent.id,
        stripe_terminal_reader_id: input.reader_id,
        processed_by: ctx.userId,
      })

      return { payment_intent_id: paymentIntent.id, status: paymentIntent.status }
    }),

  // Record a cash payment
  recordCashPayment: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      amount: z.number().int().positive(),
      cash_tendered: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const change_due = input.cash_tendered - input.amount

      const { data, error } = await ctx.supabase
        .from('payments')
        .insert({
          tenant_id: ctx.tenantId,
          order_id: input.order_id,
          amount: input.amount,
          method: 'cash',
          status: 'paid',
          cash_tendered: input.cash_tendered,
          change_due,
          processed_by: ctx.userId,
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ...data, change_due }
    }),

  // Record a non-cash manual payment (check, invoice, pay-on-collection, saved card)
  recordManualPayment: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      amount: z.number().int().positive(),
      method: z.enum(['card_terminal', 'saved_card', 'pay_on_collection', 'invoice']),
    }))
    .mutation(async ({ ctx, input }) => {
      const status = input.method === 'pay_on_collection' ? 'pending' : 'paid'
      const dbMethod = input.method === 'card_terminal' ? 'card_present' : input.method
      const { data, error } = await ctx.supabase
        .from('payments')
        .insert({
          tenant_id: ctx.tenantId,
          order_id: input.order_id,
          amount: input.amount,
          method: dbMethod,
          status,
          processed_by: ctx.userId,
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // List readers for this tenant's Stripe Terminal location
  listReaders: tenantProcedure.query(async ({ ctx }) => {
    const { data: tenant } = await ctx.supabase
      .from('tenants')
      .select('stripe_terminal_location_id')
      .eq('id', ctx.tenantId)
      .single()

    if (!tenant?.stripe_terminal_location_id) return []

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
    const readers = await stripe.terminal.readers.list({
      location: tenant.stripe_terminal_location_id,
    })

    return readers.data.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      device_type: r.device_type,
    }))
  }),
})
