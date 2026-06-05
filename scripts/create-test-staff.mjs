/**
 * Create test staff accounts in a tenant, with the same role/permissions as a
 * reference member. Idempotent: if the auth user exists, resets their password;
 * if the membership exists, updates role/permissions.
 *
 * Usage: SUPABASE_SERVICE_KEY=xxxx node scripts/create-test-staff.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xcmldvthynocxnkehpdc.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const TENANT_ID    = process.env.TENANT_ID || 'b6b27886-565a-425e-93ce-c0e165aa8ac6'
const REFERENCE_EMAIL = 'jeremy@creedco.ca'   // copy this member's role + permissions
const PASSWORD = 'lndry1234'

const STAFF = [
  { name: 'Alexandra Brodeur',     email: 'alexandrabrod90@gmail.com' },
  { name: 'Brittany Petrie-Shaw',  email: 'brittany@thelndryco.com' },
  { name: 'Jessica Brown',         email: 'jessicabrown2626@icloud.com' },
  { name: 'Madison Ruther',        email: 'madison.ruther@icloud.com' },
  { name: 'Nicole Fodor',          email: 'nicolesfodor@gmail.com' },
  { name: 'Taylor Follis',         email: 'folltay692@gmail.com' },
]

if (!SERVICE_KEY) { console.error('✗ Missing SUPABASE_SERVICE_KEY'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function findAuthUserByEmail(email) {
  // paginate admin users (small project)
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    const u = data?.users?.find(x => (x.email ?? '').toLowerCase() === email.toLowerCase())
    if (u) return u
    if (!data?.users?.length || data.users.length < 1000) break
  }
  return null
}

async function main() {
  const { data: ref } = await sb.from('tenant_members')
    .select('role, permissions').eq('tenant_id', TENANT_ID).eq('email', REFERENCE_EMAIL).maybeSingle()
  if (!ref) { console.error(`✗ Reference member ${REFERENCE_EMAIL} not found in tenant`); process.exit(1) }
  const role = ref.role, permissions = ref.permissions ?? {}
  console.log(`Copying from ${REFERENCE_EMAIL}: role=${role} perms=${JSON.stringify(permissions)}\n`)

  for (const s of STAFF) {
    // 1. auth user (create or reset password)
    let userId
    const { data: created, error: ce } = await sb.auth.admin.createUser({
      email: s.email, password: PASSWORD, email_confirm: true,
    })
    if (created?.user) {
      userId = created.user.id
    } else {
      const existing = await findAuthUserByEmail(s.email)
      if (!existing) { console.error(`  ✗ ${s.email}: ${ce?.message ?? 'create failed, not found'}`); continue }
      userId = existing.id
      await sb.auth.admin.updateUserById(userId, { password: PASSWORD })
    }

    // 2. tenant membership (upsert)
    const { data: mem } = await sb.from('tenant_members')
      .select('id').eq('tenant_id', TENANT_ID).eq('user_id', userId).maybeSingle()
    const row = { tenant_id: TENANT_ID, user_id: userId, role, display_name: s.name, email: s.email, permissions, is_active: true }
    if (mem) {
      await sb.from('tenant_members').update(row).eq('id', mem.id)
      console.log(`  ✓ ${s.name.padEnd(22)} (updated membership)`)
    } else {
      const { error: ie } = await sb.from('tenant_members').insert(row)
      if (ie) { console.error(`  ✗ ${s.name}: ${ie.message}`); continue }
      console.log(`  ✓ ${s.name.padEnd(22)} created`)
    }
  }
  console.log('\nDone. Password for all: ' + PASSWORD)
}

main().catch((e) => { console.error(e); process.exit(1) })
