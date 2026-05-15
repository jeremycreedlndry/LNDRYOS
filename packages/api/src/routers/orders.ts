import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendEmail, orderCreatedEmail, orderReadyEmail, APP_URL } from '../lib/email'
import { sendSms, orderCreatedSms, orderReadySms, logMessage } from '../lib/sms'

const orderLineInputSchema = z.object({
  service_item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  category: z.enum(['wash_fold', 'dry_clean', 'press_only', 'alterations', 'other', 'gift_card', 'product', 'upcharge']),
  quantity: z.number().positive(),
  unit_price: z.number().int().nonnegative(),
  unit_label: z.string().default('item'),
  notes: z.string().nullable().optional(),
  tag_number: z.string().nullable().optional(),
})

const orderStatusSchema = z.enum(['cleaning', 'ready', 'picked_up', 'delivered', 'cancelled', 'pending', 'in_progress'])

export const ordersRouter = router({
  list: tenantProcedure
    .input(z.object({
      status: orderStatusSchema.optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('orders')
        .select(`
          *,
          customer:customers(id, first_name, last_name, phone, order_preferences),
          lines:order_lines(id, name, category, quantity, unit_label, unit_price, notes),
          assignments:order_equipment_assignments(duration_minutes, temperature, assigned_at, equipment:equipment(id, name, type)),
          issues:order_issues(id)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .range(input?.offset ?? 0, (input?.offset ?? 0) + (input?.limit ?? 50) - 1)

      if (input?.status) query = query.eq('status', input.status)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          lines:order_lines(*),
          payments(*),
          assignments:order_equipment_assignments(*, equipment:equipment(id, name, type))
        `)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (error) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  create: tenantProcedure
    .input(z.object({
      customer_id: z.string().uuid().nullable().optional(),
      customer_name: z.string().nullable().optional(),
      lines: z.array(orderLineInputSchema).min(1),
      notes: z.string().nullable().optional(),
      due_date: z.string().nullable().optional(),
      tax_rate: z.number().min(0).max(1).default(0),
      discount_amount: z.number().int().nonnegative().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const subtotal = input.lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unit_price), 0)
      const taxAmount = Math.round(subtotal * input.tax_rate)
      const total = subtotal + taxAmount - input.discount_amount

      const { data: lastOrder } = await ctx.supabase
        .from('orders')
        .select('order_number')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextNum = 1
      if (lastOrder?.order_number) {
        const match = lastOrder.order_number.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const orderNumber = `ORD-${String(nextNum).padStart(5, '0')}`

      const { data: order, error: orderError } = await ctx.supabase
        .from('orders')
        .insert({
          tenant_id: ctx.tenantId,
          order_number: orderNumber,
          customer_id: input.customer_id ?? null,
          customer_name: input.customer_name ?? null,
          status: 'cleaning',
          notes: input.notes ?? null,
          due_date: input.due_date ?? null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: input.discount_amount,
          total_amount: total,
          created_by: ctx.userId,
        })
        .select()
        .single()

      if (orderError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: orderError.message })

      const lines = input.lines.map((l) => ({
        order_id: order.id,
        tenant_id: ctx.tenantId,
        service_item_id: l.service_item_id ?? null,
        name: l.name,
        category: l.category,
        quantity: l.quantity,
        unit_price: l.unit_price,
        unit_label: l.unit_label,
        line_total: Math.round(l.quantity * l.unit_price),
        notes: l.notes ?? null,
        tag_number: l.tag_number ?? null,
      }))

      const { error: linesError } = await ctx.supabase.from('order_lines').insert(lines)
      if (linesError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: linesError.message })

      // Send order-created email (fire-and-forget)
      if (input.customer_id) {
        sendOrderCreatedEmail(ctx.supabase, ctx.tenantId, order, input.lines).catch(console.error)
      }

      return order
    }),

  // Create a shell pickup order (no lines, status = pending)
  createPickup: tenantProcedure
    .input(z.object({
      customer_id: z.string().uuid(),
      scheduled_date: z.string().nullable().optional(), // ISO date string
      notes: z.string().nullable().optional(),
      skip_stop: z.boolean().optional(), // caller will create the stop themselves
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: lastOrder } = await ctx.supabase
        .from('orders')
        .select('order_number')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextNum = 1
      if (lastOrder?.order_number) {
        const match = lastOrder.order_number.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const orderNumber = `ORD-${String(nextNum).padStart(5, '0')}`

      const { data: order, error } = await ctx.supabase
        .from('orders')
        .insert({
          tenant_id: ctx.tenantId,
          order_number: orderNumber,
          customer_id: input.customer_id,
          status: 'pending',
          notes: input.notes ?? null,
          due_date: input.scheduled_date ?? null,
          subtotal: 0,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: 0,
          created_by: ctx.userId,
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Create a pickup_stop so it appears on the /pickups dispatch board
      if (input.skip_stop) return order
      const stopDate = input.scheduled_date ?? new Date().toISOString().split('T')[0]
      await ctx.supabase.from('pickup_stops').insert({
        tenant_id: ctx.tenantId,
        customer_id: input.customer_id,
        order_id: order.id,
        type: 'pickup',
        scheduled_date: stopDate,
        status: 'pending',
        notes: input.notes ?? null,
      })

      return order
    }),

  // Replace lines on an existing open order and recalculate totals
  updateOrder: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      customer_id: z.string().uuid().nullable().optional(),
      customer_name: z.string().nullable().optional(),
      lines: z.array(orderLineInputSchema).min(1),
      tax_rate: z.number().min(0).max(1).default(0),
      discount_amount: z.number().int().nonnegative().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the order belongs to this tenant and is still editable
      const { data: existing, error: fetchErr } = await ctx.supabase
        .from('orders')
        .select('id, status, payment_status')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (fetchErr || !existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.status === 'picked_up' || existing.status === 'delivered') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit a completed order' })
      }

      const subtotal = input.lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unit_price), 0)
      const taxAmount = Math.round(subtotal * input.tax_rate)
      const total = subtotal + taxAmount - input.discount_amount

      // Replace all lines
      await ctx.supabase.from('order_lines').delete().eq('order_id', input.id).eq('tenant_id', ctx.tenantId)

      const lines = input.lines.map((l) => ({
        order_id: input.id,
        tenant_id: ctx.tenantId,
        service_item_id: l.service_item_id ?? null,
        name: l.name,
        category: l.category,
        quantity: l.quantity,
        unit_price: l.unit_price,
        unit_label: l.unit_label,
        line_total: Math.round(l.quantity * l.unit_price),
        notes: l.notes ?? null,
        tag_number: l.tag_number ?? null,
      }))

      const { error: linesErr } = await ctx.supabase.from('order_lines').insert(lines)
      if (linesErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: linesErr.message })

      // If detailing a pending pickup, advance status to cleaning
      const newStatus = existing.status === 'pending' ? 'cleaning' : existing.status

      const { data: updated, error: updateErr } = await ctx.supabase
        .from('orders')
        .update({
          customer_id: input.customer_id ?? null,
          customer_name: input.customer_name ?? null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: input.discount_amount,
          total_amount: total,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (updateErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateErr.message })

      // Send order-created notifications when detailing a previously pending pickup
      if (existing.status === 'pending' && input.customer_id) {
        sendOrderCreatedEmail(ctx.supabase, ctx.tenantId, updated, input.lines).catch(console.error)
      }

      return updated
    }),

  updateStatus: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: orderStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const update: Record<string, unknown> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      }
      if (input.status === 'ready') update.ready_at = new Date().toISOString()
      if (input.status === 'picked_up') update.picked_up_at = new Date().toISOString()

      const { data, error } = await ctx.supabase
        .from('orders')
        .update(update)
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Send order-ready email (fire-and-forget)
      if (input.status === 'ready' && data.customer_id) {
        sendOrderReadyEmail(ctx.supabase, ctx.tenantId, data).catch(console.error)
      }

      return data
    }),

  getDailySummary: tenantProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const start = `${input.date}T00:00:00.000Z`
      const end = `${input.date}T23:59:59.999Z`

      const { data, error } = await ctx.supabase
        .from('orders')
        .select('id, total_amount, paid_amount, payment_status, status')
        .eq('tenant_id', ctx.tenantId)
        .gte('created_at', start)
        .lte('created_at', end)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      const orders = data ?? []
      return {
        order_count: orders.length,
        total_revenue: orders.reduce((s, o) => s + o.total_amount, 0),
        collected: orders.reduce((s, o) => s + o.paid_amount, 0),
        outstanding: orders.filter((o) => o.payment_status !== 'paid').reduce((s, o) => s + (o.total_amount - o.paid_amount), 0),
      }
    }),
})

