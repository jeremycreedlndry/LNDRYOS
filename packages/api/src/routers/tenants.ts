import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { router, tenantProcedure } from '../trpc'

export const tenantsRouter = router({
  getMembers: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('tenant_members')
      .select('user_id, display_name, role')
      .eq('tenant_id', ctx.tenantId)
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  getCurrent: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('tenants')
      .select('*')
      .eq('id', ctx.tenantId)
      .single()

    if (error) throw new TRPCError({ code: 'NOT_FOUND' })
    return data
  }),

  updateSettings: tenantProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      timezone: z.string().optional(),
      currency: z.string().length(3).optional(),
      address: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        province: z.string().optional(),
        postal_code: z.string().optional(),
        country: z.string().optional(),
        formatted: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      }).optional(),
      settings: z.object({
        receipt_footer: z.string().optional(),
        tax_rate: z.number().min(0).max(1).optional(),
        tax_name: z.string().optional(),
        tax_id: z.string().optional(),
        logo_url: z.string().url().optional(),
        phone: z.string().optional(),
        website_url: z.string().optional(),
        etransfer_email: z.string().email().optional(),
        offers_pickup_delivery: z.boolean().optional(),
        offers_wash_fold: z.boolean().optional(),
        hours: z.record(z.object({
          enabled: z.boolean(),
          open: z.string(),
          close: z.string(),
        })).optional(),
        require_customer_on_order: z.boolean().optional(),
        auto_sms_ready: z.boolean().optional(),
        auto_email_ready: z.boolean().optional(),
        default_due_days: z.number().int().positive().optional(),
        default_payment_type: z.enum([
          'saved_card', 'card_terminal', 'pay_on_collection', 'cash', 'direct_deposit', 'invoice',
        ]).optional(),
        order_preference_options: z.object({
          bleach: z.array(z.string()).optional(),
          dryer_sheets: z.array(z.string()).optional(),
          detergent_type: z.array(z.string()).optional(),
          fabric_softener: z.array(z.string()).optional(),
          wash_temperature: z.array(z.string()).optional(),
        }).optional(),
        helcim: z.object({
          terminal_id: z.string().optional(),
        }).optional(),
        hardware: z.object({
          receipt_printer: z.object({
            name: z.string().optional(),
            connection: z.enum(['network', 'usb', 'bluetooth']).optional(),
            address: z.string().optional(),
          }).optional(),
          label_printer: z.object({
            name: z.string().optional(),
            connection: z.enum(['network', 'usb', 'bluetooth']).optional(),
            address: z.string().optional(),
          }).optional(),
        }).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch current values to merge JSONB fields instead of overwriting
      const { data: current } = await ctx.supabase
        .from('tenants')
        .select('settings, address')
        .eq('id', ctx.tenantId)
        .single()

      const { settings, address, ...rest } = input
      const merged: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }
      if (settings !== undefined) {
        merged.settings = { ...(current?.settings as object ?? {}), ...settings }
      }
      if (address !== undefined) {
        merged.address = { ...(current?.address as object ?? {}), ...address }
      }

      const { data, error } = await ctx.supabase
        .from('tenants')
        .update(merged)
        .eq('id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // Create a Stripe Billing subscription checkout session
  createSubscriptionCheckout: tenantProcedure
    .input(z.object({
      plan: z.enum(['starter', 'professional', 'enterprise']),
      success_url: z.string().url(),
      cancel_url: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

      const { data: tenant } = await ctx.supabase
        .from('tenants')
        .select('stripe_customer_id, name')
        .eq('id', ctx.tenantId)
        .single()

      const priceMap: Record<string, string> = {
        starter: process.env.STRIPE_PRICE_STARTER!,
        professional: process.env.STRIPE_PRICE_PROFESSIONAL!,
        enterprise: process.env.STRIPE_PRICE_ENTERPRISE!,
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: tenant?.stripe_customer_id ?? undefined,
        line_items: [{ price: priceMap[input.plan], quantity: 1 }],
        success_url: input.success_url,
        cancel_url: input.cancel_url,
        metadata: { tenant_id: ctx.tenantId, plan: input.plan },
      })

      return { url: session.url }
    }),

  getSubscription: tenantProcedure.query(async ({ ctx }) => {
    const { data: tenant } = await ctx.supabase
      .from('tenants')
      .select('stripe_subscription_id, plan, status')
      .eq('id', ctx.tenantId)
      .single()

    if (!tenant?.stripe_subscription_id) return null

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
    const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id)

    return {
      plan: tenant.plan,
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
    }
  }),
})
