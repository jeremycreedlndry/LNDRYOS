/**
 * Wipe transactional (order + customer) data for ONE tenant, keeping settings/config.
 *
 * Scoped strictly to a single tenant_id. Prints row counts first; only deletes
 * when passed --confirm. Config tables (tenants, service_items, price_lists,
 * equipment, delivery_zones, promo_codes, issue_categories, tenant_members,
 * time_entries) are left untouched.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=xxxx node scripts/wipe-tenant-data.mjs            # dry run (counts only)
 *   SUPABASE_SERVICE_KEY=xxxx node scripts/wipe-tenant-data.mjs --confirm  # actually delete
 *   ... --include-time-entries   # also clear staff clock-in/out history
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xcmldvthynocxnkehpdc.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const TENANT_ID    = process.env.TENANT_ID || 'f91d69a7-ddf8-4ed4-b1c3-555fd3004d0f'

const CONFIRM            = process.argv.includes('--confirm')
const INCLUDE_TIME       = process.argv.includes('--include-time-entries')

if (!SERVICE_KEY) {
  console.error('✗ Missing SUPABASE_SERVICE_KEY env var')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// FK-safe child → parent order. Every delete is scoped to tenant_id.
const TABLES = [
  'promo_code_uses',
  'invoice_payments',
  'invoice_orders',
  'invoices',
  'gift_card_transactions',
  'customer_gift_cards',
  'messages',
  'order_notes',
  'order_issues',
  'order_equipment_assignments',
  'order_loads',
  'pending_taps',
  'pickup_stops',
  'pickup_schedules',
  'payments',
  'order_lines',
  'orders',
  'business_accounts',
  'customers',
]
if (INCLUDE_TIME) TABLES.push('time_entries')

async function countOf(table) {
  const { count, error } = await sb
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
  if (error) return `ERR(${error.message})`
  return count ?? 0
}

async function main() {
  console.log(`\nTenant: ${TENANT_ID}`)
  console.log(`Project: ${SUPABASE_URL}`)
  console.log(`Mode: ${CONFIRM ? '🔴 DELETE' : '🟡 DRY RUN (counts only)'}\n`)

  console.log('Row counts (scoped to this tenant):')
  let total = 0
  const counts = {}
  for (const t of TABLES) {
    const c = await countOf(t)
    counts[t] = c
    if (typeof c === 'number') total += c
    console.log(`  ${t.padEnd(30)} ${c}`)
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${total}\n`)

  if (!CONFIRM) {
    console.log('Dry run — nothing deleted. Re-run with --confirm to delete.')
    return
  }

  console.log('Deleting…')
  for (const t of TABLES) {
    if (counts[t] === 0) { console.log(`  ${t.padEnd(30)} skip (0)`); continue }
    const { error } = await sb.from(t).delete().eq('tenant_id', TENANT_ID)
    if (error) { console.error(`  ${t.padEnd(30)} ✗ ${error.message}`); process.exit(1) }
    console.log(`  ${t.padEnd(30)} ✓ deleted`)
  }

  console.log('\nVerifying (should all be 0):')
  for (const t of ['orders', 'customers', 'customer_gift_cards', 'invoices', 'pickup_stops']) {
    console.log(`  ${t.padEnd(30)} ${await countOf(t)}`)
  }
  console.log('\n✓ Wipe complete.')
}

main().catch((e) => { console.error(e); process.exit(1) })
