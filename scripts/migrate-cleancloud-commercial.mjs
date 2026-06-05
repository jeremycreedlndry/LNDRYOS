/**
 * CleanCloud → LNDRYOS commercial import: business accounts + invoices.
 * Run AFTER migrate-cleancloud.mjs (needs the orders imported to link invoices).
 *
 * Idempotent:
 *   • Business accounts matched by name (per tenant)
 *   • Invoices matched by invoice_number "CC-INV-{invoiceUniqueID}"
 *
 * Usage:
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud-commercial.mjs            # last 12mo
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud-commercial.mjs --dry-run
 *   CC_API_TOKEN=xxxx node scripts/migrate-cleancloud-commercial.mjs --from=2024-01-01
 *   TENANT_ID=... SUPABASE_SERVICE_KEY=... CC_API_TOKEN=... node ...
 */

import { createClient } from '@supabase/supabase-js'

const CC_API_TOKEN = process.env.CC_API_TOKEN
const CC_BASE_URL  = 'https://cleancloudapp.com/api'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xcmldvthynocxnkehpdc.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjbWxkdnRoeW5vY3hua2VocGRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY5MDc0NCwiZXhwIjoyMDk0MjY2NzQ0fQ.CEH9TZUqDYlAw-7uF7glpBFqYVYWGG4VmJF20Bj9ti8'
const TENANT_ID    = process.env.TENANT_ID || 'f91d69a7-ddf8-4ed4-b1c3-555fd3004d0f'
const SYSTEM_USER  = process.env.SYSTEM_USER || 'a80e990f-3b54-495f-863e-100287cb5291'

const DRY_RUN  = process.argv.includes('--dry-run')
const fromArg  = process.argv.find(a => a.startsWith('--from='))
const FROM_DATE = fromArg ? fromArg.split('=')[1]
  : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const TO_DATE  = new Date().toISOString().split('T')[0]

