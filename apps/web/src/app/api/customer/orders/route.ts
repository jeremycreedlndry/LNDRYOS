import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer, CORS_HEADERS } from '../_lib/auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// GET /api/customer/orders — return order history for the authenticated customer
export async function GET(req: NextRequest) {
  const { ctx, response } = await requireCustomer(req)
  if (response) return response

  if (!ctx.customer) {
    return NextResponse.json([], { headers: CORS_HEADERS })
  }

  const customerId = (ctx.customer as { id: string }).id

  const { data: orders, error } = await ctx.supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      payment_status,
      subtotal,
      tax_amount,
      discount_amount,
      delivery_fee_cents,
      total_amount,
      due_date,
      created_at,
      notes,
      pickup_stops (
        id,
        type,
        status,
        scheduled_date,
        time_start,
        time_end,
        completed_at
      )
    `)
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json(orders ?? [], { headers: CORS_HEADERS })
}
