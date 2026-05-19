import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import {
  lookupCardByDisplayNumber,
  getCardBalance,
  addCreditToCard,
  getLastTransactionByCard,
} from '../lib/nayax'

export const nayaxRouter = router({
  // List all staff members with their Nayax card IDs (for settings)
  listStaff: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('tenant_members')
      .select('id, user_id, display_name, email, nayax_card_id')
      .eq('tenant_id', ctx.tenantId)
      .order('display_name')

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  updateStaffCard: tenantProcedure
    .input(z.object({
      member_id: z.string().uuid(),
      nayax_card_id: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('tenant_members')
        .update({ nayax_card_id: input.nayax_card_id || null })
        .eq('id', input.member_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // List unresolved taps for the current user (to recover missed realtime events)
  listPendingTaps: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('pending_taps')
      .select('*, equipment:equipment(id, name, type)')
      .eq('tenant_id', ctx.tenantId)
      .eq('employee_user_id', ctx.userId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  // Resolve: assign the order to the machine and start the timer
  resolveTap: tenantProcedure
    .input(z.object({
      tap_id: z.string().uuid(),
      order_id: z.string().uuid(),
      duration_minutes: z.number().int().positive().nullable().optional(),
      temperature: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the tap to find equipment + tapped_at
      const { data: tap, error: tapError } = await ctx.supabase
        .from('pending_taps')
        .select('equipment_id, tapped_at')
        .eq('id', input.tap_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (tapError || !tap) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!tap.equipment_id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No equipment linked to this tap' })

      // Upsert the equipment assignment using the real tap timestamp
      const { error: assignError } = await ctx.supabase
        .from('order_equipment_assignments')
        .upsert({
          order_id: input.order_id,
          equipment_id: tap.equipment_id,
          tenant_id: ctx.tenantId,
          assigned_by: ctx.userId,
          assigned_at: tap.tapped_at,
          duration_minutes: input.duration_minutes ?? null,
          temperature: input.temperature ?? null,
        }, { onConflict: 'order_id,equipment_id' })

      if (assignError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: assignError.message })

      // Also set order status to cleaning if still pending/in_progress
      await ctx.supabase
        .from('orders')
        .update({ status: 'cleaning' })
        .eq('id', input.order_id)
        .eq('tenant_id', ctx.tenantId)
        .in('status', ['pending', 'in_progress'])

      // Mark tap resolved
      const { error: resolveError } = await ctx.supabase
        .from('pending_taps')
        .update({ resolved: true, resolved_order_id: input.order_id, resolved_at: new Date().toISOString() })
        .eq('id', input.tap_id)
        .eq('tenant_id', ctx.tenantId)

      if (resolveError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: resolveError.message })
      return { success: true }
    }),

  // Dev/test: insert a fake pending_tap for the current user + a given machine
  simulateTap: tenantProcedure
    .input(z.object({ equipment_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the equipment to find its nayax_device_id
      const { data: equip } = await ctx.supabase
        .from('equipment')
        .select('id, nayax_device_id')
        .eq('id', input.equipment_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!equip) throw new TRPCError({ code: 'NOT_FOUND' })

      const { error } = await ctx.supabase
        .from('pending_taps')
        .insert({
          tenant_id: ctx.tenantId,
          equipment_id: equip.id,
          employee_user_id: ctx.userId,
          nayax_device_id: equip.nayax_device_id ?? 'simulated',
          nayax_card_id: 'simulated',
          tapped_at: new Date().toISOString(),
        })

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  dismissTap: tenantProcedure
    .input(z.object({ tap_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('pending_taps')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', input.tap_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ─── Last machine used by the current employee ────────────────────────────
  //
  // Queries Nayax Lynx API for the most recent vend on the employee's card.
  // Returns the machine name + timestamp so the app can prompt "assign to order?"
  getLastMachineUsed: tenantProcedure
    .input(z.object({
      minutes: z.number().int().positive().default(120), // look back window
    }).optional())
    .query(async ({ ctx, input }) => {
      // Get this employee's Nayax card number
      const { data: member } = await ctx.supabase
        .from('tenant_members')
        .select('nayax_card_id, display_name')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .single()

      if (!member?.nayax_card_id) return null

      let txn
      try {
        txn = await getLastTransactionByCard(member.nayax_card_id, input?.minutes ?? 120)
      } catch (err) {
        console.error('[nayax] getLastMachineUsed failed:', err)
        return null
      }

      if (!txn?.machineName) return null

      // Try to match machine name to equipment in our DB
      const { data: equipment } = await ctx.supabase
        .from('equipment')
        .select('id, name, type')
        .eq('tenant_id', ctx.tenantId)
        .ilike('name', txn.machineName)
        .maybeSingle()

      return {
        machine_name:  txn.machineName,
        authorized_at: txn.authorizedAt,
        amount:        txn.amount,
        equipment,     // null if name didn't match anything in our DB
      }
    }),

  // ─── Gift card (Lynx API) ──────────────────────────────────────────────────

  /**
   * Look up a physical gift card by its 10-digit display number and return
   * its current balance. Called before the transaction so staff can see if
   * the card is new ($0) or already has funds loaded.
   */
  lookupGiftCard: tenantProcedure
    .input(z.object({ display_number: z.string().min(1).max(20) }))
    .query(async ({ input }) => {
      try {
        const card = await lookupCardByDisplayNumber(input.display_number)
        if (!card?.CardUniqueIdentifier) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' })
        }

        // Balance uses CardUniqueIdentifier (string), endpoint is /credit not /prepaid
        let balance_dollars: number | null = null
        try {
          balance_dollars = await getCardBalance(card.CardUniqueIdentifier)
        } catch {
          // Card exists but balance unavailable — treat as $0
          balance_dollars = 0
        }

        return {
          card_unique_identifier: card.CardUniqueIdentifier,
          card_id: card.CardID,
          display_number: card.CardDisplayNumber,
          // CardStatus 1 = Active
          status: card.CardStatus === 1 ? 'Active' : card.CardStatus != null ? String(card.CardStatus) : null,
          holder_name: card.CardHolderName ?? null,
          balance_dollars,
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Failed to look up card',
        })
      }
    }),

  /**
   * Load funds onto a physical gift card after payment has been collected.
   * Amount is in cents (our internal representation); we convert to dollars
   * before calling the Nayax API.
   */
  loadGiftCard: tenantProcedure
    .input(z.object({
      card_unique_identifier: z.string().min(1),
      amount_cents:           z.number().int().positive(),
      order_number:           z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const amountDollars = input.amount_cents / 100
        const result = await addCreditToCard(
          input.card_unique_identifier,
          amountDollars,
          input.order_number ? `Order ${input.order_number}` : undefined
        )
        return {
          success: true,
          new_balance_dollars: result,  // addCreditToCard returns a plain number
        }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to load gift card',
        })
      }
    }),
})
