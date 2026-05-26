/**
 * CleanCloud → LNDRYOS Migration Script
 *
 * Pulls customers, orders, and payments from the CleanCloud API
 * and upserts them into the LNDRYOS Supabase database.
 *
 * Idempotent — safe to run multiple times:
 *   • Customers matched by phone number
 *   • Orders matched by CC order ID stored as order_number "CC-{id}"
 *
 * Usage:
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud.mjs
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud.mjs --dry-run
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud.mjs --from=2023-01-01
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud.mjs --customers-only
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud.mjs --orders-only
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const CC_API_TOKEN = process.env.CC_API_TOKEN
const CC_BASE_URL  = 'https://cleancloudapp.com/api'

const SUPABASE_URL = 'https://xcmldvthynocxnkehpdc.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjbWxkdnRoeW5vY3hua2VocGRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY5MDc0NCwiZXhwIjoyMDk0MjY2NzQ0fQ.CEH9TZUqDYlAw-7uF7glpBFqYVYWGG4VmJF20Bj9ti8'
const TENANT_ID    = 'f91d69a7-ddf8-4ed4-b1c3-555fd3004d0f'
// System user UUID — used as created_by for migrated orders (The LNDRY Co. admin)
const SYSTEM_USER  = 'a80e990f-3b54-495f-863e-100287cb5291'

const DRY_RUN        = process.argv.includes('--dry-run')
const CUSTOMERS_ONLY = process.argv.includes('--customers-only')
const ORDERS_ONLY    = process.argv.includes('--orders-only')

const fromArg   = process.argv.find(a => a.startsWith('--from='))
const FROM_DATE = fromArg ? fromArg.split('=')[1]
  : new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── CleanCloud API ───────────────────────────────────────────────────────────

async function ccPost(endpoint, body = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${CC_BASE_URL}/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_token: CC_API_TOKEN, ...body }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.Error) throw new Error(json.Error)
      return json
    } catch (err) {
      if (attempt === retries) throw new Error(`CC /${endpoint}: ${err.message}`)
      await sleep(1000 * (attempt + 1))
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Field mappers ────────────────────────────────────────────────────────────

function splitName(full = '') {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: 'Unknown', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  const last = parts.pop()
  return { first_name: parts.join(' '), last_name: last }
}

function normalizePhone(raw = '') {
  const digits = String(raw).replace(/\D/g, '')
  if (!digits || digits.length < 7) return null
  if (digits.length === 10)                      return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return `+${digits}`
}

// CC status: 0=Cleaning, 1=Ready, 2=Completed/PickedUp, 3=Pickup Confirm, 4=Accepted Pickup, 5=Detailing
function mapStatus(cc) {
  return { 0: 'cleaning', 1: 'ready', 2: 'picked_up', 3: 'pending', 4: 'pending', 5: 'in_progress' }[Number(cc)] ?? 'pending'
}

// CC payment type: 0=None/Invoice, 1=Cash, 2=Card, 3=Check
function mapPaymentMethod(cc) {
  return { 1: 'cash', 2: 'card_present', 3: 'cash' }[Number(cc)] ?? 'cash'
  // Note: CC type 3 = cheque — mapped to 'cash' since there's no cheque enum value
}

function guessCategory(name = '') {
  const n = name.toLowerCase()
  if (/gift.?card/.test(n))                   return 'gift_card'
  if (/wash|fold|laundry/.test(n))            return 'wash_fold'
  if (/dry.?clean|d\.?c\.?/.test(n))          return 'dry_clean'
  if (/\bpress\b|\biron\b/.test(n))           return 'press_only'
  if (/alter|hem\b|repair|tailor/.test(n))    return 'alterations'
  return 'other'
}

// CC money is floats (25.50) → integer cents
function cents(val) { return Math.round(parseFloat(val ?? 0) * 100) }

// CC dates are Unix timestamps (or 0 = null)
function unixToISO(ts) {
  if (!ts || ts === '0' || ts === 0) return null
  const n = Number(ts)
  if (isNaN(n) || n < 1000000) return null
  return new Date(n * 1000).toISOString()
}

// Parse CC summary string into line items
// e.g. "Basic x 10<br>Standard x 5<br>" → [{name:'Basic',qty:10},{name:'Standard',qty:5}]
function parseSummary(summary = '') {
  if (!summary) return []
  return summary
    .split(/<br\s*\/?>/i)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('Discount') && !s.startsWith('Credit') && !s.startsWith('Tip'))
    .map(s => {
      const match = s.match(/^(.+?)\s+x\s+([\d.]+)$/i)
      if (!match) return null
      return { name: match[1].trim(), qty: parseFloat(match[2]) }
    })
    .filter(Boolean)
}

function buildOrderLines(order) {
  const items    = parseSummary(order.summary)
  const totalCts = cents(order.total)
  const taxCts   = cents(order.tax1)
  const subCts   = Math.max(0, totalCts - taxCts)

  if (items.length === 0) {
    // Fallback: single line from summary text (cleaned up)
    const name = order.summary?.replace(/<br\s*\/?>/gi, ', ').replace(/,\s*$/, '').trim() || 'Laundry Service'
    return [{
      name,
      category:   guessCategory(name),
      quantity:   1,
      unit_price: subCts,
      line_total: subCts,
      unit_label: 'item',
      notes:      null,
    }]
  }

  // Distribute subtotal across line items proportionally (equal split if can't do better)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  return items.map((item, idx) => {
    const isLast     = idx === items.length - 1
    const proportion = totalQty > 0 ? item.qty / totalQty : 1 / items.length
    // Last item gets the remainder to avoid rounding drift
    const allocated  = isLast
      ? subCts - items.slice(0, -1).reduce((s, it, i) => s + Math.round(subCts * (totalQty > 0 ? it.qty / totalQty : 1 / items.length)), 0)
      : Math.round(subCts * proportion)
    const unitPrice  = item.qty > 0 ? Math.round(allocated / item.qty) : allocated
    return {
      name:       item.name,
      category:   guessCategory(item.name),
      quantity:   item.qty,
      unit_price: unitPrice,
      line_total: allocated,
      unit_label: item.name.toLowerCase().includes('wash') || item.name.toLowerCase().includes('fold') ? 'lb' : 'item',
      notes:      null,
    }
  })
}

function buildPrefs(c) {
  const p = {}
  if (c.detergentType)    p.detergent_type   = String(c.detergentType)
  if (c.whitesWashTemp)   p.wash_temperature  = String(c.whitesWashTemp)
  if (c.fabricSoftenerType != null && c.fabricSoftenerType !== '')
    p.fabric_softener = c.fabricSoftenerType == 0 ? 'none' : 'yes'
  const STARCH = ['', 'no starch', 'light starch', 'medium starch', 'heavy starch']
  if (c.starchPreference > 0) p.bleach = STARCH[c.starchPreference] ?? null
  return p
}

// ─── Fetch orders from CC (paginated by month) ────────────────────────────────

async function fetchCCOrders() {
  log(`Fetching orders from ${FROM_DATE} → today…`)
  const all = []
  let cursor = new Date(FROM_DATE + 'T00:00:00Z')
  const today = new Date()

  while (cursor <= today) {
    const next = new Date(cursor)
    next.setMonth(next.getMonth() + 1)
    const from = cursor.toISOString().split('T')[0]
    const to   = (next > today ? today : next).toISOString().split('T')[0]

    process.stdout.write(`  ${from} → ${to} … `)
    const res = await ccPost('getOrders', { dateFrom: from, dateTo: to })
    const batch = res.Orders ?? (Array.isArray(res) ? res : [])
    console.log(`${batch.length}`)
    all.push(...batch)

    cursor = next
    await sleep(400)
  }

  log(`  Total: ${all.length} orders`)
  return all
}

// ─── Fetch customers by ID ────────────────────────────────────────────────────

async function fetchCCCustomers(customerIds) {
  log(`\nFetching ${customerIds.length} customers from CleanCloud…`)
  const customers = []
  let done = 0

  for (const id of customerIds) {
    try {
      const res = await ccPost('getCustomer', { customerID: id })
      // Actual response: { Success, ID, Name, Email, Tel, Address, addressDetailed, Lat, Lng, ... }
      if (res.ID) {
        customers.push({ ...res, customerID: res.ID }) // normalize ID field
      }
      done++
      if (done % 25 === 0) process.stdout.write(`  …${done}/${customerIds.length}\r`)
      await sleep(350)
    } catch (err) {
      warn(`  WARN customer ${id}: ${err.message}`)
    }
  }

  process.stdout.write('\n')
  log(`  Got ${customers.length} customers`)
  return customers
}

// ─── Migrate customers ────────────────────────────────────────────────────────

async function migrateCustomers(ccCustomers) {
  log('\n── Customers ────────────────────────────────────────────')
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 }
  const idMap = {}  // CC customerID → our UUID

  for (const c of ccCustomers) {
    try {
      const phone = normalizePhone(c.Tel)
      if (!phone) {
        warn(`  SKIP "${c.Name}" — no valid phone`)
        stats.skipped++
        continue
      }

      const { first_name, last_name } = splitName(c.Name)

      // Prefer addressDetailed fields if available
      const street  = c.addressDetailed?.street || c.Address || null
      const city    = c.addressDetailed?.city   || null
      const postal  = c.addressDetailed?.zip    || null

      const row = {
        tenant_id:               TENANT_ID,
        first_name,
        last_name,
        phone,
        email:                   c.Email              || null,
        address_street:          street,
        address_city:            city,
        address_postal_code:     postal,
        driver_instructions:     c.customerAddressInstructions || null,
        notes:                   c.Notes              || null,
        private_notes:           c.privateNotes       || null,
        lat:                     c.Lat  ? parseFloat(c.Lat)  : null,
        lng:                     c.Lng  ? parseFloat(c.Lng)  : null,
        marketing_opt_in:        c.marketingOptIn == 1,
        order_preferences:       buildPrefs(c),
        discount_percent:        parseInt(c.discountPercentage ?? 0) || 0,
        account_balance:         cents(c.creditAvailable ?? 0),
        tax_exempt:              c.tax1Exempt == 1,
        payment_type:            'default',
        invoice_style:           'store_default',
        notification_preference: 'sms_email',
      }

      if (DRY_RUN) {
        log(`  [DRY] ${first_name} ${last_name}  ${phone}`)
        idMap[c.customerID] = `dry-run-${c.customerID}`
        stats.inserted++
        continue
      }

      const { data: existing } = await sb
        .from('customers')
        .select('id')
        .eq('tenant_id', TENANT_ID)
        .eq('phone', phone)
        .maybeSingle()

      if (existing) {
        await sb.from('customers')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        idMap[c.customerID] = existing.id
        stats.updated++
      } else {
        const { data, error } = await sb.from('customers').insert(row).select('id').single()
        if (error) throw error
        idMap[c.customerID] = data.id
        stats.inserted++
      }
    } catch (err) {
      warn(`  ERROR "${c.Name}": ${err.message}`)
      stats.errors++
    }
  }

  log(`  ✓ ${stats.inserted} inserted  ${stats.updated} updated  ${stats.skipped} skipped  ${stats.errors} errors`)
  return idMap
}

// ─── Build customerIdMap from existing DB (for --orders-only) ─────────────────

async function buildIdMapFromDB(ccCustomers) {
  const { data: dbCustomers } = await sb
    .from('customers').select('id, phone').eq('tenant_id', TENANT_ID)
  const byPhone = Object.fromEntries((dbCustomers ?? []).map(c => [c.phone, c.id]))
  const idMap = {}
  for (const c of ccCustomers) {
    const ph = normalizePhone(c.Tel)
    if (ph && byPhone[ph]) idMap[c.customerID] = byPhone[ph]
  }
  log(`  Resolved ${Object.keys(idMap).length}/${ccCustomers.length} customers from DB`)
  return idMap
}

// ─── Migrate orders ───────────────────────────────────────────────────────────

async function migrateOrders(ccOrders, customerIdMap) {
  log('\n── Orders ───────────────────────────────────────────────')
  const stats = { inserted: 0, skipped: 0, errors: 0 }

  // Pre-load already-imported CC order numbers
  const { data: existingOrders } = await sb
    .from('orders').select('order_number')
    .eq('tenant_id', TENANT_ID).like('order_number', 'CC-%')
  const existingCCIds = new Set((existingOrders ?? []).map(o => o.order_number))
  log(`  Already imported: ${existingCCIds.size} orders`)

  let count = 0
  for (const o of ccOrders) {
    count++
    if (count % 100 === 0) process.stdout.write(`  …${count}/${ccOrders.length}\r`)

    try {
      const orderNum = `CC-${o.id}`
      if (existingCCIds.has(orderNum)) { stats.skipped++; continue }

      const customerId = customerIdMap[String(o.customerID)]
      if (!customerId) { stats.skipped++; continue }

      const totalCents    = cents(o.total)
      const taxCents      = cents(o.tax1)
      const discountCents = cents(o.discount)
      const subtotalCents = Math.max(0, totalCents - taxCents)
      const taxRate       = subtotalCents > 0 ? taxCents / subtotalCents : 0
      const status        = mapStatus(o.status)
      const payStatus     = o.paid == 1 ? 'paid' : 'pending'

      const createdAt  = unixToISO(o.createdDate)   ?? new Date().toISOString()
      const readyAt    = unixToISO(o.cleanedDate)
      const pickedUpAt = unixToISO(o.completedDate)
      const lines      = buildOrderLines(o)

      if (DRY_RUN) {
        log(`  [DRY] CC-${o.id}  customer=${o.customerID}  $${o.total}  ${status}  "${o.summary?.replace(/<br\s*\/?>/gi,' | ').slice(0,60)}"`)
        stats.inserted++
        continue
      }

      const { data: order, error: oErr } = await sb
        .from('orders')
        .insert({
          tenant_id:      TENANT_ID,
          customer_id:    customerId,
          order_number:   orderNum,
          created_by:     SYSTEM_USER,
          status,
          payment_status: payStatus,
          total_amount:   totalCents,
          subtotal:       subtotalCents,
          tax_amount:     taxCents,
          discount_amount: discountCents,
          notes:          o.notes || null,
          created_at:     createdAt,
          ready_at:       readyAt,
          picked_up_at:   pickedUpAt,
        })
        .select('id')
        .single()

      if (oErr) throw oErr

      if (lines.length > 0) {
        const { error: lErr } = await sb.from('order_lines')
          .insert(lines.map(l => ({ ...l, order_id: order.id, tenant_id: TENANT_ID })))
        if (lErr) warn(`  WARN lines for CC-${o.id}: ${lErr.message}`)
      }

      if (o.paid == 1 && Number(o.paymentType) > 0) {
        const { error: pErr } = await sb.from('payments').insert({
          order_id:     order.id,
          tenant_id:    TENANT_ID,
          amount:       totalCents,
          method:       mapPaymentMethod(o.paymentType),
          status:       'paid',
          processed_at: unixToISO(o.paymentTime) ?? createdAt,
        })
        if (pErr) warn(`  WARN payment for CC-${o.id}: ${pErr.message}`)
      }

      stats.inserted++
    } catch (err) {
      warn(`  ERROR CC-${o.id}: ${err.message}`)
      stats.errors++
    }
  }

  process.stdout.write('\n')
  log(`  ✓ ${stats.inserted} inserted  ${stats.skipped} skipped  ${stats.errors} errors`)
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const log  = msg => console.log(msg)
const warn = msg => console.warn(msg)

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!CC_API_TOKEN) {
    console.error('ERROR: CC_API_TOKEN is required.')
    console.error('  CC_API_TOKEN=your_token node scripts/migrate-cleancloud.mjs')
    process.exit(1)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  CleanCloud → LNDRYOS Migration')
  if (DRY_RUN) console.log('  MODE: DRY RUN — nothing will be written')
  console.log(`  From:  ${FROM_DATE}`)
  console.log(`  Scope: ${CUSTOMERS_ONLY ? 'customers only' : ORDERS_ONLY ? 'orders only' : 'customers + orders'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Pull orders first to discover customer IDs
  const ccOrders = CUSTOMERS_ONLY ? [] : await fetchCCOrders()

  // Collect unique CC customer IDs from orders
  const uniqueCustomerIds = [...new Set(ccOrders.map(o => String(o.customerID)).filter(Boolean))]
  log(`  Unique customers in orders: ${uniqueCustomerIds.length}`)

  // Fetch customer details from CC
  const ccCustomers = uniqueCustomerIds.length > 0 ? await fetchCCCustomers(uniqueCustomerIds) : []

  // Migrate customers and build ID map
  let customerIdMap = {}
  if (!ORDERS_ONLY && ccCustomers.length > 0) {
    customerIdMap = await migrateCustomers(ccCustomers)
  } else {
    customerIdMap = await buildIdMapFromDB(ccCustomers)
  }

  // Migrate orders
  if (!CUSTOMERS_ONLY && ccOrders.length > 0) {
    await migrateOrders(ccOrders, customerIdMap)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(DRY_RUN ? '  Dry run complete. Run without --dry-run to apply.' : '  Migration complete.')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1) })
