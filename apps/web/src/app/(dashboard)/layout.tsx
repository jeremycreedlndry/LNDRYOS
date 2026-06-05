import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { ClockInGate } from '@/components/layout/ClockInGate'
import { EnsureTenantCookie } from '@/components/layout/EnsureTenantCookie'
import { NayaxTapListener } from '@/components/nayax/NayaxTapListener'
import { StationProvider } from '@/components/station/StationProvider'
import { isPlatformAdmin } from '@laundry/api'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const tenantIdFromCookie = cookieStore.get('tenant_id')?.value

  // Use service client to bypass RLS for tenant lookup
  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Prefer the tenant_id cookie (same one tRPC uses) so the name stays in sync
  let query = service
    .from('tenant_members')
    .select('tenant_id, role, display_name, tenants(name, slug, status)')
    .eq('user_id', user.id)

  if (tenantIdFromCookie) {
    query = query.eq('tenant_id', tenantIdFromCookie)
  } else {
    query = query.order('created_at', { ascending: true })
  }

  const { data: members } = await query

  let member = null
  if (!tenantIdFromCookie) {
    // Pick the owner tenant that has delivery zones (the real store, not a test tenant)
    const ownerMembers = (members ?? []).filter((m: { role: string }) => m.role === 'owner')
    for (const m of ownerMembers) {
      const { data: zones } = await service.from('delivery_zones').select('id').eq('tenant_id', m.tenant_id).limit(1)
      if (zones && zones.length > 0) { member = m; break }
    }
    member = member ?? ownerMembers[0] ?? (members ?? [])[0] ?? null
  } else {
    member = (members ?? [])[0] ?? null
  }

  const platformAdmin = isPlatformAdmin(user.email)

  // Master admin can view any store (even without a membership row) via the tenant_id cookie
  if (!member && platformAdmin && tenantIdFromCookie) {
    const { data: t } = await service.from('tenants').select('name, slug, status').eq('id', tenantIdFromCookie).single()
    if (t) {
      member = { tenant_id: tenantIdFromCookie, role: 'owner', display_name: 'Master Admin', tenants: t } as typeof member
    }
  }

  if (!member) {
    // Platform admin with no store selected → send to the admin console
    if (platformAdmin) redirect('/admin')
    redirect('/onboarding')
  }

  const role        = (member.role        as string) ?? 'staff'
  const displayName = (member.display_name as string | null) ?? ''
  const storeName   = (member.tenants as unknown as { name: string })?.name ?? ''

  return (
    <StationProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar tenantName={(member.tenants as unknown as { name: string })?.name ?? ''} />
        <div className="flex flex-1 flex-col overflow-hidden">
          {platformAdmin && (
            <div className="flex items-center justify-between gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-white">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Master Admin — viewing <strong>{storeName}</strong>
              </span>
              <Link href="/admin" className="rounded-md bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30">
                Back to Admin
              </Link>
            </div>
          )}
          <TopBar role={role} />
          <main className="flex-1 overflow-auto pb-16 lg:pb-0">
            {children}
          </main>
        </div>
        <MobileNav />
        <EnsureTenantCookie tenantId={member.tenant_id} />
        <NayaxTapListener userId={user.id} tenantId={member.tenant_id} />
        <ClockInGate role={role} displayName={displayName} />
      </div>
    </StationProvider>
  )
}
