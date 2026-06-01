import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

const permissionsSchema = z.object({
  pos:              z.boolean().optional(),
  orders:           z.boolean().optional(),
  delete_orders:    z.boolean().optional(),
  edit_paid_orders: z.boolean().optional(),
  customers:        z.boolean().optional(),
  add_customers:    z.boolean().optional(),
  edit_customers:   z.boolean().optional(),
  add_credits:      z.boolean().optional(),
  manage_invoices:  z.boolean().optional(),
  reports:          z.boolean().optional(),
  settings:         z.boolean().optional(),
  staff:            z.boolean().optional(),
  equipment:        z.boolean().optional(),
})

export const staffRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('tenant_members')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at')
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  invite: tenantProcedure
    .input(z.object({
      display_name:      z.string().min(1),
      email:             z.string().email(),
      password:          z.string().min(8),
      phone:             z.string().optional(),
      role:              z.enum(['owner', 'manager', 'staff']).default('staff'),
      hourly_rate_cents: z.number().int().nonnegative().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create the auth user with email + password directly (no invite email)
      let userId: string
      const { data: authData, error: createError } = await ctx.supabase.auth.admin.createUser({
        email:          input.email,
        password:       input.password,
        email_confirm:  true,
        user_metadata:  { display_name: input.display_name },
      })

      if (createError) {
        // Already exists — look up by email and reuse
        const { data: existingList } = await ctx.supabase.auth.admin.listUsers()
        const existing = existingList?.users?.find((u) => u.email === input.email)
        if (!existing) throw new TRPCError({ code: 'BAD_REQUEST', message: createError.message })
        // Update their password to the new one
        await ctx.supabase.auth.admin.updateUserById(existing.id, { password: input.password })
        userId = existing.id
      } else {
        userId = authData.user.id
      }

      const { data, error } = await ctx.supabase
        .from('tenant_members')
        .upsert({
          tenant_id:         ctx.tenantId,
          user_id:           userId,
          role:              input.role,
          display_name:      input.display_name,
          email:             input.email,
          phone:             input.phone ?? null,
          hourly_rate_cents: input.hourly_rate_cents ?? null,
          permissions:       {},
          is_active:         true,
        }, { onConflict: 'tenant_id,user_id' })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id:                z.string().uuid(),
      display_name:      z.string().min(1).optional(),
      phone:             z.string().nullable().optional(),
      role:              z.enum(['owner', 'manager', 'staff']).optional(),
      hourly_rate_cents: z.number().int().nonnegative().nullable().optional(),
      permissions:       permissionsSchema.optional(),
      is_active:         z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const { data, error } = await ctx.supabase
        .from('tenant_members')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  remove: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('tenant_members')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  setPassword: tenantProcedure
    .input(z.object({
      id:       z.string().uuid(),   // tenant_members.id
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      // Look up the user_id for this member
      const { data: member } = await ctx.supabase
        .from('tenant_members')
        .select('user_id')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' })

      const { error } = await ctx.supabase.auth.admin.updateUserById(member.user_id, {
        password: input.password,
      })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),

  myRole: tenantProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('tenant_members')
      .select('role, permissions')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const role  = (data?.role  as string | undefined) ?? 'staff'
    const perms = (data?.permissions ?? {}) as Record<string, unknown>
    const canDeleteOrders = role === 'owner' || role === 'manager' || perms.delete_orders === true
    return { role, permissions: perms, canDeleteOrders, userId: ctx.userId }
  }),

  myStatus: tenantProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('time_entries')
      .select('id, clocked_in_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .is('clocked_out_at', null)
      .maybeSingle()
    return { clocked_in: !!data, entry: data ?? null }
  }),

  clockIn: tenantProcedure.mutation(async ({ ctx }) => {
    const { data: open } = await ctx.supabase
      .from('time_entries')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .is('clocked_out_at', null)
      .maybeSingle()
    if (open) throw new TRPCError({ code: 'CONFLICT', message: 'Already clocked in' })

    const { data, error } = await ctx.supabase
      .from('time_entries')
      .insert({ tenant_id: ctx.tenantId, user_id: ctx.userId })
      .select()
      .single()
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),

  clockOut: tenantProcedure.mutation(async ({ ctx }) => {
    const { data: open } = await ctx.supabase
      .from('time_entries')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .is('clocked_out_at', null)
      .maybeSingle()
    if (!open) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not clocked in' })

    const { data, error } = await ctx.supabase
      .from('time_entries')
      .update({ clocked_out_at: new Date().toISOString() })
      .eq('id', open.id)
      .select()
      .single()
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),

  timeEntries: tenantProcedure
    .input(z.object({
      user_id:   z.string().uuid().optional(),
      date_from: z.string().optional(),   // YYYY-MM-DD
      date_to:   z.string().optional(),   // YYYY-MM-DD (inclusive)
      limit:     z.number().int().default(500),
    }))
    .query(async ({ ctx, input }) => {
      // Fetch entries
      let q = ctx.supabase
        .from('time_entries')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('clocked_in_at', { ascending: false })
        .limit(input.limit)

      if (input.user_id)   q = q.eq('user_id', input.user_id)
      if (input.date_from) q = q.gte('clocked_in_at', `${input.date_from}T00:00:00`)
      if (input.date_to)   q = q.lte('clocked_in_at', `${input.date_to}T23:59:59`)

      const { data: entries, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!entries?.length) return []

      // Fetch member names for each unique user_id
      const userIds = [...new Set(entries.map((e) => e.user_id))]
      const { data: members } = await ctx.supabase
        .from('tenant_members')
        .select('user_id, display_name, email, role')
        .eq('tenant_id', ctx.tenantId)
        .in('user_id', userIds)

      const memberMap = new Map((members ?? []).map((m) => [m.user_id, m]))

      return entries.map((e) => ({ ...e, member: memberMap.get(e.user_id) ?? null }))
    }),
})
