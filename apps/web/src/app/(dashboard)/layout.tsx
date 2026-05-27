import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { NayaxTapListener } from '@/components/nayax/NayaxTapListener'

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
    .select('tenant_id, role, tenants(name, slug, status)')
    .eq('user_id', user.id)

  if (tenantIdFromCookie) {
    query = query.eq('tenant_id', tenantIdFromCookie)
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data: member } = await query.limit(1).maybeSingle()

  if (!member) redirect('/onboarding')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar tenantName={(member.tenants as { name: string })?.name ?? ''} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          {children}
        </main>
      </div>
      <MobileNav />
      <NayaxTapListener userId={user.id} tenantId={member.tenant_id} />
    </div>
  )
}
