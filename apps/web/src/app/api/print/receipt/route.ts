import { NextRequest, NextResponse } from 'next/server'
import * as net from 'net'
import { createSupabaseServiceClient } from '@laundry/db'

// ─── ESC/POS helpers ──────────────────────────────────────────────────────────

const ESC  = 0x1b
const GS   = 0x1d
const LF   = 0x0a

const CMD = {
  init:       Buffer.from([ESC, 0x40]),
  alignLeft:  Buffer.from([ESC, 0x61, 0x00]),
  alignCenter:Buffer.from([ESC, 0x61, 0x01]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  boldOn:     Buffer.from([ESC, 0x45, 0x01]),
  boldOff:    Buffer.from([ESC, 0x45, 0x00]),
  doubleOn:   Buffer.from([ESC, 0x21, 0x31]), // double width + height
  doubleOff:  Buffer.from([ESC, 0x21, 0x00]),
  largeOn:    Buffer.from([ESC, 0x21, 0x11]), // double height only
  feed3:      Buffer.from([ESC, 0x64, 0x03]),
  cut:        Buffer.from([GS,  0x56, 0x00]), // full cut
}

const COLS = 42 // 72mm paper at 12cpi ≈ 42 chars

function line(text = ''): Buffer {
  return Buffer.from(text + '\n', 'utf8')
}

function centered(text: string): Buffer {
  const pad = Math.max(0, Math.floor((COLS - text.length) / 2))
  return line(' '.repeat(pad) + text)
}

function twoCol(left: string, right: string): Buffer {
  const gap = Math.max(1, COLS - left.length - right.length)
  return line(left + ' '.repeat(gap) + right)
}

function dashes(): Buffer {
  return line('-'.repeat(COLS))
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { order_id } = await req.json() as { order_id: string }
  if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Fetch order ──────────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, payment_status,
      subtotal, tax_amount, total_amount, paid_amount,
      created_at, due_date, notes, tenant_id,
      customer:customers(first_name, last_name, phone, order_preferences),
      lines:order_lines(name, category, quantity, unit_label, unit_price)
    `)
    .eq('id', order_id)
    .single()

  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // ── Fetch tenant settings ────────────────────────────────────────────────────
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, settings, address')
    .eq('id', order.tenant_id)
    .single()

  const settings  = (tenant?.settings ?? {}) as Record<string, unknown>
  const hardware  = (settings.hardware  ?? {}) as Record<string, unknown>
  const printer   = (hardware.receipt_printer ?? {}) as Record<string, string>
  const printerIp   = printer.ip   ?? ''
  const printerPort = parseInt(printer.port ?? '9100', 10)

  if (!printerIp) {
    return NextResponse.json({ error: 'Receipt printer not configured. Set IP in Settings → Hardware.' }, { status: 422 })
  }

  // ── Build ESC/POS buffer ─────────────────────────────────────────────────────
  const parts: Buffer[] = []
  const push = (...bufs: Buffer[]) => parts.push(...bufs)

  const addr    = tenant?.address as Record<string, string> | null
  const taxName = (settings.tax_name as string | undefined) ?? 'HST'
  const taxId   = (settings.tax_id   as string | undefined) ?? ''
  const phone   = (settings.phone    as string | undefined) ?? ''

  const customer = order.customer as { first_name: string; last_name: string; phone?: string | null; order_preferences?: Record<string,string> | null } | null
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'Walk-in'

  type OrderLine = { name: string; category: string; quantity: number; unit_label: string; unit_price: number }
  const lines    = (order.lines as OrderLine[]) ?? []
  const bags     = lines.filter((l) => l.category === 'wash_fold' && l.name.includes('· Bag')).length
  const pieces   = lines.filter((l) => !['wash_fold','upcharge','gift_card','product'].includes(l.category)).length
  const countLabel = bags > 0 ? `${bags} Bag${bags > 1 ? 's' : ''}` : pieces > 0 ? `${pieces} Piece${pieces > 1 ? 's' : ''}` : ''

  // Header
  push(CMD.init, CMD.alignCenter)
  push(line('*** Customer Copy ***'))
  push(CMD.boldOn, line(order.order_number), CMD.boldOff)
  if (countLabel) push(line(countLabel))
  push(line())

  // Store info
  push(CMD.boldOn, line(tenant?.name ?? 'Laundry'), CMD.boldOff)
  if (addr?.street)      push(line(addr.street))
  if (addr?.city)        push(line([addr.city, addr.postal_code].filter(Boolean).join(', ')))
  if (phone)             push(line(`Tel: ${phone}`))
  push(line())

  // Customer
  push(CMD.boldOn, line(customerName), CMD.boldOff)
  if (customer?.phone)   push(line(customer.phone))
  push(line())

  // Line items
  push(CMD.alignLeft, dashes())
  for (const l of lines) {
    if (l.category === 'upcharge') continue
    const lineTotal = `$${(l.unit_price * l.quantity / 100).toFixed(2)}`
    if (l.unit_label === 'lb') {
      const wt = `${l.quantity % 1 === 0 ? l.quantity : l.quantity.toFixed(2)}lb`
      const name = l.name.replace(/ · Bag \d+$/, '') // strip bag suffix
      push(twoCol(name, lineTotal))
      push(line(`  ${wt}`))
    } else {
      push(twoCol(`${l.name} x${l.quantity % 1 === 0 ? l.quantity : l.quantity.toFixed(1)}`, lineTotal))
    }
  }
  // Upcharges
  for (const l of lines.filter((l) => l.category === 'upcharge')) {
    push(twoCol(`  + ${l.name}`, `$${(l.unit_price * l.quantity / 100).toFixed(2)}`))
  }

  // Totals
  push(dashes())
  push(twoCol('SUBTOTAL:', `$${(order.subtotal / 100).toFixed(2)}`))
  push(twoCol(`${taxName}:`, `$${(order.tax_amount / 100).toFixed(2)}`))
  push(CMD.boldOn)
  push(twoCol('TOTAL:', `$${(order.total_amount / 100).toFixed(2)}`))
  push(CMD.boldOff)
  const balance = order.total_amount - (order.paid_amount ?? 0)
  if (order.payment_status === 'paid') {
    push(twoCol('', '✓ PAID'))
  } else {
    push(twoCol('BALANCE DUE:', `$${(balance / 100).toFixed(2)}`))
  }
  if (taxId) push(line(`${taxName} #: ${taxId}`))

  // Notes & prefs
  const prefs = customer?.order_preferences as Record<string, string> | null
  const PREF_LABELS: Record<string,string> = {
    bleach: 'Bleach', dryer_sheets: 'Dryer Sheets',
    detergent_type: 'Detergent Type', fabric_softener: 'Fabric Softener',
    wash_temperature: 'Wash Temperature',
  }
  const hasExtras = order.notes || (prefs && Object.values(prefs).some(Boolean))
  if (hasExtras) {
    push(dashes())
    if (order.notes) {
      // Word-wrap notes at COLS chars
      const words = `Notes: ${order.notes}`.split(' ')
      let row = ''
      for (const w of words) {
        if (row.length + w.length + 1 > COLS) { push(line(row)); row = w }
        else row = row ? `${row} ${w}` : w
      }
      if (row) push(line(row))
    }
    if (prefs) {
      for (const [k, v] of Object.entries(prefs)) {
        if (v) push(line(`${PREF_LABELS[k] ?? k}: ${v}`))
      }
    }
  }

  // Drop-off
  push(dashes())
  const dropOff = new Date(order.created_at).toLocaleString('en-CA', {
    month: '2-digit', day: '2-digit', year: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: false,
  })
  push(line(`Dropped Off: ${dropOff}`))

  // Ready date — large
  if (order.due_date) {
    const dueStr = new Date(order.due_date).toLocaleDateString('en-CA', {
      weekday: 'short', month: '2-digit', day: '2-digit',
    })
    push(dashes())
    push(CMD.alignCenter, CMD.doubleOn, CMD.boldOn)
    push(line(`Ready: ${dueStr}`))
    push(CMD.boldOff, CMD.doubleOff, CMD.alignLeft)
  }

  // Footer
  push(dashes())
  push(CMD.alignCenter, line('Thank you for your business!'))
  push(CMD.feed3, CMD.cut)

  const printData = Buffer.concat(parts)

  // ── Send to printer via TCP ──────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket()
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Printer at ${printerIp}:${printerPort} did not respond within 5s`))
    }, 5000)

    socket.connect(printerPort, printerIp, () => {
      socket.write(printData, (err) => {
        clearTimeout(timeout)
        socket.end()
        if (err) reject(err)
        else resolve()
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  return NextResponse.json({ ok: true })
}
