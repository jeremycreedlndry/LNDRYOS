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
  // Returns the card from our DB. If not found, tries Nayax and returns a
  // preview so staff can import it. Does NOT create a record automatically.
  lookup: tenantProcedure
    .input(z.object({ display_number: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const num = input.display_number.replace(/\s/g, '')

      // Check our DB first
      const { data: existing } = await ctx.supabase
        .from('customer_gift_cards')
        .select(`
          id, card_display_number, card_unique_identifier, card_id,
          balance_cents, status, notes,
          customer:customers(id, first_name, last_name)
        `)
        .eq('tenant_id', ctx.tenantId)
        .eq('card_display_number', num)
        .maybeSingle()

      if (existing) return { source: 'db' as const, card: existing }

      // Not in our DB — try Nayax so staff can import
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
      } catch {
        return { source: 'not_found' as const }
      }
    }),

  // ── Import a Nayax card into our DB (optionally link to a customer) ──────
  import: tenantProcedure
    .input(z.object({
      card_display_number:    z.string().min(1),
      card_unique_identifier: z.string().min(1),
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
