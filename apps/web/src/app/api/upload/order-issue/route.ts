import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
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

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const orderId = formData.get('orderId') as string | null

  if (!file || !orderId) {
    return NextResponse.json({ error: 'Missing file or orderId' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const storagePath = `${member.tenant_id}/${orderId}/${randomUUID()}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await service.storage
    .from('order-issues')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = service.storage
    .from('order-issues')
    .getPublicUrl(storagePath)

  return NextResponse.json({ storage_path: storagePath, photo_url: publicUrl })
}
