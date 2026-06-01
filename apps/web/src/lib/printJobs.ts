/**
 * Print job templates for bag labels (ZPL) and receipts (ESC/POS).
 */

import { qzPrintZPL, qzPrintRaw } from './qzTray'
import { formatCurrency } from './utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BagLabelData {
  orderNumber: string
  customerName: string
  bagNumber: number
  totalBags: number
  notes?: string
  date?: string
  storeName?: string
}

export interface ReceiptLine {
  name: string
  quantity: number
  unitPrice: number
  unitLabel: string
}

export interface ReceiptData {
  orderNumber: string
  customerName: string
  lines: ReceiptLine[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  paymentMethod: string
  storeName?: string
  date?: string
}

// ─── ZPL Bag Label ────────────────────────────────────────────────────────────
// Designed for 4" wide labels at 203dpi (ZD220 default)

function buildBagLabelZPL(data: BagLabelData): string {
  const store = (data.storeName ?? 'LNDRYOS').toUpperCase().slice(0, 24)
  const customer = (data.customerName || 'Walk-in').slice(0, 28)
  const orderNum = data.orderNumber ?? ''
  const bag = `BAG ${data.bagNumber} OF ${data.totalBags}`
  const date = data.date ?? new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const notes = data.notes?.slice(0, 40) ?? ''

  return [
    '^XA',
    '^CF0,30',
    // Store name
    `^FO40,30^FB660,1,0,C^FD${store}^FS`,
    // Divider
    '^FO40,70^GB660,3,3^FS',
    // Customer name (large)
    '^CF0,50',
    `^FO40,85^FB660,1,0,C^FD${customer}^FS`,
    // Order number
    '^CF0,35',
    `^FO40,145^FB660,1,0,C^FD#${orderNum}^FS`,
    // Divider
    '^FO40,190^GB660,2,2^FS',
    // Bag number (big)
    '^CF0,55',
    `^FO40,200^FB660,1,0,C^FD${bag}^FS`,
    // Date + notes
    '^CF0,25',
    `^FO40,265^FB660,1,0,C^FD${date}${notes ? `  ·  ${notes}` : ''}^FS`,
    // Barcode (order number)
    `^FO140,295^BY2^BCN,60,Y,N,N^FD${orderNum}^FS`,
    '^XZ',
  ].join('\n')
}

// ─── ESC/POS Receipt ──────────────────────────────────────────────────────────

const ESC = '\x1B'
const GS  = '\x1D'

const CENTER = ESC + 'a\x01'
const LEFT   = ESC + 'a\x00'
const RIGHT  = ESC + 'a\x02'
const BOLD_ON  = ESC + 'E\x01'
const BOLD_OFF = ESC + 'E\x00'
const DOUBLE   = ESC + '!\x18'   // double width + height
const NORMAL   = ESC + '!\x00'
const INIT     = ESC + '@'
const FEED3    = '\n\n\n'
const CUT      = GS + 'V\x41\x03'  // partial cut + 3mm feed

function padLine(left: string, right: string, width = 42): string {
  const gap = width - left.length - right.length
  return left + ' '.repeat(Math.max(1, gap)) + right + '\n'
}

function buildReceiptESCPOS(data: ReceiptData): string {
  const store = data.storeName ?? 'LNDRYOS'
  const date = data.date ?? new Date().toLocaleString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const parts: string[] = [
    INIT,
    // Header
    CENTER,
    DOUBLE,
    `${store}\n`,
    NORMAL,
    `${date}\n`,
    BOLD_ON,
    `Order #${data.orderNumber}\n`,
    BOLD_OFF,
    `${data.customerName || 'Walk-in'}\n`,
    LEFT,
    '-'.repeat(42) + '\n',
    // Line items
    ...data.lines.map((l) => {
      const qty = l.unitLabel === 'lb'
        ? `${l.quantity.toFixed(1)} lb`
        : `x${l.quantity}`
      const price = formatCurrency(Math.round(l.quantity * l.unitPrice))
      return padLine(`${l.name.slice(0, 28)} ${qty}`, price)
    }),
    '-'.repeat(42) + '\n',
    // Totals
    padLine('Subtotal', formatCurrency(data.subtotalCents)),
    data.taxCents > 0 ? padLine('Tax', formatCurrency(data.taxCents)) : '',
    BOLD_ON,
    padLine('TOTAL', formatCurrency(data.totalCents)),
    BOLD_OFF,
    padLine('Payment', data.paymentMethod),
    '-'.repeat(42) + '\n',
    // Footer
    CENTER,
    'Thank you!\n',
    'lndryos.com\n',
    FEED3,
    CUT,
  ]

  return parts.join('')
}

// ─── Public print functions ───────────────────────────────────────────────────

/**
 * Print one bag label per wash_fold bag on the configured label printer.
 * Silently no-ops if no label printer is configured or QZ Tray isn't running.
 */
export async function printBagLabels(
  printerName: string,
  order: {
    order_number: string
    customer_name?: string | null
    lines: Array<{ name: string; category: string; notes?: string | null }>
  },
  storeName?: string,
): Promise<void> {
  const bagLines = order.lines.filter((l) => l.category === 'wash_fold')
  const totalBags = bagLines.length || 1

  if (bagLines.length === 0) {
    // Non-wash_fold order — print a single label
    const zpl = buildBagLabelZPL({
      orderNumber: order.order_number,
      customerName: order.customer_name ?? 'Walk-in',
      bagNumber: 1,
      totalBags: 1,
      storeName,
    })
    await qzPrintZPL(printerName, zpl)
    return
  }

  for (let i = 0; i < bagLines.length; i++) {
    const line = bagLines[i]
    const zpl = buildBagLabelZPL({
      orderNumber: order.order_number,
      customerName: order.customer_name ?? 'Walk-in',
      bagNumber: i + 1,
      totalBags,
      notes: line.notes ?? undefined,
      storeName,
    })
    await qzPrintZPL(printerName, zpl)
  }
}

/**
 * Print a receipt on the configured receipt printer.
 * Silently no-ops if no receipt printer is configured or QZ Tray isn't running.
 */
export async function printReceipt(
  printerName: string,
  order: {
    order_number: string
    customer_name?: string | null
    lines: Array<{ name: string; category: string; quantity: number; unit_price: number; unit_label: string }>
    total_amount: number
    tax_rate?: number
    payment_method?: string
  },
  storeName?: string,
): Promise<void> {
  const subtotal = order.lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const taxCents = order.total_amount - subtotal

  const data: ReceiptData = {
    orderNumber: order.order_number,
    customerName: order.customer_name ?? 'Walk-in',
    lines: order.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      unitLabel: l.unit_label,
    })),
    subtotalCents: subtotal,
    taxCents: Math.max(0, taxCents),
    totalCents: order.total_amount,
    paymentMethod: order.payment_method ?? 'Paid',
    storeName,
  }

  await qzPrintRaw(printerName, buildReceiptESCPOS(data))
}
