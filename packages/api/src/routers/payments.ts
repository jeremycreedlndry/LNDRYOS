import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import {
  listDevices,
  purchaseWithTerminal,
  verifyWithTerminal,
  chargeCardToken,
  getTransaction,
  getTransactionByInvoice,
  initializeHelcimPay,
} from '../lib/helcim'
import { chargeCardInternal } from './prepaidCards'

// ─── Shared helper: record a payment row ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordPayment(
  supabase: any,
  params: {
    tenantId:           string
    orderId:            string
    amount:             number
    method:             string
    status:             'paid' | 'pending' | 'declined'
    processedBy:        string
    helcimTransactionId?: string
    helcimCardToken?:   string
    cardLast4?:         string
    cardBrand?:         string
    cashTendered?:      number
    changeDue?:         number
  }
) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      tenant_id:            params.tenantId,
      order_id:             params.orderId,
      amount:               params.amount,
      method:               params.method,
      status:               params.status,
      processed_by:         params.processedBy,
      helcim_transaction_id: params.helcimTransactionId,
      helcim_card_token:    params.helcimCardToken,
      card_last4:           params.cardLast4,
      card_brand:           params.cardBrand,
      cash_tendered:        params.cashTendered,
      change_due:           params.changeDue,
    })
    .select()
    .single()

  if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
  return data
}

