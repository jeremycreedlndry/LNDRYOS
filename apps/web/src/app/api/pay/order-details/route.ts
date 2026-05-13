import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const token = req.nextUrl.searchParams.get('t')

  if (!id || !token) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, total_amount, paid_amount, payment_status, subtotal, tax_amount, notes,
      lines:order_lines(name, quantity, unit_label, unit_price, line_total),
      tenant:tenants(name, settings),
      customer:customers(first_name, last_name)
    `)
    .eq('id', id)
    .eq('payment_token', token)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json(order)
}
