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
      const machines = (await res.json()) as any[]

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

  // ── Load-based workflow ────────────────────────────────────────────────────
  // Called when an order is first dragged into Washers.
  // Creates one order_load per machine and mirrors into order_equipment_assignments.
  createLoads: tenantProcedure
    .input(z.object({
      order_id: z.string().uuid(),
      machines: z.array(z.object({
        equipment_id:    z.string().uuid(),
        duration_minutes: z.number().int().nullable().optional(),
        temperature:     z.string().nullable().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()

      // Delete any existing loads for this order (re-assigning to washers resets)
      await ctx.supabase
        .from('order_loads')
        .delete()
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)

      // Create one load per machine
      const loads = input.machines.map((m, i) => ({
        order_id:        input.order_id,
        tenant_id:       ctx.tenantId,
        load_number:     i + 1,
        stage:           'washing',
        equipment_id:    m.equipment_id,
        duration_minutes: m.duration_minutes ?? null,
        temperature:     m.temperature ?? null,
        assigned_at:     now,
      }))

      const { error: loadsErr } = await ctx.supabase
        .from('order_loads')
        .insert(loads)
      if (loadsErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: loadsErr.message })

      // Mirror into order_equipment_assignments so Machine View stays accurate
      await ctx.supabase
        .from('order_equipment_assignments')
        .delete()
        .eq('order_id', input.order_id)
        .eq('tenant_id', ctx.tenantId)

      const assignments = input.machines.map((m) => ({
        order_id:        input.order_id,
        equipment_id:    m.equipment_id,
        tenant_id:       ctx.tenantId,
        assigned_by:     ctx.userId,
        duration_minutes: m.duration_minutes ?? null,
        temperature:     m.temperature ?? null,
        assigned_at:     now,
      }))

      const { error: aErr } = await ctx.supabase
        .from('order_equipment_assignments')
        .insert(assignments)
      if (aErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: aErr.message })

      return { success: true }
    }),

  // Advance a single load to the next stage.
  // washing → drying | drying → folding | folding → ready
  // When going to 'ready', if all loads are done the order status is set to 'ready'.
  moveLoad: tenantProcedure
    .input(z.object({
      load_id:          z.string().uuid(),
      equipment_id:     z.string().uuid().optional(), // omit when advancing to ready
      duration_minutes: z.number().int().nullable().optional(),
      temperature:      z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: load, error: loadErr } = await ctx.supabase
        .from('order_loads')
        .select('*')
        .eq('id', input.load_id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (loadErr || !load) throw new TRPCError({ code: 'NOT_FOUND' })

      const STAGE_MAP: Record<string, string> = {
        washing: 'drying',
        drying:  'folding',
        folding: 'ready',
      }
      const nextStage = STAGE_MAP[load.stage as string]
      if (!nextStage) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Load is already complete' })

      const now        = new Date().toISOString()
      const isReady    = nextStage === 'ready'
      const newEquipId = isReady ? null : (input.equipment_id ?? null)

      // Advance the load
      const { error: updateErr } = await ctx.supabase
        .from('order_loads')
        .update({
          stage:           nextStage,
          equipment_id:    newEquipId,
          duration_minutes: isReady ? null : (input.duration_minutes ?? null),
          temperature:     isReady ? null : (input.temperature ?? null),
          assigned_at:     now,
        })
        .eq('id', input.load_id)
        .eq('tenant_id', ctx.tenantId)
      if (updateErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateErr.message })

      // Sync assignments: remove the old machine row, add the new one
      if (load.equipment_id) {
        await ctx.supabase
          .from('order_equipment_assignments')
          .delete()
          .eq('order_id', load.order_id as string)
          .eq('equipment_id', load.equipment_id as string)
          .eq('tenant_id', ctx.tenantId)
      }
      if (newEquipId) {
        await ctx.supabase
          .from('order_equipment_assignments')
          .insert({
            order_id:        load.order_id,
            equipment_id:    newEquipId,
            tenant_id:       ctx.tenantId,
            assigned_by:     ctx.userId,
            duration_minutes: input.duration_minutes ?? null,
            temperature:     input.temperature ?? null,
            assigned_at:     now,
          })
      }

      // If all loads are now ready, mark the order as ready
      if (isReady) {
        const { data: remaining } = await ctx.supabase
          .from('order_loads')
          .select('id')
          .eq('order_id', load.order_id as string)
          .eq('tenant_id', ctx.tenantId)
          .neq('stage', 'ready')

        if (!remaining || remaining.length === 0) {
          await ctx.supabase
            .from('orders')
            .update({ status: 'ready' })
            .eq('id', load.order_id as string)
            .eq('tenant_id', ctx.tenantId)

          // Clear any lingering assignments (should already be gone)
          await ctx.supabase
            .from('order_equipment_assignments')
            .delete()
            .eq('order_id', load.order_id as string)
            .eq('tenant_id', ctx.tenantId)
        }
      }

      return { success: true }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row) => {
        const eq = row.equipment as any
        return {
          id: eq?.id as string,
          name: eq?.name as string,
          type: eq?.type as string,
          duration_minutes: row.duration_minutes as number | null,
          temperature: row.temperature as string | null,
        }
      })
    }),
})
