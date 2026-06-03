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
      driver_lat, driver_lng, driver_updated_at,
      customer:customers(first_name, address_street, lat, lng),
      tenant:tenants(name)
    `)
    .eq('id', stopId)
    .single()

  if (error || !stop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Return only the non-sensitive public fields needed for tracking
  return NextResponse.json({
    id:               stop.id,
    type:             stop.type,
    status:           stop.status,
    scheduled_date:   stop.scheduled_date,
    time_start:       stop.time_start,
    time_end:         stop.time_end,
    completed_at:     stop.completed_at,
    driver_lat:       (stop as unknown as Record<string,unknown>).driver_lat ?? null,
    driver_lng:       (stop as unknown as Record<string,unknown>).driver_lng ?? null,
    driver_updated_at:(stop as unknown as Record<string,unknown>).driver_updated_at ?? null,
    customer_lat:     (stop.customer as unknown as Record<string,unknown>)?.lat ?? null,
    customer_lng:     (stop.customer as unknown as Record<string,unknown>)?.lng ?? null,
    customer_address: (stop.customer as unknown as Record<string,string>)?.address_street ?? null,
    customer_first:   (stop.customer as unknown as { first_name: string } | null)?.first_name ?? null,
    store_name:       (stop.tenant as unknown as { name: string } | null)?.name ?? 'Your laundry service',
  })
}

// Driver PWA posts their GPS location while en route
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  const { stopId } = await params
  const { lat, lng } = await req.json()
  if (!lat || !lng) return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('pickup_stops').update({
    driver_lat: lat,
    driver_lng: lng,
    driver_updated_at: new Date().toISOString(),
  }).eq('id', stopId).eq('status', 'en_route')

  return NextResponse.json({ ok: true })
}
