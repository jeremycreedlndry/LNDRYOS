import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CORS_HEADERS } from '../../_lib/auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function formatPrice(cents: number, unitLabel: string) {
  const dollars = (cents / 100).toFixed(2).replace(/\.00$/, '')
  return `$${dollars}/${unitLabel}`
}

// Map DB preference keys → customer-facing keys
const PREF_KEY_MAP: Record<string, string> = {
  detergent_type:  'detergent',
  wash_temperature: 'wash_temp',
  fabric_softener: 'fabric_softener',
  dryer_sheets:    'dryer_sheets',
  bleach:          'bleach',
  dryer:           'dryer',
}

// Platform defaults — used when the store hasn't configured custom preference options.
// These match DEFAULT_PREFERENCE_OPTIONS in CustomerModal so stored values are identical
// on both the customer app and the staff platform.
const PLATFORM_DEFAULT_OPTIONS: Record<string, string[]> = {
  wash_temperature: ['Cold', 'Warm', 'Hot'],
  bleach:           ['Yes', 'No', 'Whites Only', 'Delicates Only'],
  dryer_sheets:     ['Yes', 'No', 'Fragrance Free'],
  detergent_type:   ['Store Default', 'HE', 'Sensitive', 'Fragrance Free', 'Pods'],
  fabric_softener:  ['Yes', 'No', 'Fragrance Free'],
}

function toOptions(values: string[]) {
  // Use the label itself as the ID so what gets stored in order_preferences
  // matches exactly what the LNDRYOS platform expects when reading it back.
  return values.map((v) => ({ id: v, label: v }))
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// GET /api/customer/store/preferences
// No customer auth needed — just X-Tenant-Token to identify the store.
// Falls back to hardcoded tenant if no token provided (backwards compat).
export async function GET(req: NextRequest) {
  const supabase = getServiceClient()

  // Resolve tenant
  const tenantToken = req.headers.get('x-tenant-token')?.trim()
  let tenantId: string | null = null

  if (tenantToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('tenants')
      .select('id')
      .eq('customer_api_token', tenantToken)
      .maybeSingle()
    tenantId = data?.id ?? null
    if (!tenantId) {
      return NextResponse.json({ error: 'Invalid tenant token' }, { status: 401, headers: CORS_HEADERS })
    }
  } else {
    // Fallback: use the hardcoded tenant so existing callers don't break
    const { CUSTOMER_TENANT_ID } = await import('../../_lib/auth')
    tenantId = CUSTOMER_TENANT_ID
  }

  // Fetch tenant settings (for preference options)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle()

  // Fetch active wash_fold service items → tiers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (supabase as any)
    .from('service_items')
    .select('id, name, description, unit_price, unit_label, preference_groups')
    .eq('tenant_id', tenantId)
    .eq('category', 'wash_fold')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tiers = (items ?? []).map((item: any, idx: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawGroups: string[] = Array.isArray(item.preference_groups) ? item.preference_groups : []
    const availablePrefs = rawGroups
      .map((k: string) => PREF_KEY_MAP[k] ?? k)
      .filter(Boolean)

    return {
      id: slugify(item.name),
      label: item.name,
      price_display: formatPrice(item.unit_price, item.unit_label ?? 'lb'),
      description: item.description ?? '',
      features: [] as string[],
      popular: idx === 1, // second tier is popular by default
      available_preferences: availablePrefs,
    }
  })

  // Build preferences map from tenant settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: Record<string, string[]> = (tenant?.settings as any)?.order_preference_options ?? {}

  const preferences: Record<string, unknown> = {}
  for (const [dbKey, outKey] of Object.entries(PREF_KEY_MAP)) {
    // Store-configured options take priority; fall back to platform defaults so the
    // customer app always uses the same option labels as the LNDRYOS platform.
    const values = opts[dbKey]?.length ? opts[dbKey] : (PLATFORM_DEFAULT_OPTIONS[dbKey] ?? [])
    if (values.length) {
      preferences[outKey] = toOptions(values)
    }
  }
  // time_slots stored directly in settings (not inside order_preference_options)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeSlots: string[] = (tenant?.settings as any)?.time_slots ?? []
  preferences.time_slots = timeSlots

  if (!preferences.dryer) preferences.dryer = []

  return NextResponse.json({ tiers, preferences }, { headers: CORS_HEADERS })
}
