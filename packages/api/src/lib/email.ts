import { Resend } from 'resend'

let _resend: Resend | null = null
function resend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!)
  return _resend
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@laundry.app'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export { APP_URL }

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] No RESEND_API_KEY — would send to ${opts.to}: ${opts.subject}`)
    return
  }
  // Staging override: redirect all emails to a test address
  const to = process.env.NOTIFICATION_OVERRIDE_EMAIL ?? opts.to
  if (process.env.NOTIFICATION_OVERRIDE_EMAIL) {
    console.log(`[email] Override active — redirecting ${opts.to} → ${to}`)
  }
  const { error } = await resend().emails.send({
    from: FROM,
    to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
  })
  if (error) console.error('[email] Send error:', error)
}

// ─── Base layout ──────────────────────────────────────────────────────────────

export function emailLayout(storeName: string, body: string, footer?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;}
  .wrap{max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);}
  .header{background:#1d4ed8;padding:24px 32px;}
  .header h1{margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px;}
  .body{padding:32px;}
  .body p{margin:0 0 16px;line-height:1.6;font-size:15px;color:#374151;}
  .table{width:100%;border-collapse:collapse;margin:16px 0;}
  .table th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;padding:8px 0;border-bottom:1px solid #e5e7eb;}
  .table td{padding:10px 0;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;vertical-align:top;}
  .table td.right{text-align:right;}
  .total-row td{font-weight:700;font-size:16px;color:#111827;border-bottom:none;padding-top:16px;}
  .btn{display:inline-block;background:#1d4ed8;color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:16px 0;}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;}
  .badge-green{background:#dcfce7;color:#166534;}
  .badge-amber{background:#fef3c7;color:#92400e;}
  .divider{height:1px;background:#e5e7eb;margin:24px 0;}
  .footer-wrap{background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;}
  .footer-wrap p{margin:0;font-size:12px;color:#9ca3af;line-height:1.5;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>${storeName}</h1></div>
  <div class="body">${body}</div>
  <div class="footer-wrap">
    <p>${footer ?? `${storeName} · This email was sent because you have an active order with us.`}</p>
  </div>
</div>
</body>
</html>`
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ─── Templates ────────────────────────────────────────────────────────────────

interface LineItem { name: string; quantity: number; unit_label: string; unit_price: number; line_total: number }

function itemsTable(lines: LineItem[]): string {
  const rows = lines.map((l) => `
    <tr>
      <td>${l.name}${l.unit_label !== 'item' ? `<br/><span style="font-size:12px;color:#9ca3af">${l.quantity} ${l.unit_label} × ${fmt(l.unit_price)}</span>` : ''}</td>
      <td class="right">${fmt(l.line_total)}</td>
    </tr>`).join('')
  return `<table class="table"><thead><tr><th>Item</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table>`
}

// ─── Order Created ─────────────────────────────────────────────────────────────

export interface OrderCreatedData {
  storeName: string
  storePhone?: string | null
  customerName: string
  orderNumber: string
  lines: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  notes?: string | null
}

export function orderCreatedEmail(d: OrderCreatedData): { subject: string; html: string } {
  const body = `
    <p>Hi ${d.customerName},</p>
    <p>Your order has been received and is now being processed. We'll email you when it's ready.</p>
    <p><strong>Order #${d.orderNumber}</strong></p>
    ${itemsTable(d.lines)}
    <table class="table">
      <tbody>
        ${d.taxAmount > 0 ? `<tr><td>Subtotal</td><td class="right">${fmt(d.subtotal)}</td></tr><tr><td>Tax</td><td class="right">${fmt(d.taxAmount)}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td class="right">${fmt(d.total)}</td></tr>
      </tbody>
    </table>
    ${d.notes ? `<p style="font-size:13px;color:#6b7280;background:#f9fafb;padding:12px;border-radius:8px;margin-top:8px">📝 ${d.notes}</p>` : ''}
    ${d.storePhone ? `<div class="divider"></div><p style="font-size:13px;color:#6b7280">Questions? Call us at ${d.storePhone}</p>` : ''}
  `
  return {
    subject: `Order received — #${d.orderNumber}`,
    html: emailLayout(d.storeName, body),
  }
}

// ─── Order Ready ──────────────────────────────────────────────────────────────

export interface OrderReadyData {
  storeName: string
  storePhone?: string | null
  customerName: string
  orderNumber: string
  lines: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  isPaid: boolean
  paymentLink?: string
}

