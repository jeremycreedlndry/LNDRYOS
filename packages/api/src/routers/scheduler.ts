import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

export const schedulerRouter = router({
  // ── Shifts ────────────────────────────────────────────────────────────────

  listShifts: tenantProcedure
    .input(z.object({
      date_from: z.string(),   // YYYY-MM-DD
      date_to:   z.string(),   // YYYY-MM-DD
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee_shifts')
        .select('id, user_id, shift_date, start_time, end_time, notes, created_by')
        .eq('tenant_id', ctx.tenantId)
        .gte('shift_date', input.date_from)
        .lte('shift_date', input.date_to)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  upsertShift: tenantProcedure
    .input(z.object({
      id:         z.string().uuid().optional(),   // present = edit, absent = create
      user_id:    z.string().uuid(),
      shift_dates: z.array(z.string()).min(1),    // one or more YYYY-MM-DD
      start_time: z.string(),                      // HH:MM
      end_time:   z.string(),                      // HH:MM
      notes:      z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Role guard — only managers/owners
      const { data: me } = await ctx.supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .single()
      if (!me || !['owner', 'manager'].includes(me.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only managers can edit shifts' })
      }

      const base = {
        tenant_id:  ctx.tenantId,
        user_id:    input.user_id,
        start_time: input.start_time,
        end_time:   input.end_time,
        notes:      input.notes ?? null,
        created_by: ctx.userId,
        updated_at: new Date().toISOString(),
      }

      if (input.id) {
        // Update single existing shift
        const { data, error } = await ctx.supabase
          .from('employee_shifts')
          .update({ ...base, shift_date: input.shift_dates[0] })
          .eq('id', input.id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single()
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
        return [data]
      }

      // Insert one row per date
      const rows = input.shift_dates.map((d) => ({ ...base, shift_date: d }))
      const { data, error } = await ctx.supabase
        .from('employee_shifts')
        .insert(rows)
        .select()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  swapShift: tenantProcedure
    .input(z.object({
      id:         z.string().uuid(),
      new_user_id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: me } = await ctx.supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .single()
      if (!me || !['owner', 'manager'].includes(me.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only managers can swap shifts' })
      }

      const { data, error } = await ctx.supabase
        .from('employee_shifts')
        .update({ user_id: input.new_user_id, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  deleteShift: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: me } = await ctx.supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', ctx.tenantId)
        .eq('user_id', ctx.userId)
        .single()
      if (!me || !['owner', 'manager'].includes(me.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only managers can delete shifts' })
      }

      const { error } = await ctx.supabase
        .from('employee_shifts')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  // ── Calendar token ────────────────────────────────────────────────────────

  getOrCreateToken: tenantProcedure.query(async ({ ctx }) => {
    const { data: existing } = await ctx.supabase
      .from('schedule_tokens')
      .select('token')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (existing) return existing

    const { data, error } = await ctx.supabase
      .from('schedule_tokens')
      .insert({ tenant_id: ctx.tenantId, user_id: ctx.userId })
      .select('token')
      .single()
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),

  resetToken: tenantProcedure.mutation(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('schedule_tokens')
      .update({ token: crypto.randomUUID(), updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .select('token')
      .single()
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),
})
