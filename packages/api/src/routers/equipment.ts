import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

const equipmentTypeSchema = z.enum(['washer', 'dryer', 'folding'])

export const equipmentRouter = router({
  list: tenantProcedure
    .input(z.object({ type: equipmentTypeSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('equipment')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('type')
        .order('sort_order')

      if (input?.type) query = query.eq('type', input.type)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  create: tenantProcedure
    .input(z.object({
      type: equipmentTypeSchema,
      name: z.string().min(1),
      sort_order: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('equipment')
        .insert({ ...input, tenant_id: ctx.tenantId })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
      nayax_device_id: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('equipment')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('equipment')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Replace all equipment assignments for an order
  setAssignments: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      assignments: z.array(z.object({
        equipment_id: z.string().uuid(),
        duration_minutes: z.number().int().nullable().optional(),
        temperature: z.string().nullable().optional(),
        // Preserve original assigned_at when re-saving; omit to default to now()
        assigned_at: z.string().nullable().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from('order_equipment_assignments')
        .delete()
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)

      if (input.assignments.length === 0) return { success: true }

      const now = new Date().toISOString()
      const rows = input.assignments.map(({ equipment_id, duration_minutes, temperature, assigned_at }) => ({
        order_id: input.order_id,
        equipment_id,
        tenant_id: ctx.tenantId,
        assigned_by: ctx.userId,
        duration_minutes: duration_minutes ?? null,
        temperature: temperature ?? null,
        // Use caller-supplied timestamp (existing assignment) or stamp now (new assignment)
        assigned_at: assigned_at ?? now,
      }))

      const { error } = await ctx.supabase
        .from('order_equipment_assignments')
        .insert(rows)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Pull machines from Nayax Lynx and upsert into equipment table
  syncFromNayax: tenantProcedure
    .mutation(async ({ ctx }) => {
      const token = process.env.NAYAX_API_TOKEN
      if (!token) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'NAYAX_API_TOKEN not set' })

      const res = await fetch('https://lynx.nayax.com/operational/v1/machines', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Nayax API error: ${res.status}` })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const machines: any[] = await res.json()

      const typeMap = (name: string): 'washer' | 'dryer' | null => {
        const n = name.toUpperCase()
        if (n.startsWith('LG') || n.startsWith('DOMUS')) return 'washer'
        if (n.startsWith('ADC')) return 'dryer'
        return null // skip (vending, unknown, etc.)
      }

      let created = 0
      let updated = 0
      let skipped = 0

      for (const m of machines) {
        const name: string = m.MachineName ?? ''
        const deviceSerial: string = m.DeviceSerialNumber ?? ''
        const type = typeMap(name)

        if (!type || !deviceSerial || !name.trim()) { skipped++; continue }

        // Check if already exists by nayax_device_id
        const { data: existing } = await ctx.supabase
          .from('equipment')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('nayax_device_id', deviceSerial)
          .maybeSingle()

        if (existing) {
          await ctx.supabase
            .from('equipment')
            .update({ name, type, is_active: true })
            .eq('id', existing.id)
          updated++
        } else {
          await ctx.supabase
            .from('equipment')
            .insert({ tenant_id: ctx.tenantId, name, type, nayax_device_id: deviceSerial, sort_order: 0 })
          created++
        }
      }

      return { created, updated, skipped }
    }),

  getAssignments: tenantProcedure
    .input(z.object({ order_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('order_equipment_assignments')
        .select('duration_minutes, temperature, equipment:equipment(id, name, type)')
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return (data ?? []).map((row) => ({
        ...(row.equipment as { id: string; name: string; type: string }),
        duration_minutes: row.duration_minutes as number | null,
        temperature: row.temperature as string | null,
      }))
    }),
})
