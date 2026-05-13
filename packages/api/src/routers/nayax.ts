import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

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
})
