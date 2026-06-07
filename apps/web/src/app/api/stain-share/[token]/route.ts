import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await service
    .from('stain_report_shares')
    .select('customer_name, order_number, due_date, order_summary, items, status, created_at')
    .eq('token', params.token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' },  { status: 404 })

  return NextResponse.json(data)
}
