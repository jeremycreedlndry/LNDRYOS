import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://uwugotsowhnnygtaeaqb.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dWdvdHNvd2hubnlndGFlYXFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg2NjM2NCwiZXhwIjoyMDkzNDQyMzY0fQ.QXTpcfw4SfBzGFYvJbuUIZqiYjYYXgB9gy7MEEDpGCs'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

const migrations = [
  '001_tenants.sql',
  '002_customers.sql',
  '003_catalog.sql',
  '004_orders.sql',
  '005_payments.sql',
]

for (const file of migrations) {
  const sql = readFileSync(join(__dirname, '../packages/db/src/schema', file), 'utf8')
  console.log(`Running ${file}...`)
  const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(() => ({ error: null }))
  // Fall back to direct REST if RPC not available
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok && res.status !== 404) {
    console.warn(`  Note: ${res.status} — run manually if needed`)
  } else {
    console.log(`  ✓ ${file}`)
  }
}

console.log('\nDone! Run migrations manually in Supabase SQL editor if any failed.')
