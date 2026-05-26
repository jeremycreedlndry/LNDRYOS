import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import {
  lookupCardByDisplayNumber,
  getCardBalance,
  addCreditToCard,
  deductCreditFromCard,
} from '../lib/nayax'

export const prepaidCardsRouter = router({

  // ── Look up card for POS checkout ────────────────────────────────────────
  // card_unique_identifier = the ID the NFC chip broadcasts (e.g. "1162872302")
  //   → also used for Nayax Lynx API calls, NOT shown to customers
  // display_number = what's printed on the card face (e.g. "1000000083")
  //   → typed manually when no tap reader is present
  lookup: tenantProcedure
    .input(z.object({
      card_unique_identifier: z.string().optional(),  // from NFC tap — preferred
      display_number:         z.string().optional(),  // typed manually
    }))
    .query(async ({ ctx, input }) => {
      if (!input.card_unique_identifier && !input.display_number) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Provide card_unique_identifier or display_number' })
      }

      const SELECT = `
        id, card_display_number, card_unique_identifier, card_id,
        balance_cents, status, notes,
        customer:customers(id, first_name, last_name)
      `

      // 1. Try card_unique_identifier first (exact, from NFC tap)
      if (input.card_unique_identifier) {
        const { data } = await ctx.supabase
          .from('customer_gift_cards')
          .select(SELECT)
          .eq('tenant_id', ctx.tenantId)
          .eq('card_unique_identifier', input.card_unique_identifier)
          .maybeSingle()
        if (data) return { source: 'db' as const, card: data }
      }

      // 2. Try display number (typed manually)
      if (input.display_number) {
        const num = input.display_number.replace(/\s/g, '')
        const { data } = await ctx.supabase
          .from('customer_gift_cards')
          .select(SELECT)
          .eq('tenant_id', ctx.tenantId)
          .eq('card_display_number', num)
          .maybeSingle()
        if (data) return { source: 'db' as const, card: data }

        // Not in our DB — try Nayax preview so staff can import
        try {
          const nayaxCard = await lookupCardByDisplayNumber(num)
          let balance_dollars: number | null = null
          try {
            balance_dollars = await getCardBalance(nayaxCard.CardUniqueIdentifier)
          } catch { /* balance unavailable */ }

          return {
            source: 'nayax' as const,
            preview: {
              card_display_number:    nayaxCard.CardDisplayNumber,
              card_unique_identifier: nayaxCard.CardUniqueIdentifier,
              card_id:                nayaxCard.CardID,
              holder_name:            nayaxCard.CardHolderName,
              balance_cents:          balance_dollars != null ? Math.round(balance_dollars * 100) : null,
            },
          }
        } catch { /* fall through */ }
      }

      return { source: 'not_found' as const }
    }),

  // ── Import a Nayax card into our DB (optionally link to a customer) ──────
  import: tenantProcedure
    .input(z.object({
      card_display_number:    z.string().min(1),  // printed on card face
      card_unique_identifier: z.string().min(1),  // NFC tap ID + Lynx API identifier
      card_id:                z.number().int().nullable().optional(),
      balance_cents:          z.number().int().min(0).default(0),
      customer_id:            z.string().uuid().nullable().optional(),
      notes:                  z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('customer_gift_cards')
        .insert({
          tenant_id:              ctx.tenantId,
          card_display_number:    input.card_display_number.replace(/\s/g, ''),
          card_unique_identifier: input.card_unique_identifier,
          card_id:                input.card_id ?? null,
          balance_cents:          input.balance_cents,
          customer_id:            input.customer_id ?? null,
          notes:                  input.notes ?? null,
          imported_at:            new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // ── List all cards for the tenant ────────────────────────────────────────
  listAll: tenantProcedure
    .input(z.object({
      limit:  z.number().int().positive().default(100),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('customer_gift_cards')
        .select(`
          id, card_display_number, balance_cents, status, notes, created_at, updated_at,
          customer:customers(id, first_name, last_name, phone)
        `)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .range(input?.offset ?? 0, (input?.offset ?? 0) + (input?.limit ?? 100) - 1)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── List cards for a customer ─────────────────────────────────────────────
  listForCustomer: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('customer_gift_cards')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('customer_id', input.customer_id)
        .order('created_at', { ascending: false })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── Link card to a customer ───────────────────────────────────────────────
  linkToCustomer: tenantProcedure
    .input(z.object({
      card_id:     z.string().uuid(),
      customer_id: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('customer_gift_cards')
        .update({ customer_id: input.customer_id, updated_at: new Date().toISOString() })
        .eq('id', input.card_id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Reload (add credit) ───────────────────────────────────────────────────
  reload: tenantProcedure
    .input(z.object({
      card_id:      z.string().uuid(),
      amount_cents: z.number().int().positive(),
      order_id:     z.string().uuid().nullable().optional(),
      notes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch card
      const { data: card } = await ctx.supabase
        .from('customer_gift_cards')
        .select('id, balance_cents, card_unique_identifier')
        .eq('id', input.card_id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' })

      const newBalance = card.balance_cents + input.amount_cents

      // Update our DB
      const { error } = await ctx.supabase
        .from('customer_gift_cards')
        .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
        .eq('id', input.card_id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Ledger entry
      await ctx.supabase.from('gift_card_transactions').insert({
        tenant_id:    ctx.tenantId,
        card_id:      input.card_id,
        order_id:     input.order_id ?? null,
        type:         'reload',
        amount_cents: input.amount_cents,
        balance_after: newBalance,
        notes:        input.notes ?? null,
        created_by:   ctx.userId,
      })

      // Mirror to Nayax (fire-and-forget)
      addCreditToCard(
        card.card_unique_identifier,
        input.amount_cents / 100,
        input.order_id ? `Reload — order ${input.order_id}` : 'Reload via LNDRYOS'
      ).catch(console.error)

      return { balance_cents: newBalance }
    }),

  // ── Charge (deduct) — called by payments.chargePrepaidCard ───────────────
  // Exported as a standalone procedure but also called internally from payments
  charge: tenantProcedure
    .input(z.object({
      card_id:      z.string().uuid(),
      amount_cents: z.number().int().positive(),
      order_id:     z.string().uuid(),
      notes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return chargeCardInternal(ctx.supabase, ctx.tenantId, ctx.userId, input)
    }),

  // ── Transaction history for a card ───────────────────────────────────────
  transactions: tenantProcedure
    .input(z.object({ card_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('gift_card_transactions')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('card_id', input.card_id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // ── Sync balance from Nayax into our DB (manual reconciliation) ──────────
  syncFromNayax: tenantProcedure
    .input(z.object({ card_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: card } = await ctx.supabase
        .from('customer_gift_cards')
        .select('card_unique_identifier, balance_cents')
        .eq('id', input.card_id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (!card) throw new TRPCError({ code: 'NOT_FOUND' })

      const nayaxBalance = await getCardBalance(card.card_unique_identifier)
      const nayaxCents = Math.round(nayaxBalance * 100)

      await ctx.supabase
        .from('customer_gift_cards')
        .update({ balance_cents: nayaxCents, updated_at: new Date().toISOString() })
        .eq('id', input.card_id)
        .eq('tenant_id', ctx.tenantId)

      return { balance_cents: nayaxCents, previous_cents: card.balance_cents }
    }),
})

// ── Shared internal charge helper (also used by payments router) ────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chargeCardInternal(
  supabase: any,
  tenantId: string,
  userId: string,
  input: { card_id: string; amount_cents: number; order_id: string; notes?: string | null }
) {
  // Lock-read the card
  const { data: card, error: fetchErr } = await supabase
    .from('customer_gift_cards')
    .select('id, balance_cents, card_unique_identifier, status')
    .eq('id', input.card_id)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' })
  if (card.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Card is not active' })
  if (card.balance_cents < input.amount_cents) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Insufficient balance — card has $${(card.balance_cents / 100).toFixed(2)}`,
    })
  }

  const newBalance = card.balance_cents - input.amount_cents

  // Deduct in our DB (source of truth)
  const { error: updateErr } = await supabase
    .from('customer_gift_cards')
    .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq('id', input.card_id)
    .eq('tenant_id', tenantId)
  if (updateErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateErr.message })

  // Ledger entry
  await supabase.from('gift_card_transactions').insert({
    tenant_id:     tenantId,
    card_id:       input.card_id,
    order_id:      input.order_id,
    type:          'charge',
    amount_cents:  -input.amount_cents,
    balance_after: newBalance,
    notes:         input.notes ?? null,
    created_by:    userId,
  })

  // Mirror deduction to Nayax (fire-and-forget — our DB is source of truth)
  deductCreditFromCard(
    card.card_unique_identifier,
    input.amount_cents / 100,
    `Order ${input.order_id}`
  ).catch(console.error)

  return { balance_cents: newBalance }
}
