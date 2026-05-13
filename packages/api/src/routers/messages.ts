import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { sendSms } from '../lib/sms'

export const messagesRouter = router({
  // All conversations — one entry per customer, last message + unread count
  inbox: tenantProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx }) => {
      // Get last message per customer + unread count
      const { data, error } = await ctx.supabase.rpc('get_inbox', {
        p_tenant_id: ctx.tenantId,
      })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // All messages for a specific customer (conversation thread)
  listForCustomer: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('messages')
        .select('id, direction, channel, body, subject, from_address, to_address, staff_user_id, read_at, created_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('customer_id', input.customer_id)
        .order('created_at', { ascending: true })

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  // Unread count (for sidebar badge)
  unreadCount: tenantProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('direction', 'inbound')
      .is('read_at', null)

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return { count: count ?? 0 }
  }),

  // Send a manual SMS to a customer
  sendSms: tenantProcedure
    .input(z.object({
      customer_id: z.string().uuid(),
      body: z.string().min(1).max(1600),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get customer phone
      const { data: customer } = await ctx.supabase
        .from('customers')
        .select('phone, first_name, last_name')
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (!customer?.phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has no phone number' })

      await sendSms(customer.phone, input.body)

      const { data, error } = await ctx.supabase
        .from('messages')
        .insert({
          tenant_id: ctx.tenantId,
          customer_id: input.customer_id,
          direction: 'outbound',
          channel: 'sms',
          body: input.body,
          to_address: customer.phone,
          staff_user_id: ctx.userId,
          read_at: new Date().toISOString(), // outbound messages are always "read"
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // Mark all messages for a customer as read
  markRead: tenantProcedure
    .input(z.object({ customer_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('tenant_id', ctx.tenantId)
        .eq('customer_id', input.customer_id)
        .eq('direction', 'inbound')
        .is('read_at', null)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
