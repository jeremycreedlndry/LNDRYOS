import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@laundry/db'
import { cookies } from 'next/headers'

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id } = await params

  // Auth
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get tenant — same resolution as tRPC: cookie first, then DB fallback
  const cookieStore = await cookies()
  let tenantId = cookieStore.get('tenant_id')?.value ?? ''

  if (!tenantId) {
    const { data: member } = await service
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 })
    tenantId = member.tenant_id
  }

  // Fetch invoice
  const { data: inv, error: invError } = await service
    .from('invoices')
    .select(`
      *,
      customer:customers(id, first_name, last_name, email, phone, address_street, address_city, address_postal_code),
      business_account:business_accounts(id, name, email, phone, address, city, province, postal_code)
    `)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (invError || !inv) {
    console.error('[invoice-pdf] invoice fetch error:', invError, { id, tenantId })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch orders with lines
  const { data: invOrders } = await service
    .from('invoice_orders')
    .select(`
      order:orders(
        id, order_number, created_at, ready_at,
        total_amount, paid_amount,
        lines:order_lines(name, quantity, line_total)
      )
    `)
    .eq('invoice_id', id)
    .eq('tenant_id', tenantId)

  type PrintOrder = {
    id: string; order_number: string; created_at: string; ready_at?: string | null
    total_amount: number; paid_amount: number
    lines: { name: string; quantity: number; line_total: number }[]
  }
  const orders = ((invOrders ?? []).map((r) => r.order).filter(Boolean)) as unknown as PrintOrder[]

  // Fetch tenant
  const { data: tenant } = await service
    .from('tenants')
    .select('name, settings, address')
    .eq('id', tenantId)
    .single()

  const settings     = (tenant?.settings ?? {}) as Record<string, unknown>
  const logoUrl      = settings.logo_url as string | null | undefined
  const taxName      = (settings.tax_name as string | null) ?? 'Tax'
  const taxId        = settings.tax_id as string | null | undefined
  const storePhone   = settings.phone as string | null | undefined
  const storeName    = tenant?.name ?? 'Laundry Store'
  const tenantAddr   = (tenant?.address ?? {}) as Record<string, unknown>
  const storeAddress = (tenantAddr.formatted as string | null)
    ?? [tenantAddr.street, tenantAddr.city, tenantAddr.province].filter(Boolean).join(', ')

  // Recipient
  const isBA = inv.recipient_type === 'business_account'
  const ba   = inv.business_account as { name: string; address?: string | null; city?: string | null; province?: string | null; postal_code?: string | null } | null
  const cust = inv.customer as { first_name: string; last_name: string; address_street?: string | null; address_city?: string | null; address_postal_code?: string | null } | null
  const recipientName  = isBA ? (ba?.name ?? '—') : cust ? `${cust.first_name} ${cust.last_name}` : '—'
  const recipientAddr1 = isBA ? (ba?.address ?? '') : (cust?.address_street ?? '')
  const recipientAddr2 = isBA
    ? [ba?.city, ba?.province, ba?.postal_code].filter(Boolean).join(', ')
    : [cust?.address_city, cust?.address_postal_code].filter(Boolean).join(', ')

  // Reference date range
  const dates  = orders.map((o) => new Date(o.created_at).getTime())
  const minD   = dates.length ? fmtDate(new Date(Math.min(...dates)).toISOString()) : '—'
  const maxD   = dates.length ? fmtDate(new Date(Math.max(...dates)).toISOString()) : '—'
  const reference = minD !== maxD ? `${minD} – ${maxD}` : minD

  const isPaid = inv.status === 'paid'

  // Build orders rows HTML
  const orderRows = orders.map((order, i) => {
    const summary = order.lines?.length > 0
      ? order.lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.name}`).join(', ')
      : '—'
    const balance = order.total_amount - (order.paid_amount ?? 0)
    const bg = i % 2 === 1 ? 'background:#fafafa;' : ''
    return `<tr style="${bg}">
      <td style="font-weight:700;white-space:nowrap;">${order.order_number}</td>
      <td style="white-space:nowrap;">${fmtDate(order.created_at)}</td>
      <td style="white-space:nowrap;">${order.ready_at ? fmtDate(order.ready_at) : 'N/A'}</td>
      <td>${summary}</td>
      <td style="text-align:right;font-weight:600;white-space:nowrap;">${fmt(balance)}</td>
    </tr>`
  }).join('')

  const taxRow = inv.tax_cents > 0
    ? `<tr><td style="color:#6b7280;">Subtotal</td><td style="text-align:right;font-weight:600;">${fmt(inv.subtotal_cents)}</td></tr>
       <tr><td style="color:#6b7280;">${taxName}</td><td style="text-align:right;font-weight:600;">${fmt(inv.tax_cents)}</td></tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10pt; color: #111827; background: #f4f4f5; }
    .page { max-width: 800px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .status-bar { background: #1a1a2e; color: #fff; text-align: center; padding: 14px 24px; }
    .status-bar h1 { font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .body { padding: 32px 40px 48px; }
    .store-row { padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px; }
    .store-logo { max-height: 64px; max-width: 180px; width: auto; display: block; margin-bottom: 8px; }
    .store-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .store-info { font-size: 11px; color: #6b7280; line-height: 1.6; }
    .two-col { display: flex; gap: 32px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px; }
    .bill-to { flex: 1; }
    .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 6px; }
    .bill-name { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
    .bill-addr { font-size: 11px; color: #6b7280; line-height: 1.5; }
    .meta-table { width: 220px; border-collapse: collapse; }
    .meta-table td { padding: 3px 6px; font-size: 11px; }
    .meta-table td:first-child { color: #9ca3af; font-weight: 600; text-align: right; white-space: nowrap; }
    .meta-table td:last-child { font-weight: 700; color: #111827; padding-left: 12px; }
    .orders-table { width: 100%; border-collapse: collapse; }
    .orders-table thead tr { background: #1a1a2e; }
    .orders-table th { padding: 8px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #fff; }
    .orders-table th:last-child { text-align: right; }
    .orders-table td { padding: 8px 10px; font-size: 11px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .totals { display: flex; justify-content: flex-end; margin-top: 20px; }
    .totals-inner { width: 240px; }
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 4px 6px; font-size: 12px; }
    .grand-row td { font-size: 14px; font-weight: 700; border-top: 2px solid #1a1a2e; padding-top: 10px; }
    .hst-reg { font-size: 10px; color: #9ca3af; text-align: right; margin-top: 8px; }
    .print-btn { text-align: center; margin: 32px 0 0; }
    .print-btn button { background: #1a1a2e; color: #fff; border: none; border-radius: 8px; padding: 12px 32px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .print-btn button:hover { background: #2d2d4e; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; }
      .page { margin: 0; border-radius: 0; box-shadow: none; max-width: none; }
      .body { padding: 24px 32px; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="status-bar">
    <h1>Invoice ${isPaid ? '— PAID' : '— UNPAID'}</h1>
  </div>
  <div class="body">
    <!-- Store -->
    <div class="store-row">
      ${logoUrl ? `<img src="${logoUrl}" alt="${storeName}" class="store-logo"/>` : `<div class="store-name">${storeName}</div>`}
      <div class="store-info">${[storeAddress, storePhone].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>
    </div>

    <!-- Bill to + Meta -->
    <div class="two-col">
      <div class="bill-to">
        <div class="section-label">Bill To</div>
        <div class="bill-name">${recipientName}</div>
        ${recipientAddr1 ? `<div class="bill-addr">${recipientAddr1}</div>` : ''}
        ${recipientAddr2 ? `<div class="bill-addr">${recipientAddr2}</div>` : ''}
      </div>
      <table class="meta-table">
        <tr><td>Invoice #</td><td>${inv.invoice_number}</td></tr>
        <tr><td>Reference</td><td>${reference}</td></tr>
        <tr><td>Date</td><td>${fmtDate(inv.issue_date)}</td></tr>
        ${inv.due_date ? `<tr><td>Due Date</td><td>${fmtDate(inv.due_date)}</td></tr>` : ''}
      </table>
    </div>

    <!-- Orders -->
    <div class="section-label" style="margin-bottom:8px;">Orders Included</div>
    <table class="orders-table">
      <thead>
        <tr>
          <th style="width:10%">Order ID</th>
          <th style="width:10%">Date</th>
          <th style="width:10%">Cleaned</th>
          <th>Order Summary</th>
          <th style="width:10%;text-align:right;">Price</th>
        </tr>
      </thead>
      <tbody>${orderRows}</tbody>
    </table>

    <!-- Totals -->
    <div class="totals">
      <div class="totals-inner">
        <table class="totals-table">
          <tbody>
            ${taxRow}
            <tr class="grand-row">
              <td>Total</td>
              <td style="text-align:right;">${fmt(inv.total_cents)}</td>
            </tr>
          </tbody>
        </table>
        ${taxId ? `<div class="hst-reg">${taxName} #: ${taxId}</div>` : ''}
      </div>
    </div>

    <!-- Print button -->
    <div class="print-btn no-print">
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[invoice-pdf]', msg)
    return new NextResponse(`<pre style="padding:32px;font-family:monospace;color:red">Error: ${msg}</pre>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