// ─── Email helpers (fire-and-forget) ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTenantInfo(supabase: any, tenantId: string) {
  const { data } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single()
  return {
    storeName: (data?.name as string) ?? 'Laundry',
    storePhone: ((data?.settings as Record<string, unknown>)?.phone as string | undefined) ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendOrderCreatedEmail(supabase: any, tenantId: string, order: any, lines: { name: string; quantity: number; unit_label: string; unit_price: number }[]) {
  const { data: customer } = await supabase.from('customers').select('first_name, last_name, email, phone, notification_preference').eq('id', order.customer_id).single()
  if (!customer) return

  const pref: string = customer.notification_preference ?? 'sms_email'
  if (pref === 'none') return

  const { storeName, storePhone } = await getTenantInfo(supabase, tenantId)

  if ((pref === 'email' || pref === 'sms_email') && customer.email) {
    const { subject, html } = orderCreatedEmail({
      storeName, storePhone,
      customerName: `${customer.first_name} ${customer.last_name}`,
      orderNumber: order.order_number,
      lines: lines.map((l) => ({ ...l, line_total: Math.round(l.quantity * l.unit_price) })),
      subtotal: order.subtotal,
      taxAmount: order.tax_amount,
      total: order.total_amount,
      notes: order.notes ?? null,
    })
    await sendEmail({ to: customer.email, subject, html })
    await logMessage(supabase, { tenant_id: tenantId, customer_id: order.customer_id, direction: 'outbound', channel: 'email', body: `Order #${order.order_number} received — being cleaned now.`, subject, to_address: customer.email })
  }

  if ((pref === 'sms' || pref === 'sms_email') && customer.phone) {
    const body = orderCreatedSms(storeName, order.order_number)
    await sendSms(customer.phone, body)
    await logMessage(supabase, { tenant_id: tenantId, customer_id: order.customer_id, direction: 'outbound', channel: 'sms', body, to_address: customer.phone })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendOrderReadyEmail(supabase: any, tenantId: string, order: any) {
  const { data: fullOrder } = await supabase
    .from('orders')
    .select('*, customer:customers(first_name, last_name, email, phone, notification_preference), lines:order_lines(name, quantity, unit_label, unit_price, line_total)')
    .eq('id', order.id)
    .single()
  if (!fullOrder?.customer) return

  const pref: string = fullOrder.customer.notification_preference ?? 'sms_email'
  if (pref === 'none') return

  const { storeName, storePhone } = await getTenantInfo(supabase, tenantId)
  const isPaid = fullOrder.payment_status === 'paid'
  const paymentLink = `${APP_URL}/pay/${order.id}?t=${fullOrder.payment_token}`

  const customerId = fullOrder.customer_id as string

  // Email
  if ((pref === 'email' || pref === 'sms_email') && fullOrder.customer.email) {
    const { subject, html } = orderReadyEmail({
      storeName, storePhone,
      customerName: `${fullOrder.customer.first_name} ${fullOrder.customer.last_name}`,
      orderNumber: fullOrder.order_number,
      lines: fullOrder.lines ?? [],
      subtotal: fullOrder.subtotal,
      taxAmount: fullOrder.tax_amount,
      total: fullOrder.total_amount,
      isPaid,
      paymentLink: isPaid ? undefined : paymentLink,
    })
    await sendEmail({ to: fullOrder.customer.email, subject, html })
    await logMessage(supabase, { tenant_id: tenantId, customer_id: customerId, direction: 'outbound', channel: 'email', body: `Order #${fullOrder.order_number} is ready for pickup!`, subject, to_address: fullOrder.customer.email })
  }

  // SMS
  if ((pref === 'sms' || pref === 'sms_email') && fullOrder.customer.phone) {
    const body = orderReadySms(storeName, fullOrder.order_number, isPaid ? undefined : paymentLink)
    await sendSms(fullOrder.customer.phone, body)
    await logMessage(supabase, { tenant_id: tenantId, customer_id: customerId, direction: 'outbound', channel: 'sms', body, to_address: fullOrder.customer.phone })
  }
}
