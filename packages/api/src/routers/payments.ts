import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import {
  listTerminals,
  purchaseWithCard,
  purchaseWithTerminal,
  chargeCardToken,
  getTransaction,
} from '../lib/helcim'

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

  // ── List Helcim terminals ──────────────────────────────────────────────────
  listTerminals: tenantProcedure.query(async () => {
    try {
      return await listTerminals()
    } catch {
      return []
    }
  }),

  // ── Poll a Helcim transaction (for terminal payment status) ───────────────
  pollTransaction: tenantProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return getTransaction(input.transactionId)
    }),

  // ── Keyed card entry (card-not-present) ───────────────────────────────────
  chargeKeyed: tenantProcedure
    .input(z.object({
      order_id:       z.string().uuid(),
      amount:         z.number().int().positive(),
      card_number:    z.string().min(13).max(19),
      card_expiry:    z.string().regex(/^\d{4}$/, 'Expiry must be MMYY'),
      card_cvv:       z.string().min(3).max(4),
      card_name:      z.string().optional(),
      save_card:      z.boolean().default(false),
      customer_id:    z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const idempotencyKey = `keyed-${input.order_id}-${Date.now()}`

      let result
      try {
        result = await purchaseWithCard({
          amountCents:     input.amount,
          cardNumber:      input.card_number,
          cardExpiry:      input.card_expiry,
          cardCVV:         input.card_cvv,
          cardHolderName:  input.card_name,
          saveCard:        input.save_card,
          idempotencyKey,
          ipAddress:       ctx.ip,
        })
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
      }

      const approved = result.status?.toUpperCase() === 'APPROVED'
      if (!approved) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Card declined: ${result.status}` })
      }

      // Save card token to customer if requested
      if (input.save_card && result.cardToken && input.customer_id) {
        await ctx.supabase
          .from('customers')
          .update({
            helcim_card_token:  result.cardToken,
            saved_card_last4:   result.cardNumber?.slice(-4) ?? null,
            saved_card_brand:   result.cardType ?? null,
          })
          .eq('id', input.customer_id)
          .eq('tenant_id', ctx.tenantId)
      }

      const payment = await recordPayment(ctx.supabase, {
        tenantId:             ctx.tenantId,
        orderId:              input.order_id,
        amount:               input.amount,
        method:               'card_present',
        status:               'paid',
        processedBy:          ctx.userId,
        helcimTransactionId:  String(result.transactionId),
        helcimCardToken:      result.cardToken,
        cardLast4:            result.cardNumber?.slice(-4),
        cardBrand:            result.cardType,
      })

      return {
        ...payment,
        card_last4: result.cardNumber?.slice(-4),
        card_brand: result.cardType,
        approval_code: result.approvalCode,
      }
    }),

  // ── Terminal purchase ─────────────────────────────────────────────────────
  chargeTerminal: tenantProcedure
    .input(z.object({
      order_id:    z.string().uuid(),
      amount:      z.number().int().positive(),
      terminal_id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const idempotencyKey = `terminal-${input.order_id}-${Date.now()}`

      let result
      try {
        result = await purchaseWithTerminal({
          amountCents:    input.amount,
          terminalId:     input.terminal_id,
          idempotencyKey,
        })
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message })
      }

      // Terminal payments start as pending — the UI polls pollTransaction
      const status = result.status?.toUpperCase() === 'APPROVED' ? 'paid' : 'pending'

      const payment = await recordPayment(ctx.supabase, {
        tenantId:            ctx.tenantId,
        orderId:             input.order_id,
        amount:              input.amount,
        method:              'card_present',
        status,
        processedBy:         ctx.userId,
        helcimTransactionId: String(result.transactionId),
      })

      return {
        ...payment,
        helcim_transaction_id: String(result.transactionId),
        initial_status: result.status,
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
      // Get final transaction data
      const txn = await getTransaction(input.helcim_transaction_id)
      const approved = txn.status?.toUpperCase() === 'APPROVED'

      const { error } = await ctx.supabase
        .from('payments')
        .update({
          status:            approved ? 'paid' : 'declined',
          helcim_card_token: txn.cardToken ?? null,
          card_last4:        txn.cardNumber?.slice(-4) ?? null,
          card_brand:        txn.cardType ?? null,
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

      const idempotencyKey = `saved-${input.order_id}-${Date.now()}`

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
})
