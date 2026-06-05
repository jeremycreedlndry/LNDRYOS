/**
 * Import Nayax gift cards from a CSV export into customer_gift_cards (one tenant).
 *
 * Nayax has no bulk list API, so export the card list from the Nayax admin portal
 * and feed the CSV here. Idempotent: upserts on (tenant_id, card_display_number).
 * If a `phone` column is present, links the card to the matching customer.
 *
 * Expected CSV headers (case-insensitive, flexible aliases):
 *   card_display_number   | display_number | CardDisplayNumber   (required)
 *   card_unique_identifier| uid            | CardUniqueIdentifier (required)
 *   card_id               | CardID                               (optional)
 *   balance_dollars       | balance | credit                     (optional, dollars)
 *   phone                 | tel | customer_phone                 (optional)
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=xxxx node scripts/import-nayax-cards.mjs path/to/cards.csv
 *   ... --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xcmldvthynocxnkehpdc.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const TENANT_ID    = process.env.TENANT_ID || 'f91d69a7-ddf8-4ed4-b1c3-555fd3004d0f'
const DRY_RUN      = process.argv.includes('--dry-run')
const csvPath      = process.argv.find((a) => a.endsWith('.csv'))

if (!SERVICE_KEY) { console.error('✗ Missing SUPABASE_SERVICE_KEY'); process.exit(1) }
if (!csvPath)     { console.error('✗ Provide a CSV path: node scripts/import-nayax-cards.mjs cards.csv'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Tiny CSV parser (handles quoted fields + commas/newlines in quotes) ────────
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const ALIASES = {
  display: ['card_display_number', 'display_number', 'carddisplaynumber', 'cardnumber', 'card number', 'display'],
  uid:     ['card_unique_identifier', 'uid', 'carduniqueidentifier', 'unique_identifier', 'guid'],
  cardId:  ['card_id', 'cardid', 'id'],
  balance: ['balance_dollars', 'balance', 'credit', 'cardcredit', 'amount'],
  phone:   ['phone', 'tel', 'customer_phone', 'customertel', 'mobile'],
}
function colIndex(headers, key) {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const a of ALIASES[key]) { const i = lower.indexOf(a); if (i !== -1) return i }
  return -1
}

function normalizePhone(raw) {
  if (!raw) return null
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d[0] === '1') return `+${d}`
  return d ? (raw.startsWith('+') ? raw : `+${d}`) : null
}

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))
  if (rows.length < 2) { console.error('✗ CSV has no data rows'); process.exit(1) }
  const headers = rows[0]
  const iDisplay = colIndex(headers, 'display')
  const iUid     = colIndex(headers, 'uid')
  const iCardId  = colIndex(headers, 'cardId')
  const iBalance = colIndex(headers, 'balance')
  const iPhone   = colIndex(headers, 'phone')

  console.log(`\nCSV: ${csvPath}`)
  console.log(`Headers: ${headers.join(', ')}`)
  console.log(`Mapped → display:${iDisplay} uid:${iUid} cardId:${iCardId} balance:${iBalance} phone:${iPhone}`)
  console.log(`Tenant: ${TENANT_ID} | Mode: ${DRY_RUN ? '🟡 DRY RUN' : '🔴 IMPORT'}\n`)
  if (iDisplay === -1 || iUid === -1) {
    console.error('✗ CSV must contain a display number and a unique identifier column.')
    process.exit(1)
  }

  // Preload customers by phone for linking
  const phoneToCustomer = new Map()
  if (iPhone !== -1) {
    const { data } = await sb.from('customers').select('id, phone').eq('tenant_id', TENANT_ID)
    for (const c of data ?? []) if (c.phone) phoneToCustomer.set(normalizePhone(c.phone), c.id)
  }

  let imported = 0, linked = 0, skipped = 0
  for (const r of rows.slice(1)) {
    const display = (r[iDisplay] ?? '').trim()
    const uid     = (r[iUid] ?? '').trim()
    if (!display || !uid) { skipped++; continue }
    const cardId  = iCardId !== -1 && r[iCardId]?.trim() ? parseInt(r[iCardId].trim(), 10) : null
    const balDollars = iBalance !== -1 ? parseFloat(String(r[iBalance] ?? '0').replace(/[^0-9.\-]/g, '')) || 0 : 0
    const phone   = iPhone !== -1 ? normalizePhone(r[iPhone]) : null
    const customerId = phone ? phoneToCustomer.get(phone) ?? null : null
    if (customerId) linked++

    const rowData = {
      tenant_id: TENANT_ID,
      card_display_number: display,
      card_unique_identifier: uid,
      card_id: Number.isFinite(cardId) ? cardId : null,
      balance_cents: Math.round(balDollars * 100),
      status: 'active',
      customer_id: customerId,
      imported_at: new Date().toISOString(),
    }

    if (DRY_RUN) { imported++; continue }
    const { error } = await sb.from('customer_gift_cards')
      .upsert(rowData, { onConflict: 'tenant_id,card_display_number' })
    if (error) { console.error(`  ✗ ${display}: ${error.message}`); skipped++; continue }
    imported++
  }

  console.log(`\n${DRY_RUN ? 'Would import' : 'Imported'}: ${imported}  |  linked to customer: ${linked}  |  skipped: ${skipped}`)
  if (DRY_RUN) console.log('Dry run — nothing written. Re-run without --dry-run to import.')
}

main().catch((e) => { console.error(e); process.exit(1) })
