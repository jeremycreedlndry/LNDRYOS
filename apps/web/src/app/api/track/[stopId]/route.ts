import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  const { stopId } = await params

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: stop, error } = await supabase
    .from('pickup_stops')
    .select(`
      id, type, status, scheduled_date, time_start, time_end, completed_at,
      customer:customers(first_name),
      tenant:tenants(name)
    `)
    .eq('id', stopId)
    .single()

  if (error || !stop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Return only the non-sensitive public fields needed for tracking
  return NextResponse.json({
    id:             stop.id,
    type:           stop.type,           // 'pickup' | 'delivery'
    status:         stop.status,         // 'pending' | 'en_route' | 'completed' | 'skipped'
    scheduled_date: stop.scheduled_date,
    time_start:     stop.time_start,
    time_end:       stop.time_end,
    completed_at:   stop.completed_at,
    customer_first: (stop.customer as unknown as { first_name: string } | null)?.first_name ?? null,
    store_name:     (stop.tenant as unknown as { name: string } | null)?.name ?? 'Your laundry service',
  })
}