if (!CC_API_TOKEN) { console.error('✗ Missing CC_API_TOKEN'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

const cents = (n) => Math.round((parseFloat(n) || 0) * 100)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function ccPost(endpoint, body = {}) {
  const res = await fetch(`${CC_BASE_URL}/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_token: CC_API_TOKEN, ...body }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.Error) throw new Error(json.Error)
  return json
}

// "200-3410 South Service Road\nBurlington, ON, L7N3T2\n" → {street, city, province, postal}
function parseAddress(addr) {
  if (!addr) return {}
  const lines = addr.split('\n').map(s => s.trim()).filter(Boolean)
  const street = lines[0] ?? null
  let city = null, province = null, postal = null
  if (lines[1]) {
    const parts = lines[1].split(',').map(s => s.trim())
    city = parts[0] ?? null; province = parts[1] ?? null; postal = parts[2] ?? null
  }
  return { street, city, province, postal }
}

async function main() {
  console.log(`\nTenant: ${TENANT_ID} | ${SUPABASE_URL}`)
  console.log(`Range: ${FROM_DATE} → ${TO_DATE} | Mode: ${DRY_RUN ? '🟡 DRY RUN' : '🔴 IMPORT'}\n`)

  // ── 1. Business accounts ──────────────────────────────────────────────────
  const baRes = await ccPost('getBusinessAccounts')
  const ccBusinesses = baRes.BusinessAccounts ?? baRes.businessAccounts ?? []
  console.log(`Business accounts from CleanCloud: ${ccBusinesses.length}`)

  const ccBizToUuid = {}   // CC business id → LNDRYOS business_accounts.id
  for (const b of ccBusinesses) {
    const { street, city, province, postal } = parseAddress(b.address)
    const row = {
      tenant_id: TENANT_ID, name: b.name, email: b.email || null, phone: b.phone || null,
      address: street, city, province, postal_code: postal,
      notes: b.taxID ? `CleanCloud biz #${b.id} · Tax ID: ${b.taxID}` : `CleanCloud biz #${b.id}`,
    }
    if (DRY_RUN) { console.log(`  [DRY] business "${b.name}" (${city ?? '—'})`); continue }
    const { data: existing } = await sb.from('business_accounts')
      .select('id').eq('tenant_id', TENANT_ID).eq('name', b.name).maybeSingle()
    if (existing) { ccBizToUuid[String(b.id)] = existing.id; continue }
    const { data, error } = await sb.from('business_accounts').insert(row).select('id').single()
    if (error) { console.error(`  ✗ business ${b.name}: ${error.message}`); continue }
    ccBizToUuid[String(b.id)] = data.id
    console.log(`  ✓ business "${b.name}"`)
  }

  // Which invoices belong to each business (getInvoices doesn't return businessID in body)
  const invoiceToBiz = {}   // invoiceUniqueID → CC business id
  for (const b of ccBusinesses) {
    const r = await ccPost('getInvoices', { businessID: b.id, dateFrom: FROM_DATE, dateTo: TO_DATE })
    for (const inv of (r.invoices ?? [])) invoiceToBiz[String(inv.invoiceUniqueID)] = String(b.id)
    await sleep(400)
  }

  // ── 2. Invoices ───────────────────────────────────────────────────────────
  const invRes = await ccPost('getInvoices', { dateFrom: FROM_DATE, dateTo: TO_DATE })
  const invoices = invRes.invoices ?? []
  console.log(`\nInvoices from CleanCloud: ${invoices.length}`)

  let made = 0, skipped = 0, links = 0, pays = 0
  for (const inv of invoices) {
    const number = `CC-INV-${inv.invoiceUniqueID}`
    const total = cents(inv.amount), tax = cents(inv.tax)
    const paid = String(inv.paid) === '1'
    const orderIds = Object.values(inv.orderIDs ?? {}).flat().map(String)

    if (DRY_RUN) {
      console.log(`  [DRY] ${number}  $${inv.amount}  ${paid ? 'paid' : 'unpaid'}  orders=${orderIds.length}  ${invoiceToBiz[String(inv.invoiceUniqueID)] ? 'business' : 'customer'}`)
      made++; continue
    }

    const { data: exists } = await sb.from('invoices').select('id')
      .eq('tenant_id', TENANT_ID).eq('invoice_number', number).maybeSingle()
    if (exists) { skipped++; continue }

    // resolve linked orders + recipient
    const { data: ordRows } = await sb.from('orders').select('id, customer_id')
      .eq('tenant_id', TENANT_ID).in('order_number', orderIds.map(id => `CC-${id}`))
    const bizId = ccBizToUuid[invoiceToBiz[String(inv.invoiceUniqueID)] ?? '']
    const customerId = ordRows?.find(o => o.customer_id)?.customer_id ?? null

    const issue = new Date(Number(inv.createdTimestamp) * 1000).toISOString().split('T')[0]
    const { data: created, error } = await sb.from('invoices').insert({
      tenant_id: TENANT_ID,
      invoice_number: number,
      recipient_type: bizId ? 'business_account' : 'customer',
      business_account_id: bizId ?? null,
      customer_id: bizId ? null : customerId,
      status: paid ? 'paid' : 'unpaid',
      issue_date: issue,
      subtotal_cents: total - tax,
      tax_cents: tax,
      total_cents: total,
      paid_amount_cents: paid ? total : 0,
      paid_at: paid && inv.paymentTime ? new Date(Number(inv.paymentTime) * 1000).toISOString() : null,
      notes: inv.reference || null,
      created_by: SYSTEM_USER,
    }).select('id').single()
    if (error) { console.error(`  ✗ ${number}: ${error.message}`); continue }
    made++

    if (ordRows?.length) {
      const linkRows = ordRows.map(o => ({ invoice_id: created.id, order_id: o.id, tenant_id: TENANT_ID }))
      const { error: le } = await sb.from('invoice_orders').insert(linkRows)
      if (!le) links += linkRows.length
    }
    if (paid && total > 0) {
      const { error: pe } = await sb.from('invoice_payments').insert({
        tenant_id: TENANT_ID, invoice_id: created.id, amount_cents: total,
        method: 'imported', notes: 'Imported from CleanCloud', recorded_by: SYSTEM_USER,
      })
      if (!pe) pays++
    }
  }

  console.log(`\n✓ Invoices: ${made} created, ${skipped} skipped · ${links} order links · ${pays} payments`)
  console.log(DRY_RUN ? '\nDry run — nothing written.' : '\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
