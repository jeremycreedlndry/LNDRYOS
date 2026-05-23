import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendEmail, invoiceEmail } from '../lib/email'
import { generateInvoicePdf } from '../lib/invoice-pdf'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextInvoiceNumber(supabase: any, tenantId: string): Promise<string> {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const last = data?.invoice_number as string | null
  const lastNum = last ? parseInt(last.replace(/\D/g, '') || '0', 10) : 0
  return `INV-${String(lastNum + 1).padStart(4, '0')}`
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const invoicesRouter = router({
  // ── List invoices ────────────────────────────────────────────────────────

  list: tenantProcedure
    .input(z.object({
      status:         z.enum(['all', 'draft', 'unpaid', 'paid', 'void']).default('unpaid'),
      recipient_type: z.enum(['all', 'customer', 'business_account']).default('all'),
    }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from('invoices')
        .select(`
          id, invoice_number, recipient_type, status,
          issue_date, due_date, total_cents, sent_at, paid_at, created_at,
          customer:customers(id, first_name, last_name, email),
          business_account:business_accounts(id, name, email)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })

      if (input?.status && input.status !== 'all') q = q.eq('status', input.status)
      if (input?.recipient_type && input.recipient_type !== 'all') q = q.eq('recipient_type', input.recipient_type)

      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── Get single invoice with full order details ───────────────────────────

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: inv, error } = await ctx.supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone, address_street, address_city, address_postal_code),
          business_account:business_accounts(id, name, email, phone, address, city, province, postal_code, payment_terms_days)
        `)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (error || !inv) throw new TRPCError({ code: 'NOT_FOUND' })

      // Fetch linked orders with lines
      const { data: invOrders } = await ctx.supabase
        .from('invoice_orders')
        .select(`
          order:orders(
            id, order_number, status, created_at, due_date,
            subtotal, tax_amount, total_amount, paid_amount,
            customer:customers(id, first_name, last_name),
            lines:order_lines(name, category, quantity, unit_price, line_total)
          )
        `)
        .eq('invoice_id', input.id)
        .eq('tenant_id', ctx.tenantId)

      const orders = (invOrders ?? []).map((r) => r.order).filter(Boolean)

      // Fetch tenant for logo, tax info, and address
      const { data: tenant } = await ctx.supabase
        .from('tenants')
        .select('name, settings, address')
        .eq('id', ctx.tenantId)
        .single()

      return { ...inv, orders, tenant }
    }),

  // ── Preview orders that would be included ───────────────────────────────
  // Call before creating to show the employee what will be billed.

  previewOrders: tenantProcedure
    .input(z.object({
      recipient_type:      z.enum(['customer', 'business_account']),
      customer_id:         z.string().uuid().optional(),
      business_account_id: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Get list of customer IDs to search
      let customerIds: string[] = []

      if (input.recipient_type === 'customer' && input.customer_id) {
        customerIds = [input.customer_id]
      } else if (input.recipient_type === 'business_account' && input.business_account_id) {
        const { data: members } = await ctx.supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('business_account_id', input.business_account_id)
        customerIds = (members ?? []).map((c) => c.id)
      }

      if (customerIds.length === 0) return []

      // Find unpaid/partially-paid orders NOT already on an active (non-void) invoice
      const { data: alreadyInvoiced } = await ctx.supabase
        .from('invoice_orders')
        .select('order_id, invoice:invoices!inner(status)')
        .eq('tenant_id', ctx.tenantId)
        .neq('invoice.status', 'void')

      const excludeOrderIds = (alreadyInvoiced ?? []).map((r) => r.order_id)

      let q = ctx.supabase
        .from('orders')
        .select(`
          id, order_number, status, created_at, due_date,
          subtotal, tax_amount, total_amount, paid_amount,
          customer:customers(id, first_name, last_name)
        `)
        .eq('tenant_id', ctx.tenantId)
        .in('customer_id', customerIds)
        .in('payment_status', ['unpaid', 'partial'])
        .order('created_at', { ascending: true })

      if (excludeOrderIds.length > 0) q = q.not('id', 'in', `(${excludeOrderIds.join(',')})`)

      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── Create invoice ───────────────────────────────────────────────────────

  create: tenantProcedure
    .input(z.object({
      recipient_type:      z.enum(['customer', 'business_account']),
      customer_id:         z.string().uuid().optional(),
      business_account_id: z.string().uuid().optional(),
      order_ids:           z.array(z.string().uuid()).min(1, 'Select at least one order'),
      due_date:            z.string().nullable().optional(),   // ISO date string
      notes:               z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Pull the orders to compute totals
      const { data: orders, error: ordErr } = await ctx.supabase
        .from('orders')
        .select('id, total_amount, paid_amount, tax_amount')
        .eq('tenant_id', ctx.tenantId)
        .in('id', input.order_ids)

      if (ordErr || !orders?.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid orders found' })

      const subtotal_cents = orders.reduce((s, o) => s + (o.total_amount - (o.tax_amount ?? 0)), 0)
      const tax_cents      = orders.reduce((s, o) => s + (o.tax_amount ?? 0), 0)
      const total_cents    = orders.reduce((s, o) => s + (o.total_amount - (o.paid_amount ?? 0)), 0)

      const invoice_number = await nextInvoiceNumber(ctx.supabase, ctx.tenantId)

      const { data: inv, error: invErr } = await ctx.supabase
        .from('invoices')
        .insert({
          tenant_id:           ctx.tenantId,
          invoice_number,
          recipient_type:      input.recipient_type,
          customer_id:         input.customer_id ?? null,
          business_account_id: input.business_account_id ?? null,
          status:              'unpaid',
          due_date:            input.due_date ?? null,
          subtotal_cents,
          tax_cents,
          total_cents,
          notes:               input.notes ?? null,
          created_by:          ctx.userId,
        })
        .select()
        .single()

      if (invErr || !inv) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: invErr?.message ?? 'Failed to create invoice' })

      // Link orders to invoice
      const { error: linkErr } = await ctx.supabase
        .from('invoice_orders')
        .insert(input.order_ids.map((order_id) => ({
          invoice_id: inv.id,
          order_id,
          tenant_id: ctx.tenantId,
        })))

      if (linkErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: linkErr.message })

      return inv
    }),

  // ── Update status (mark paid, void, etc.) ───────────────────────────────

  updateStatus: tenantProcedure
    .input(z.object({
      id:     z.string().uuid(),
      status: z.enum(['draft', 'unpaid', 'paid', 'void']),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {
        status:     input.status,
        updated_at: new Date().toISOString(),
      }
      if (input.status === 'paid') patch.paid_at = new Date().toISOString()
      if (input.status !== 'paid') patch.paid_at = null

      const { error } = await ctx.supabase
        .from('invoices')
        .update(patch)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Record a payment against an invoice ─────────────────────────────────

  recordPayment: tenantProcedure
    .input(z.object({
      invoice_id:   z.string().uuid(),
      amount_cents: z.number().int().positive(),
      method:       z.enum(['cash', 'card_present', 'card_online', 'account_credit', 'e_transfer', 'cheque', 'direct_deposit', 'invoice']),
      notes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get invoice total
      const { data: inv } = await ctx.supabase
        .from('invoices')
        .select('id, total_cents, status')
        .eq('id', input.invoice_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!inv) throw new TRPCError({ code: 'NOT_FOUND' })

      // Mark invoice paid if payment covers the balance
      const newStatus = input.amount_cents >= inv.total_cents ? 'paid' : 'unpaid'
      const { error } = await ctx.supabase
        .from('invoices')
        .update({
          status:     newStatus,
          paid_at:    newStatus === 'paid' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.invoice_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true, status: newStatus }
    }),

  // ── Send invoice email (CC + e-Transfer options) ─────────────────────────────

  sendInvoice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      const { data: inv, error: invErr } = await ctx.supabase
        .from('invoices')
        .select(`*, customer:customers(id, first_name, last_name, email, notification_topics), business_account:business_accounts(id, name, email)`)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (invErr || !inv) throw new TRPCError({ code: 'NOT_FOUND' })

      const recipientEmail: string | null =
        inv.recipient_type === 'business_account'
          ? (inv.business_account as { email?: string | null } | null)?.email ?? null
          : (inv.customer as { email?: string | null } | null)?.email ?? null

      const recipientName: string =
        inv.recipient_type === 'business_account'
          ? (inv.business_account as { name: string } | null)?.name ?? 'Valued Customer'
          : inv.customer
            ? `${(inv.customer as { first_name: string; last_name: string }).first_name} ${(inv.customer as { first_name: string; last_name: string }).last_name}`
            : 'Valued Customer'

      if (!recipientEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recipient has no email address on file' })
      }

      // Check billing notification topic (individual customers only; business accounts always receive)
      if (inv.recipient_type !== 'business_account') {
        const topics = ((inv.customer as { notification_topics?: Record<string, boolean> } | null)?.notification_topics ?? {})
        if (topics.billing === false) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has billing notifications disabled' })
        }
      }

      const { data: tenant } = await ctx.supabase
        .from('tenants').select('name, settings, address').eq('id', ctx.tenantId).single()

      const settings       = (tenant?.settings ?? {}) as Record<string, unknown>
      const storeName      = tenant?.name ?? 'Your Laundry Store'
      const storePhone     = (settings.phone as string | null) ?? null
      const etransferEmail = (settings.etransfer_email as string | null) ?? null
      const logoUrl        = (settings.logo_url as string | null) ?? null
      const taxName        = (settings.tax_name as string | null) ?? 'Tax'
      const taxId          = (settings.tax_id as string | null) ?? null
      const tenantAddress  = (tenant?.address ?? {}) as Record<string, unknown>
      const storeAddress   = (tenantAddress.formatted as string | null)
        ?? [tenantAddress.street, tenantAddress.city, tenantAddress.province].filter(Boolean).join(', ')

      const { data: invOrders } = await ctx.supabase
        .from('invoice_orders')
        .select(`order:orders(
          id, order_number, created_at, ready_at,
          total_amount, paid_amount,
          customer:customers(first_name, last_name),
          lines:order_lines(name, quantity, line_total)
        )`)
        .eq('invoice_id', input.id)
        .eq('tenant_id', ctx.tenantId)

      type SendOrder = {
        id: string; order_number: string; created_at: string; ready_at?: string | null
        total_amount: number; paid_amount: number
        customer?: { first_name: string; last_name: string } | null
        lines: { name: string; quantity: number; line_total: number }[]
      }
      const fullOrders = ((invOrders ?? []).map((r) => r.order).filter(Boolean)) as unknown as SendOrder[]

      // Recipient address for PDF
      type RecipBA = { name: string; address?: string | null; city?: string | null; province?: string | null; postal_code?: string | null }
      type RecipCust = { first_name: string; last_name: string; address_street?: string | null; address_city?: string | null; address_postal_code?: string | null }
      const ba   = inv.business_account as RecipBA | null
      const cust = inv.customer as RecipCust | null
      const isBA = inv.recipient_type === 'business_account'
      const recipAddr1 = isBA ? (ba?.address ?? null) : (cust?.address_street ?? null)
      const recipAddr2 = isBA
        ? [ba?.city, ba?.province, ba?.postal_code].filter(Boolean).join(', ')
        : [cust?.address_city, cust?.address_postal_code].filter(Boolean).join(', ')

      // Date range reference
      const orderDates = fullOrders.map((o) => new Date(o.created_at).getTime())
      const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
      const minD = orderDates.length ? fmtShort(new Date(Math.min(...orderDates)).toISOString()) : ''
      const maxD = orderDates.length ? fmtShort(new Date(Math.max(...orderDates)).toISOString()) : ''
      const reference = minD && maxD && minD !== maxD ? `${minD} – ${maxD}` : (minD || '—')

      const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })

      // Generate PDF
      let pdfBuffer: Buffer | null = null
      try {
        pdfBuffer = await generateInvoicePdf({
          invoiceNumber:   inv.invoice_number,
          issueDate:       inv.issue_date,
          dueDate:         inv.due_date ?? null,
          status:          inv.status,
          storeName, storeAddress: storeAddress || null, storePhone, logoUrl,
          taxName, taxId,
          recipientName,
          recipientAddress1: recipAddr1 || null,
          recipientAddress2: recipAddr2 || null,
          orders: fullOrders.map((o) => ({
            id:          o.id,
            orderNumber: o.order_number,
            createdAt:   o.created_at,
            readyAt:     o.ready_at ?? null,
            totalAmount: o.total_amount,
            paidAmount:  o.paid_amount,
            lines:       (o.lines ?? []).map((l) => ({ name: l.name, quantity: l.quantity, lineTotal: l.line_total })),
          })),
          subtotalCents: inv.subtotal_cents,
          taxCents:      inv.tax_cents,
          totalCents:    inv.total_cents,
          reference,
        })
      } catch (pdfErr) {
        console.error('[invoice] PDF generation failed:', pdfErr instanceof Error ? pdfErr.stack : pdfErr)
        // Continue without PDF — email will still send without attachment
      }

      const { subject, html } = invoiceEmail({
        storeName,
        storeAddress:   storeAddress || null,
        storePhone,
        logoUrl,
        recipientName,
        invoiceNumber:  inv.invoice_number,
        invoiceDate:    fmtDate(inv.issue_date),
        dueDate:        inv.due_date ? fmtDate(inv.due_date) : null,
        reference,
        taxName,
        taxId,
        orders: fullOrders.map((o) => ({
          orderNumber: o.order_number,
          createdAt:   fmtDate(o.created_at),
          lines:       (o.lines ?? []).map((l) => ({
            name:      l.name,
            quantity:  l.quantity,
            lineTotal: l.line_total,
          })),
          balance: o.total_amount - (o.paid_amount ?? 0),
        })),
        subtotal:       inv.subtotal_cents,
        taxAmount:      inv.tax_cents,
        total:          inv.total_cents,
        paymentPageUrl: `${appUrl}/pay/invoice/${input.id}`,
        etransferEmail,
        notes:          inv.notes ?? null,
      })

      await sendEmail({
        to: recipientEmail, subject, html,
        ...(pdfBuffer ? { attachments: [{ filename: `${inv.invoice_number}.pdf`, content: pdfBuffer }] } : {}),
      })

      await ctx.supabase
        .from('invoices')
        .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', input.id).eq('tenant_id', ctx.tenantId)

      return { success: true }
    }),

  // ── Mark as sent (internal) ───────────────────────────────────────────────

  markSent: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('invoices')
        .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Delete (void) an invoice ─────────────────────────────────────────────

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('invoices')
        .update({ status: 'void', updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
