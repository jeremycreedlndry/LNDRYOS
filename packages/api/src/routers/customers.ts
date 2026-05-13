import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, tenantProcedure } from '../trpc'
import { geocodeAddress, pointInPolygon } from '../lib/geocode'

const orderPreferencesSchema = z.object({
  bleach: z.string().optional(),
  dryer_sheets: z.string().optional(),
  detergent_type: z.string().optional(),
  fabric_softener: z.string().optional(),
  wash_temperature: z.string().optional(),
})

const customerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().default(''),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1),
  secondary_phone: z.string().nullable().optional(),
  address_street: z.string().nullable().optional(),
  address_apt: z.string().nullable().optional(),
  address_city: z.string().nullable().optional(),
  address_postal_code: z.string().nullable().optional(),
  driver_instructions: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  private_notes: z.string().nullable().optional(),
  price_list_id: z.string().uuid().nullable().optional(),
  payment_type: z.string().default('default'),
  marketing_opt_in: z.boolean().default(false),
  invoice_style: z.string().default('store_default'),
  discount_percent: z.number().int().min(0).max(100).default(0),
  account_balance: z.number().int().default(0),
  tax_exempt: z.boolean().default(false),
  order_preferences: orderPreferencesSchema.default({}),
  saved_card_last4:   z.string().nullable().optional(),
  saved_card_brand:   z.string().nullable().optional(),
  delivery_fee_cents: z.number().int().nonnegative().default(0),
  notification_preference: z.enum(['sms', 'email', 'sms_email', 'none']).default('sms_email'),
})

export const customersRouter = router({
  list: tenantProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('last_name')
        .order('first_name')
        .limit(200)

      if (input?.query && input.query.length >= 1) {
        q = q.or(
          `first_name.ilike.%${input.query}%,last_name.ilike.%${input.query}%,phone.ilike.%${input.query}%,email.ilike.%${input.query}%`
        )
      }

      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  search: tenantProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .or(
          `first_name.ilike.%${input.query}%,last_name.ilike.%${input.query}%,phone.ilike.%${input.query}%,email.ilike.%${input.query}%`
        )
        .order('last_name')
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('customers')
        .select('*')
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)
        .single()

      if (error) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  create: tenantProcedure
    .input(customerSchema)
    .mutation(async ({ ctx, input }) => {
      const geo = await maybeGeocode(input, ctx.tenantId, ctx.supabase)
      const { data, error } = await ctx.supabase
        .from('customers')
        .insert({ ...input, tenant_id: ctx.tenantId, ...geo })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: tenantProcedure
    .input(z.object({ id: z.string().uuid() }).merge(customerSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const geo = await maybeGeocode(rest, ctx.tenantId, ctx.supabase)
      const { data, error } = await ctx.supabase
        .from('customers')
        .update({ ...rest, ...geo, updated_at: new Date().toISOString() })
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
        .from('customers')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', ctx.tenantId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }),

  getOrderHistory: tenantProcedure
    .input(z.object({ customerId: z.string().uuid(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('orders')
        .select('id, order_number, status, payment_status, total_amount, created_at')
        .eq('customer_id', input.customerId)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),
})

// ─── Geocode + auto-detect zone whenever address fields are present ───────────

type AddressInput = {
  address_street?: string | null
  address_city?: string | null
  address_postal_code?: string | null
}

async function maybeGeocode(
  input: AddressInput,
  tenantId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ lat?: number; lng?: number; geocoded_at?: string } | Record<string, never>> {
  const street = input.address_street
  const city   = input.address_city
  if (!street && !city) return {}

  const parts = [street, city, input.address_postal_code].filter(Boolean)
  const coords = await geocodeAddress(parts.join(', '))
  if (!coords) return {}

  // Find which zone this customer falls in
  const { data: zones } = await supabase
    .from('delivery_zones')
    .select('id, coordinates')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (zones) {
    for (const zone of zones) {
      if (pointInPolygon(coords.lng, coords.lat, zone.coordinates as [number, number][])) {
        // Store zone_id back on the customer record (silently, best-effort)
        // Callers can use the returned coords separately
        break
      }
    }
  }

  return { lat: coords.lat, lng: coords.lng, geocoded_at: new Date().toISOString() }
}
