import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

// Public endpoint — no auth required — returns enough invoice data to show a payment page
export async function GET(req: NextRequest) {
  const invoiceId = req.nextUrl.searchParams.get('id')
  if (!invoiceId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: inv, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, issue_date, due_date,
      subtotal_cents, tax_cents, total_cents, notes,
      tenant_id,
      customer:customers(first_name, last_name, email),
      business_account:business_accounts(name, email)
    `)
    .eq('id', invoiceId)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (inv.status === 'paid') return NextResponse.json({ ...inv, already_paid: true })
  if (inv.status === 'void') return NextResponse.json({ error: 'This invoice has been voided' }, { status: 410 })

  // Fetch tenant for store name + e-transfer email
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, settings')
    .eq('id', inv.tenant_id)
    .single()

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>

  return NextResponse.json({
    ...inv,
    store_name:      tenant?.name ?? '',
    etransfer_email: (settings.etransfer_email as string | null) ?? null,
    store_phone:     (settings.phone as string | null) ?? null,
  })
}
