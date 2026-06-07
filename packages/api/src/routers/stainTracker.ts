import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'

const statusSchema = z.enum(['active', 'resolved'])

export const stainTrackerRouter = router({
  // ── Reports ──────────────────────────────────────────────────────────────

  listReports: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('stain_reports')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  createReport: tenantProcedure
    .input(z.object({
      order_id:         z.string().uuid().nullable().optional(),
      order_number:     z.string().nullable().optional(),
      customer_name:    z.string().min(1),
      order_summary:    z.string().nullable().optional(),
      due_date:         z.string().nullable().optional(),
      linen_item:       z.string().min(1),
      photo_url:        z.string().url(),
      add_stain_remover: z.boolean().default(false),
      notes:            z.string().nullable().optional(),
      created_by_name:  z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('stain_reports')
        .insert({
          tenant_id:         ctx.tenantId,
          order_id:          input.order_id ?? null,
          order_number:      input.order_number ?? null,
          customer_name:     input.customer_name,
          order_summary:     input.order_summary ?? null,
          due_date:          input.due_date ?? null,
          linen_item:        input.linen_item,
          photo_url:         input.photo_url,
          add_stain_remover: input.add_stain_remover,
          notes:             input.notes ?? null,
          status:            'active',
          created_by:        ctx.userId,
          created_by_name:   input.created_by_name ?? null,
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  setReportStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid(), status: statusSchema }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('stain_reports')
        .update({
          status:      input.status,
          resolved_at: input.status === 'resolved' ? new Date().toISOString() : null,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  // ── Shares ────────────────────────────────────────────────────────────────

  listShares: tenantProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('stain_report_shares')
      .select('id, token, order_number, customer_name, due_date, items, status, created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  createShare: tenantProcedure
    .input(z.object({
      order_id:     z.string().uuid().nullable().optional(),
      order_number: z.string().nullable().optional(),
      customer_name: z.string().min(1),
      due_date:     z.string().nullable().optional(),
      order_summary: z.string().nullable().optional(),
      items: z.array(z.object({
        linen_item:        z.string(),
        photo_url:         z.string(),
        add_stain_remover: z.boolean(),
        notes:             z.string().nullable().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('stain_report_shares')
        .insert({
          tenant_id:     ctx.tenantId,
          order_id:      input.order_id ?? null,
          order_number:  input.order_number ?? null,
          customer_name: input.customer_name,
          due_date:      input.due_date ?? null,
          order_summary: input.order_summary ?? null,
          items:         input.items,
          status:        'active',
          created_by:    ctx.userId,
        })
        .select('token')
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  setShareStatus: tenantProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(['active', 'archived']) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('stain_report_shares')
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),
})