export function orderReadyEmail(d: OrderReadyData): { subject: string; html: string } {
  const paySection = !d.isPaid && d.paymentLink ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 4px;font-weight:600;font-size:16px;color:#1e40af">Amount due: ${fmt(d.total)}</p>
      <p style="margin:0 0 16px;font-size:13px;color:#3b82f6">Pay online before pickup or pay in store</p>
      <a href="${d.paymentLink}" class="btn">Pay Now — ${fmt(d.total)}</a>
    </div>` : d.isPaid ? `<p><span class="badge badge-green">✓ Paid</span></p>` : ''

  const body = `
    <p>Hi ${d.customerName},</p>
    <p>Great news — your order is <strong>ready for pickup!</strong></p>
    <p><strong>Order #${d.orderNumber}</strong></p>
    ${itemsTable(d.lines)}
    <table class="table">
      <tbody>
        ${d.taxAmount > 0 ? `<tr><td>Subtotal</td><td class="right">${fmt(d.subtotal)}</td></tr><tr><td>Tax</td><td class="right">${fmt(d.taxAmount)}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td class="right">${fmt(d.total)}</td></tr>
      </tbody>
    </table>
    ${paySection}
    ${d.storePhone ? `<div class="divider"></div><p style="font-size:13px;color:#6b7280">Questions? Call us at ${d.storePhone}</p>` : ''}
  `
  return {
    subject: `Your laundry is ready — #${d.orderNumber}`,
    html: emailLayout(d.storeName, body),
  }
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export interface ReceiptData {
  storeName: string
  storePhone?: string | null
  customerName: string
  orderNumber: string
  lines: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  paidAmount: number
  payments: { method: string; amount: number; processed_at?: string }[]
}

export function receiptEmail(d: ReceiptData): { subject: string; html: string } {
  const payRows = d.payments.map((p) => `
    <tr>
      <td>${p.method.replace(/_/g, ' ')}</td>
      <td class="right">${fmt(p.amount)}</td>
    </tr>`).join('')

  const body = `
    <p>Hi ${d.customerName},</p>
    <p>Here's your receipt for order <strong>#${d.orderNumber}</strong>.</p>
    ${itemsTable(d.lines)}
    <div class="divider"></div>
    <table class="table">
      <thead><tr><th>Payment</th><th class="right">Amount</th></tr></thead>
      <tbody>${payRows}</tbody>
    </table>
    <table class="table">
      <tbody>
        ${d.taxAmount > 0 ? `<tr><td>Subtotal</td><td class="right">${fmt(d.subtotal)}</td></tr><tr><td>Tax</td><td class="right">${fmt(d.taxAmount)}</td></tr>` : ''}
        <tr class="total-row"><td>Total paid</td><td class="right">${fmt(d.paidAmount)}</td></tr>
      </tbody>
    </table>
    <p><span class="badge badge-green">✓ Paid in full</span></p>
    ${d.storePhone ? `<div class="divider"></div><p style="font-size:13px;color:#6b7280">Questions? Call us at ${d.storePhone}</p>` : ''}
  `
  return {
    subject: `Receipt — #${d.orderNumber}`,
    html: emailLayout(d.storeName, body),
  }
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface InvoiceData {
  storeName: string
  storePhone?: string | null
  customerName: string
  orderNumber: string
  lines: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  balance: number
  paymentLink: string
}

export function invoiceEmail(d: InvoiceData): { subject: string; html: string } {
  const body = `
    <p>Hi ${d.customerName},</p>
    <p>Please find your invoice for order <strong>#${d.orderNumber}</strong> below.</p>
    ${itemsTable(d.lines)}
    <table class="table">
      <tbody>
        ${d.taxAmount > 0 ? `<tr><td>Subtotal</td><td class="right">${fmt(d.subtotal)}</td></tr><tr><td>Tax</td><td class="right">${fmt(d.taxAmount)}</td></tr>` : ''}
        <tr class="total-row"><td>Balance due</td><td class="right">${fmt(d.balance)}</td></tr>
      </tbody>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${d.paymentLink}" class="btn">Pay Invoice — ${fmt(d.balance)}</a>
    </div>
    ${d.storePhone ? `<div class="divider"></div><p style="font-size:13px;color:#6b7280">Questions? Call us at ${d.storePhone}</p>` : ''}
  `
  return {
    subject: `Invoice #${d.orderNumber} — ${fmt(d.balance)} due`,
    html: emailLayout(d.storeName, body),
  }
}

// ─── Pickup reminder ──────────────────────────────────────────────────────────

export interface PickupReminderData {
  storeName: string
  storePhone?: string | null
  customerName: string
  pickupDate: string        // e.g. "Monday, May 12"
  timeWindow?: string | null // e.g. "9:00am – 12:00pm"
}

export function pickupReminderEmail(d: PickupReminderData): { subject: string; html: string } {
  const body = `
    <p>Hi ${d.customerName},</p>
    <p>This is a reminder that we'll be picking up your laundry <strong>tomorrow, ${d.pickupDate}</strong>${d.timeWindow ? ` between <strong>${d.timeWindow}</strong>` : ''}.</p>
    <p>Please have your laundry ready and accessible for our driver.</p>
    ${d.storePhone ? `<div class="divider"></div><p style="font-size:13px;color:#6b7280">Need to reschedule? Call us at ${d.storePhone}</p>` : ''}
  `
  return {
    subject: `Pickup reminder — tomorrow, ${d.pickupDate}`,
    html: emailLayout(d.storeName, body),
  }
}
