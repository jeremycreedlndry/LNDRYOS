import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendEmail, orderCreatedEmail, orderReadyEmail, APP_URL } from '../lib/email'
import { sendSms, orderCreatedSms, orderReadySms, logMessage } from '../lib/sms'
import { chargeCardToken } from '../lib/helcim'

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
      status:           orderStatusSchema.optional(),
      exclude_statuses: z.array(orderStatusSchema).optional(),
      limit:            z.number().default(50),
      offset:           z.number().default(0),
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
      if (input?.exclude_statuses?.length) query = query.not('status', 'in', `(${input.exclude_statuses.join(',')})`)

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
      const taxableSubtotal = input.lines
        .filter((l) => l.category !== 'gift_card')
        .reduce((sum, l) => sum + Math.round(l.quantity * l.unit_price), 0)
      const taxAmount = Math.round(taxableSubtotal * input.tax_rate)
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
      const taxableSubtotal = input.lines
        .filter((l) => l.category !== 'gift_card')
        .reduce((sum, l) => sum + Math.round(l.quantity * l.unit_price), 0)
      const taxAmount = Math.round(taxableSubtotal * input.tax_rate)
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

      // Send order-ready email + auto-charge saved card (fire-and-forget)
      if (input.status === 'ready' && data.customer_id) {
        sendOrderReadyEmail(ctx.supabase, ctx.tenantId, data).catch(console.error)
        autoChargeIfSavedCard(ctx.supabase, ctx.tenantId, data).catch(console.error)
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

  // ─── Record payment against an order ─────────────────────────────────────────
  recordPayment: tenantProcedure
    .input(z.object({
      order_id:     z.string().uuid(),
      amount_cents: z.number().int().positive(),
      method:       z.enum(['cash', 'card_present', 'card_online', 'e_transfer', 'cheque', 'account_credit', 'invoice', 'pay_on_collection']),
      notes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: order } = await ctx.supabase
        .from('orders')
        .select('id, total_amount, paid_amount, payment_status')
        .eq('id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!order) throw new TRPCError({ code: 'NOT_FOUND' })

      const { error: payErr } = await ctx.supabase.from('payments').insert({
        tenant_id:      ctx.tenantId,
        order_id:       input.order_id,
        amount:         input.amount_cents,
        method:         input.method,
        payment_status: 'completed',
        processed_at:   new Date().toISOString(),
        processed_by:   ctx.userId,
        notes:          input.notes ?? null,
      })
      if (payErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: payErr.message })

      const newPaid  = (order.paid_amount ?? 0) + input.amount_cents
      const newStatus: string = newPaid >= order.total_amount ? 'paid' : 'partial'

      await ctx.supabase.from('orders').update({
        paid_amount:    newPaid,
        payment_status: newStatus,
        updated_at:     new Date().toISOString(),
      }).eq('id', input.order_id).eq('tenant_id', ctx.tenantId)

      return { success: true, status: newStatus }
    }),

  // ─── Advanced search ──────────────────────────────────────────────────────────
  search: tenantProcedure
    .input(z.object({
      query:           z.string().optional(),
      status:          orderStatusSchema.optional(),
      payment_status:  z.enum(['paid', 'unpaid', 'partial']).optional(),
      created_after:   z.string().optional(),
      created_before:  z.string().optional(),
      ready_after:     z.string().optional(),
      ready_before:    z.string().optional(),
      limit:           z.number().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const q = input.query?.trim()

      // ── Step 1: resolve matching customer IDs ─────────────────────────────
      // Split multi-word queries (e.g. "Jeremy Creed") into individual words
      // and intersect results so both words must match somewhere on the customer.
      let customerIds: string[] | null = null

      if (q) {
        const words = q.split(/\s+/).filter(Boolean)

        // Fetch customers matching each word separately, then intersect
        const perWord = await Promise.all(
          words.map((word) =>
            ctx.supabase
              .from('customers')
              .select('id')
              .eq('tenant_id', ctx.tenantId)
              .or(
                `first_name.ilike.%${word}%,last_name.ilike.%${word}%,phone.ilike.%${word}%,email.ilike.%${word}%`
              )
              .limit(500)
          )
        )

        // Intersect: a customer must match every word
        const sets = perWord.map((r) => new Set((r.data ?? []).map((c) => c.id)))
        customerIds = [...sets[0]].filter((id) => sets.every((s) => s.has(id)))
      }

      // ── Step 2: build orders query ─────────────────────────────────────────
      let query = ctx.supabase
        .from('orders')
        .select(`
          id, order_number, status, payment_status, total_amount, paid_amount,
          created_at, ready_at, picked_up_at, due_date, notes, created_by,
          customer:customers(id, first_name, last_name, phone, email, address_street, address_city, order_preferences),
          lines:order_lines(id, name, category, quantity, unit_label, unit_price),
          payments:payments(id, amount, method, processed_at, processed_by)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (input.status)         query = query.eq('status', input.status)
      if (input.payment_status) query = query.eq('payment_status', input.payment_status)
      if (input.created_after)  query = query.gte('created_at', input.created_after)
      if (input.created_before) query = query.lte('created_at', input.created_before + 'T23:59:59')
      if (input.ready_after)    query = query.gte('ready_at', input.ready_after)
      if (input.ready_before)   query = query.lte('ready_at', input.ready_before + 'T23:59:59')

      // Apply text filter at DB level
      if (q) {
        if (customerIds && customerIds.length > 0) {
          // Also check if it might be an order number (no spaces)
          if (!q.includes(' ')) {
            query = query.or(
              `order_number.ilike.%${q}%,customer_id.in.(${customerIds.join(',')})`
            )
          } else {
            query = query.in('customer_id', customerIds)
          }
        } else if (!q.includes(' ')) {
          // No customer match — try order number only
          query = query.ilike('order_number', `%${q}%`)
        } else {
          return []
        }
      }

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── Get preference selections from customer's last order for a service ───
  lastPrefsForService: tenantProcedure
    .input(z.object({
      customerId:    z.string().uuid(),
      serviceItemId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      // 1. Try the most recent order line notes for this customer + service
      const { data: line } = await ctx.supabase
        .from('order_lines')
        .select('notes, orders!inner(customer_id, tenant_id, status)')
        .eq('service_item_id', input.serviceItemId)
        .eq('orders.customer_id', input.customerId)
        .eq('orders.tenant_id', ctx.tenantId)
        .neq('orders.status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (line?.notes) return { notesString: line.notes as string }

      // 2. Fall back to the customer's saved order_preferences
      const { data: customer } = await ctx.supabase
        .from('customers')
        .select('order_preferences')
        .eq('id', input.customerId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()

      const prefs = customer?.order_preferences as Record<string, string> | null
      if (!prefs || Object.keys(prefs).length === 0) return null

      // Convert {bleach: 'Yes', wash_temperature: 'Cold'} → "Yes · Cold" notes string
      const notesString = Object.values(prefs).filter(Boolean).join(' · ')
      return notesString ? { notesString } : null
    }),

  // ── Cancel (soft-delete) an order ────────────────────────────────────────
  // Requires owner/manager role, or staff with permissions.delete_orders = true
  cancel: tenantProcedure
    .input(z.object({
      id:     z.string().uuid(),
      reason: z.string().min(1, 'Reason is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Permission check — staff with delete_orders perm, manager, or owner
      const { data: member } = await ctx.supabase
        .from('tenant_members')
        .select('role, permissions')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .maybeSingle()

      const role  = member?.role as string | undefined
      const perms = (member?.permissions ?? {}) as Record<string, unknown>
      // If role can't be determined (e.g. DB issue), default to allowing within the tenant
      const allowed = !role || role === 'owner' || role === 'manager' || perms.delete_orders === true

      if (!allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to delete orders' })
      }

      // Verify order belongs to this tenant and is not already cancelled
      const { data: order } = await ctx.supabase
        .from('orders')
        .select('id, status, order_number')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle()

      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
      if (order.status === 'cancelled') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Order is already cancelled' })

      const { error } = await ctx.supabase
        .from('orders')
        .update({
          status:               'cancelled',
          cancelled_at:         new Date().toISOString(),
          cancellation_reason:  input.reason,
          cancelled_by:         ctx.userId,
        })
        .eq('id', input.id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      return { id: order.id, order_number: order.order_number }
    }),
})

// ─── Auto-charge helper (fire-and-forget) ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoChargeIfSavedCard(supabase: any, tenantId: string, order: any) {
  // Only charge if there's an outstanding balance
  const balance = (order.total_amount ?? 0) - (order.paid_amount ?? 0)
  if (balance <= 0 || order.payment_status === 'paid') return
  if (!order.customer_id) return

  // Fetch customer's saved card token
  const { data: customer } = await supabase
    .from('customers')
    .select('helcim_card_token, first_name, last_name')
    .eq('id', order.customer_id)
    .single()

  if (!customer?.helcim_card_token) return  // no saved card, nothing to do

  // Charge the saved card
  let txn
  try {
    txn = await chargeCardToken({
      amountCents:    balance,
      cardToken:      customer.helcim_card_token,
      idempotencyKey: `order-ready-${order.id}`,
      currency:       'CAD',
    })
  } catch (err) {
    console.error('[auto-charge] Helcim charge failed for order', order.id, err)
    return
  }

  if (!txn || (txn.status && String(txn.status).toLowerCase() !== 'approved')) {
    console.warn('[auto-charge] Charge not approved for order', order.id, txn?.status)
    return
  }

  // Record payment
  const { error: payErr } = await supabase.from('payments').insert({
    order_id:       order.id,
    tenant_id:      tenantId,
    amount:         balance,
    method:         'card_online',
    payment_status: 'completed',
    processed_at:   new Date().toISOString(),
    notes:          `Auto-charge (saved card) · Helcim txn ${txn.transactionId}`,
  })
  if (payErr) {
    console.error('[auto-charge] Failed to insert payment record', payErr.message)
    return
  }

  // Mark order paid
  await supabase
    .from('orders')
    .update({
      paid_amount:    order.total_amount,
      payment_status: 'paid',
      updated_at:     new Date().toISOString(),
    })
    .eq('id', order.id)

  console.log(`[auto-charge] Charged ${balance} cents for order ${order.id} (txn ${txn.transactionId})`)
}

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
  const { data: customer } = await supabase.from('customers').select('first_name, last_name, email, phone, notification_preference, notification_topics').eq('id', order.customer_id).single()
  if (!customer) return

  const pref: string = customer.notification_preference ?? 'sms_email'
  if (pref === 'none') return
  const topics = (customer.notification_topics ?? {}) as Record<string, boolean>
  if (topics.order_confirmed === false) return

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
    const paymentLink = `${APP_URL}/pay/${order.id}?t=${order.payment_token}`
    const body = orderCreatedSms(storeName, order.order_number, order.total_amount, paymentLink)
    await sendSms(customer.phone, body)
    await logMessage(supabase, { tenant_id: tenantId, customer_id: order.customer_id, direction: 'outbound', channel: 'sms', body, to_address: customer.phone })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendOrderReadyEmail(supabase: any, tenantId: string, order: any) {
  const { data: fullOrder } = await supabase
    .from('orders')
    .select('*, customer:customers(first_name, last_name, email, phone, notification_preference, notification_topics), lines:order_lines(name, quantity, unit_label, unit_price, line_total)')
    .eq('id', order.id)
    .single()
  if (!fullOrder?.customer) return

  const pref: string = fullOrder.customer.notification_preference ?? 'sms_email'
  if (pref === 'none') return
  const topics = (fullOrder.customer.notification_topics ?? {}) as Record<string, boolean>
  if (topics.order_ready === false) return

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
