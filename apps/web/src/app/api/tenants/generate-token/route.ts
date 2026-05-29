import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await service
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!member?.tenant_id) return NextResponse.json({ error: 'Not a tenant member' }, { status: 403 })

  const bytes = new Uint8Array(30)
  crypto.getRandomValues(bytes)
  const token = 'lndry_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service as any)
    .from('tenants')
    .update({ customer_api_token: token })
    .eq('id', member.tenant_id)

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })

  return NextResponse.json({ token })
}
