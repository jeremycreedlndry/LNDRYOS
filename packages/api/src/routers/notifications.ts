import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendEmail, receiptEmail, orderInvoiceEmail, APP_URL } from '../lib/email'

export const notificationsRouter = router({
  // Send a receipt email for a paid order
  sendReceipt: tenantProcedure
    .input(z.object({ order_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: order } = await ctx.supabase
        .from('orders')
        .select(`
          *,
          customer:customers(first_name, last_name, email),
          lines:order_lines(name, quantity, unit_label, unit_price, line_total),
          payments(method, amount, processed_at)
        `)
        .eq('id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!order) throw new TRPCError({ code: 'NOT_FOUND' })

      const email = (order.customer as { email?: string | null } | null)?.email
      if (!email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has no email address' })

      const { data: tenant } = await ctx.supabase
        .from('tenants')
        .select('name, settings')
        .eq('id', ctx.tenantId)
        .single()

      const storeName = tenant?.name ?? 'Laundry'
      const storePhone = (tenant?.settings as { phone?: string })?.phone ?? null
      const customer = order.customer as { first_name: string; last_name: string } | null
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Customer'
      const payments = (order.payments as { method: string; amount: number; processed_at?: string }[]) ?? []

      const { subject, html } = receiptEmail({
        storeName,
        storePhone,
        customerName,
        orderNumber: order.order_number,
        lines: (order.lines as { name: string; quantity: number; unit_label: string; unit_price: number; line_total: number }[]) ?? [],
        subtotal: order.subtotal,
        taxAmount: order.tax_amount,
        total: order.total_amount,
        paidAmount: order.paid_amount,
        payments,
      })

      await sendEmail({ to: email, subject, html, replyTo: storePhone ?? undefined })
      return { sent: true }
    }),

  // Send an invoice email (unpaid order, with pay link)
  sendInvoice: tenantProcedure
    .input(z.object({ order_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: order } = await ctx.supabase
        .from('orders')
        .select(`
          *,
          customer:customers(first_name, last_name, email),
          lines:order_lines(name, quantity, unit_label, unit_price, line_total)
        `)
        .eq('id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!order) throw new TRPCError({ code: 'NOT_FOUND' })

      const email = (order.customer as { email?: string | null } | null)?.email
      if (!email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has no email address' })

      const { data: tenant } = await ctx.supabase
        .from('tenants')
        .select('name, settings')
        .eq('id', ctx.tenantId)
        .single()

      const storeName = tenant?.name ?? 'Laundry'
      const storePhone = (tenant?.settings as { phone?: string })?.phone ?? null
      const customer = order.customer as { first_name: string; last_name: string } | null
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Customer'
      const balance = order.total_amount - order.paid_amount

      const paymentLink = `${APP_URL}/pay/${order.id}?t=${order.payment_token}`

      const { subject, html } = orderInvoiceEmail({
        storeName,
        storePhone,
        customerName,
        orderNumber: order.order_number,
        lines: (order.lines as { name: string; quantity: number; unit_label: string; unit_price: number; line_total: number }[]) ?? [],
        subtotal: order.subtotal,
        taxAmount: order.tax_amount,
        total: order.total_amount,
        balance,
        paymentLink,
      })

      await sendEmail({ to: email, subject, html })
      return { sent: true }
    }),
})