export const paymentsRouter = router({

  // ── List Helcim devices (card readers / smart terminals) ──────────────────
  // Returns registered hardware devices — the 4-char code is used to initiate
  // a purchase on a specific device via POST /devices/{code}/payment/purchase
  listTerminals: tenantProcedure.query(async () => {
    try {
      const devices = await listDevices()
      // Normalise to the shape the POS already expects
      return devices.map(d => ({
        terminalId:   d.code,
        terminalName: d.code,   // Helcim devices only expose the code, no nickname
        status:       'ACTIVE',
        currency:     'CAD',
      }))
    } catch {
      return []
    }
  }),

  // ── Poll a Helcim transaction (for terminal payment status) ───────────────
  // 1. Check our own DB by paymentId (fast — webhook updates this instantly)
  // 2. Fall back to Helcim API if still pending (localhost / missed webhook)
  pollTransaction: tenantProcedure
    .input(z.object({ transactionId: z.string(), paymentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      // Fast path — look up by our own payment ID (unaffected by helcim_transaction_id rewrites)
      if (input.paymentId) {
        const { data: payment } = await ctx.supabase
          .from('payments')
          .select('status, helcim_transaction_id')
          .eq('id', input.paymentId)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle()

        if (payment?.status === 'paid')     return { transactionId: payment.helcim_transaction_id ?? input.transactionId, status: 'APPROVED' }
        if (payment?.status === 'declined') return { transactionId: input.transactionId, status: 'DECLINED' }
      }

      // Still pending — fall back to Helcim API (localhost where webhooks can't reach)
      if (/^[0-9a-f]{32}$/i.test(input.transactionId)) {
        const txn = await getTransactionByInvoice(input.transactionId)
        if (txn) return txn
        return { transactionId: input.transactionId, status: 'PENDING' }
      }
      return getTransaction(input.transactionId)
    }),

  // ── Terminal purchase ─────────────────────────────────────────────────────
  chargeTerminal: tenantProcedure
    .input(z.object({
      order_id:    z.string().uuid(),
      amount:      z.number().int().positive(),
      terminal_id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const idempotencyKey = input.order_id.replace(/-/g, '')

      // Use order_id (without dashes) as the invoiceNumber so we can poll for
      // the transaction after Helcim returns 202 with an empty body
      const invoiceNumber = idempotencyKey  // same value: order_id without dashes

      try {
        await purchaseWithTerminal({
          amountCents:    input.amount,
          deviceCode:     input.terminal_id,
          idempotencyKey,
          invoiceNumber,
        })
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
      }

      // Payment is pending — record it now; confirmTerminalPayment updates it on approval
      const payment = await recordPayment(ctx.supabase, {
        tenantId:            ctx.tenantId,
        orderId:             input.order_id,
        amount:              input.amount,
        method:              'card_present',
        status:              'pending',
        processedBy:         ctx.userId,
        helcimTransactionId: invoiceNumber,  // placeholder until real txn ID known
      })

      return {
        ...payment,
        helcim_transaction_id: invoiceNumber,
        initial_status: 'PENDING',
      }
    }),

  // ── Confirm terminal payment (after polling shows APPROVED) ──────────────
  confirmTerminalPayment: tenantProcedure
    .input(z.object({
      payment_id:         z.string().uuid(),
      helcim_transaction_id: z.string(),
      customer_id:        z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if webhook already confirmed this payment — if so, short-circuit
      const { data: existing } = await ctx.supabase
        .from('payments')
        .select('status, helcim_card_token, card_last4, card_brand')
        .eq('id', input.payment_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (existing?.status === 'paid') {
        return { approved: true, card_last4: existing.card_last4, card_brand: existing.card_brand }
      }

      // Webhook hasn't fired yet (localhost) — fetch from Helcim as fallback
      let txn
      if (/^[0-9a-f]{32}$/i.test(input.helcim_transaction_id)) {
        txn = await getTransactionByInvoice(input.helcim_transaction_id)
        if (!txn) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' })
      } else {
        txn = await getTransaction(input.helcim_transaction_id)
      }
      const approved = txn.status?.toUpperCase() === 'APPROVED'

      const { error } = await ctx.supabase
        .from('payments')
        .update({
          status:                approved ? 'paid' : 'declined',
          helcim_transaction_id: String(txn.transactionId),
          helcim_card_token:     txn.cardToken          ?? null,
          card_last4:            txn.cardNumber?.slice(-4) ?? null,
          card_brand:            txn.cardType            ?? null,
        })
        .eq('id', input.payment_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Save card token to customer if we got one
      if (txn.cardToken && input.customer_id) {
        await ctx.supabase
          .from('customers')
          .update({
            helcim_card_token: txn.cardToken,
            saved_card_last4:  txn.cardNumber?.slice(-4) ?? null,
            saved_card_brand:  txn.cardType ?? null,
          })
          .eq('id', input.customer_id)
          .eq('tenant_id', ctx.tenantId)
      }

      if (!approved) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Card declined` })
      }

      return { approved, card_last4: txn.cardNumber?.slice(-4), card_brand: txn.cardType }
    }),

  // ── Charge saved card token ───────────────────────────────────────────────
  chargeSavedCard: tenantProcedure
    .input(z.object({
      order_id:    z.string().uuid(),
      amount:      z.number().int().positive(),
      customer_id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the customer's saved token
      const { data: customer } = await ctx.supabase
        .from('customers')
        .select('helcim_card_token, saved_card_last4, saved_card_brand')
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!customer?.helcim_card_token) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No saved card on file' })
      }

      const idempotencyKey = input.order_id.replace(/-/g, '')

      let result
      try {
        result = await chargeCardToken({
          amountCents:    input.amount,
          cardToken:      customer.helcim_card_token,
          idempotencyKey,
          ipAddress:      ctx.ip,
        })
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
      }

      const approved = result.status?.toUpperCase() === 'APPROVED'
      if (!approved) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Card declined: ${result.status}` })
      }

      const payment = await recordPayment(ctx.supabase, {
        tenantId:            ctx.tenantId,
        orderId:             input.order_id,
        amount:              input.amount,
        method:              'saved_card',
        status:              'paid',
        processedBy:         ctx.userId,
        helcimTransactionId: String(result.transactionId),
        helcimCardToken:     customer.helcim_card_token,
        cardLast4:           customer.saved_card_last4 ?? undefined,
        cardBrand:           customer.saved_card_brand ?? undefined,
      })

      return {
        ...payment,
        approval_code: result.approvalCode,
      }
    }),

  // ── Cash payment ──────────────────────────────────────────────────────────
  recordCashPayment: tenantProcedure
    .input(z.object({
      order_id:     z.string().uuid(),
      amount:       z.number().int().positive(),
      cash_tendered: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const change_due = input.cash_tendered - input.amount
      const data = await recordPayment(ctx.supabase, {
        tenantId:     ctx.tenantId,
        orderId:      input.order_id,
        amount:       input.amount,
        method:       'cash',
        status:       'paid',
        processedBy:  ctx.userId,
        cashTendered: input.cash_tendered,
        changeDue:    change_due,
      })
      return { ...data, change_due }
    }),

  // ── Manual / non-card payment ─────────────────────────────────────────────
  recordManualPayment: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      amount:   z.number().int().positive(),
      method:   z.enum(['pay_on_collection', 'invoice', 'direct_deposit']),
    }))
    .mutation(async ({ ctx, input }) => {
      const status = input.method === 'pay_on_collection' ? 'pending' : 'paid'
      return recordPayment(ctx.supabase, {
        tenantId:    ctx.tenantId,
        orderId:     input.order_id,
        amount:      input.amount,
        method:      input.method,
        status,
        processedBy: ctx.userId,
      })
    }),

  // ── Card-on-file: verify via terminal (no charge, captures token) ────────
  verifyCardViaTerminal: tenantProcedure
    .input(z.object({
      terminal_id: z.string(),
      customer_id: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      // Use a random 32-char key as the invoiceNumber so we can poll later
      const invoiceNumber = crypto.randomUUID().replace(/-/g, '')
      try {
        await verifyWithTerminal({
          deviceCode:     input.terminal_id,
          idempotencyKey: invoiceNumber,
          invoiceNumber,
        })
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
      }
      return { invoiceNumber }
    }),

  // ── Card-on-file: poll verify result & save token ─────────────────────────
  pollCardVerify: tenantProcedure
    .input(z.object({
      invoiceNumber: z.string(),
      customer_id:   z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const txn = await getTransactionByInvoice(input.invoiceNumber)
      if (!txn) return { status: 'PENDING' as const }

      const status = txn.status?.toUpperCase()
      if (status === 'APPROVED' && txn.cardToken) {
        await ctx.supabase
          .from('customers')
          .update({
            helcim_card_token: txn.cardToken,
            saved_card_last4:  txn.cardNumber?.slice(-4) ?? null,
            saved_card_brand:  txn.cardType              ?? null,
          })
          .eq('id', input.customer_id)
          .eq('tenant_id', ctx.tenantId)
        return { status: 'APPROVED' as const, card_last4: txn.cardNumber?.slice(-4), card_brand: txn.cardType }
      }
      if (status === 'DECLINED') return { status: 'DECLINED' as const }
      return { status: 'PENDING' as const }
    }),

  // ── Card-on-file: init HelcimPay.js verify session (manual entry) ─────────
  initCardSaveSession: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .mutation(async () => {
      return initializeHelcimPay({ amountCents: 0, paymentType: 'verify' })
    }),

  // ── Card-on-file: save token returned by HelcimPay.js ────────────────────
  saveCardToken: tenantProcedure
    .input(z.object({
      customer_id: z.string().uuid(),
      card_token:  z.string(),
      card_last4:  z.string().nullable().optional(),
      card_brand:  z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('customers')
        .update({
          helcim_card_token: input.card_token,
          saved_card_last4:  input.card_last4  ?? null,
          saved_card_brand:  input.card_brand  ?? null,
        })
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),

  // ── Card-on-file: remove saved card ──────────────────────────────────────
  removeCard: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('customers')
        .update({
          helcim_card_token: null,
          saved_card_last4:  null,
          saved_card_brand:  null,
        })
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),

  // ── Prepaid (gift) card payment ───────────────────────────────────────────
  // Deducts from our DB (source of truth), mirrors to Nayax fire-and-forget,
  // then records a payment row so the order's paid_amount trigger fires.
  chargePrepaidCard: tenantProcedure
    .input(z.object({
      order_id:     z.string().uuid(),
      card_id:      z.string().uuid(),   // customer_gift_cards.id
      amount_cents: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Deduct balance from our DB + sync to Nayax
      const { balance_cents: remaining } = await chargeCardInternal(
        ctx.supabase,
        ctx.tenantId,
        ctx.userId,
        { card_id: input.card_id, amount_cents: input.amount_cents, order_id: input.order_id }
      )

      // 2. Record payment row (triggers order paid_amount update)
      const payment = await recordPayment(ctx.supabase, {
        tenantId:    ctx.tenantId,
        orderId:     input.order_id,
        amount:      input.amount_cents,
        method:      'gift_card',
        status:      'paid',
        processedBy: ctx.userId,
      })

      return { ...payment, remaining_balance_cents: remaining }
    }),
})
