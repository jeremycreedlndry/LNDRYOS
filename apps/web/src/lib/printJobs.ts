/**
 * Print job templates for bag labels (ZPL) and receipts (ESC/POS).
 */

import { qzPrintZPL, qzPrintRaw } from './qzTray'
import { formatCurrency } from './utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelSize {
  width_in: number   // inches
  height_in: number  // inches
  dpi?: number       // default 203
}

export const LABEL_SIZE_PRESETS: Record<string, LabelSize & { label: string }> = {
  '4x2': { label: '4" × 2"',  width_in: 4, height_in: 2 },
  '4x3': { label: '4" × 3"',  width_in: 4, height_in: 3 },
  '4x4': { label: '4" × 4"',  width_in: 4, height_in: 4 },
  '4x6': { label: '4" × 6"',  width_in: 4, height_in: 6 },
  '2x1': { label: '2" × 1"',  width_in: 2, height_in: 1 },
  '2x3': { label: '2" × 3"',  width_in: 2, height_in: 3 },
}
export const DEFAULT_LABEL_SIZE: LabelSize = { width_in: 4, height_in: 2 }

export interface BagLabelData {
  orderNumber: string
  customerName: string
  bagNumber: number
  totalBags: number
  notes?: string
  date?: string
  storeName?: string
  labelSize?: LabelSize
  isReady?: boolean  // bag-out "READY" label vs bag-in
}

export interface ReceiptLine {
  name: string
  quantity: number
  unitPrice: number
  unitLabel: string
  notes?: string | null
}

export interface ReceiptData {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  lines: ReceiptLine[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  paymentMethod: string
  storeName?: string
  storeAddress?: string | null
  storeCityPostal?: string | null
  storePhone?: string | null
  staffName?: string | null
  droppedOffDate?: string | null
  readyDate?: string | null
  orderNotes?: string | null
  date?: string
}

// ─── ZPL Bag Label ────────────────────────────────────────────────────────────

function buildBagLabelZPL(data: BagLabelData): string {
  const size  = data.labelSize ?? DEFAULT_LABEL_SIZE
  const dpi   = size.dpi ?? 203
  const pw    = Math.round(size.width_in * dpi)    // print width in dots
  const ll    = Math.round(size.height_in * dpi)   // label length in dots
  const margin = Math.round(dpi * 0.2)             // ~0.2" margin

  const store    = (data.storeName ?? 'LNDRYOS').toUpperCase().slice(0, 24)
  const customer = (data.customerName || 'Walk-in').slice(0, 26)
  const orderNum = data.orderNumber ?? ''
  const bag      = `BAG ${data.bagNumber} OF ${data.totalBags}`
  const date     = data.date ?? new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const notes    = data.notes?.slice(0, 38) ?? ''
  const inner    = pw - margin * 2  // usable width

  // Scale font sizes based on label height
  const isSmall = size.height_in <= 2
  const fontLg  = isSmall ? 35 : 50
  const fontMd  = isSmall ? 28 : 38
  const fontSm  = isSmall ? 22 : 28

  // Y positions — distribute evenly
  const y1 = margin                          // store name
  const y2 = y1 + fontSm + 8               // divider
  const y3 = y2 + 6                         // customer name
  const y4 = y3 + fontLg + 4               // order number
  const y5 = y4 + fontMd + 8              // divider 2
  const y6 = y5 + 6                         // bag / READY
  const y7 = y6 + (data.isReady ? fontLg + 4 : fontMd + 4)  // date+notes
  const y8 = y7 + fontSm + 8              // barcode (if space)
  const showBarcode = size.height_in >= 3 && y8 + 80 < ll

  const readyLine = data.isReady ? 'READY FOR PICKUP' : bag

  return [
    '^XA',
    `^PW${pw}`,
    `^LL${ll}`,
    `^CF0,${fontSm}`,
    // Store name
    `^FO${margin},${y1}^FB${inner},1,0,C^FD${store}^FS`,
    // Divider
    `^FO${margin},${y2}^GB${inner},2,2^FS`,
    // Customer name
    `^CF0,${fontLg}`,
    `^FO${margin},${y3}^FB${inner},1,0,C^FD${customer}^FS`,
    // Order number
    `^CF0,${fontMd}`,
    `^FO${margin},${y4}^FB${inner},1,0,C^FD#${orderNum}^FS`,
    // Divider
    `^FO${margin},${y5}^GB${inner},2,2^FS`,
    // Bag line / READY
    data.isReady ? `^CF0,${fontLg}` : `^CF0,${fontMd}`,
    `^FO${margin},${y6}^FB${inner},1,0,C^FD${readyLine}^FS`,
    // Date + notes
    `^CF0,${fontSm}`,
    `^FO${margin},${y7}^FB${inner},1,0,C^FD${date}${notes ? `  ·  ${notes}` : ''}^FS`,
    // Barcode
    ...(showBarcode ? [
      `^FO${Math.round(pw * 0.15)},${y8}^BY2^BCN,60,Y,N,N^FD${orderNum}^FS`,
    ] : []),
    '^XZ',
  ].join('\n')
}

// ─── ESC/POS + Star commands ──────────────────────────────────────────────────

const ESC = '\x1B'
const GS  = '\x1D'

const INIT       = ESC + '@'         // reset printer
const CENTER     = ESC + 'a\x01'     // center align
const LEFT       = ESC + 'a\x00'     // left align
const BOLD_ON    = ESC + 'E\x01'
const BOLD_OFF   = ESC + 'E\x00'
// ESC ! 0x38 = double-height + double-width + bold in one command
const LARGE_BOLD = ESC + '!\x38'
const NORMAL     = ESC + '!\x00'
// Cut: Star Line mode (ESC d n + ESC i) AND ESC/POS fallback (GS V A n) — printer uses whichever it knows
const CUT = ESC + '\x64\x05' + ESC + '\x69' + GS + '\x56\x41\x10'

const W = 32  // chars per line at normal size on 58mm paper

function padLine(left: string, right: string, width = W): string {
  const l = left.slice(0, width - right.length - 1)
  const gap = width - l.length - right.length
  return l + ' '.repeat(Math.max(1, gap)) + right + '\n'
}

const DASH = '-'.repeat(W) + '\n'

// Parse notes stored as "Key: Val · Key: Val" into individual lines
function parseNotes(lines: ReceiptLine[]): string[] {
  const raw = lines
    .map((l) => l.notes)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ')
  if (!raw) return []
  return raw.split(' · ').map((s) => s.trim()).filter(Boolean)
}

function buildOneCopy(data: ReceiptData, copyLabel: string): string {
  const droppedOff = data.droppedOffDate
    ?? new Date().toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', year: '2-digit' })

  const totalLbs = data.lines.filter((l) => l.unitLabel === 'lb').reduce((s, l) => s + l.quantity, 0)
  const pieces   = data.lines.filter((l) => l.unitLabel !== 'lb').reduce((s, l) => s + l.quantity, 0)
  const piecesLine = totalLbs > 0
    ? `${totalLbs.toFixed(1)} lbs`
    : `${pieces} Piece${pieces !== 1 ? 's' : ''}`

  const notes = parseNotes(data.lines)

  // Compact ready date: "Tue Jun 3" — short enough to fit on one LARGE line
  const readyShort = data.readyDate
    ? data.readyDate.replace(/\d{4}$/, '').trim()  // strip year if present
    : null

  return [
    INIT,
    CENTER,

    // ── Copy label ──
    `***** ${copyLabel} *****\n`,
    '\n',

    // ── Order # + pieces ──
    BOLD_ON, `#${data.orderNumber}\n`, BOLD_OFF,
    `${piecesLine}\n`,
    '\n',

    // ── Store name (large) ──
    LARGE_BOLD,
    `${data.storeName ?? 'The Laundry Co.'}\n`,
    NORMAL,

    // ── Store details (small) ──
    ...(data.storeAddress    ? [`${data.storeAddress}\n`]       : []),
    ...(data.storeCityPostal ? [`${data.storeCityPostal}\n`]    : []),
    ...(data.storePhone      ? [`Tel: ${data.storePhone}\n`]    : []),
    ...(data.staffName       ? [`Served By: ${data.staffName}\n`] : []),
    '\n',

    // ── Customer name (large) + phone ──
    LARGE_BOLD,
    `${data.customerName || 'Walk-in'}\n`,
    NORMAL,
    ...(data.customerPhone ? [`${data.customerPhone}\n`] : []),
    DASH,

    // ── Line items ──
    LEFT,
    ...data.lines.map((l) => {
      const qty   = l.unitLabel === 'lb' ? `${l.quantity.toFixed(1)} lb` : `x${l.quantity}`
      const price = formatCurrency(Math.round(l.quantity * l.unitPrice))
      return padLine(`${l.name} ${qty}`, price)
    }),
    DASH,

    // ── Totals ──
    padLine('SUBTOTAL:', formatCurrency(data.subtotalCents)),
    ...(data.taxCents > 0 ? [padLine('TAX:', formatCurrency(data.taxCents))] : []),
    BOLD_ON,
    padLine('TOTAL:', formatCurrency(data.totalCents)),
    BOLD_OFF,
    CENTER, `${data.paymentMethod}\n`,
    DASH,

    // ── Notes ──
    LEFT,
    ...(notes.length > 0 ? [
      `Notes: ${notes[0]}\n`,
      ...notes.slice(1).map((n) => `${n}\n`),
      '\n',
    ] : []),

    // ── Dropped off ──
    `Dropped Off: ${droppedOff}\n`,
    '\n',

    // ── Ready date (large, centered) ──
    ...(readyShort ? [
      CENTER,
      LARGE_BOLD,
      `Ready: ${readyShort}\n`,
      NORMAL,
    ] : []),

    '\n',
    CENTER,
    'Thank you for your business!\n',
    '\n\n\n',
    CUT,
  ].join('')
}

function buildReceiptESCPOS(data: ReceiptData): string {
  return buildOneCopy(data, 'Customer Copy') + buildOneCopy(data, 'Store Copy')
}

// ─── Public print functions ───────────────────────────────────────────────────

/**
 * Print bag-in labels (on order creation) — one per wash_fold bag.
 */
export async function printBagLabels(
  printerName: string,
  order: {
    order_number: string
    customer_name?: string | null
    lines: Array<{ name: string; category: string; notes?: string | null }>
  },
  storeName?: string,
  labelSize?: LabelSize,
): Promise<void> {
  const bagLines  = order.lines.filter((l) => l.category === 'wash_fold')
  const totalBags = bagLines.length || 1

  if (bagLines.length === 0) {
    await qzPrintZPL(printerName, buildBagLabelZPL({
      orderNumber: order.order_number,
      customerName: order.customer_name ?? 'Walk-in',
      bagNumber: 1, totalBags: 1, storeName, labelSize,
    }))
    return
  }

  for (let i = 0; i < bagLines.length; i++) {
    await qzPrintZPL(printerName, buildBagLabelZPL({
      orderNumber: order.order_number,
      customerName: order.customer_name ?? 'Walk-in',
      bagNumber: i + 1, totalBags,
      notes: bagLines[i].notes ?? undefined,
      storeName, labelSize,
    }))
  }
}

/**
 * Print bag-out "READY FOR PICKUP" labels — called when order is marked cleaned.
 * bagCount is the number of bags to print (user-entered).
 */
export async function printBagOutLabels(
  printerName: string,
  order: { order_number: string; customer_name?: string | null },
  bagCount: number,
  storeName?: string,
  labelSize?: LabelSize,
): Promise<void> {
  for (let i = 1; i <= bagCount; i++) {
    await qzPrintZPL(printerName, buildBagLabelZPL({
      orderNumber: order.order_number,
      customerName: order.customer_name ?? 'Walk-in',
      bagNumber: i, totalBags: bagCount,
      storeName, labelSize,
      isReady: true,
    }))
  }
}

/**
 * Print receipt — 2 copies (customer + store).
 */
export async function printReceipt(
  printerName: string,
  order: {
    order_number: string
    customer_name?: string | null
    customer_phone?: string | null
    lines: Array<{ name: string; category: string; quantity: number; unit_price: number; unit_label: string; notes?: string | null }>
    total_amount: number
    tax_rate?: number
    payment_method?: string
    due_date?: string | null
  },
  store?: {
    name?: string
    address?: string | null
    cityPostal?: string | null
    phone?: string | null
  },
  staffName?: string | null,
): Promise<void> {
  const subtotal = order.lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price), 0)
  const taxCents = order.total_amount - subtotal

  const readyDate = order.due_date
    ? new Date(order.due_date + 'T12:00:00').toLocaleDateString('en-CA', {
        weekday: 'short', month: 'numeric', day: 'numeric',
      })
    : null

  const data: ReceiptData = {
    orderNumber:   order.order_number,
    customerName:  order.customer_name ?? 'Walk-in',
    customerPhone: order.customer_phone,
    lines: order.lines.map((l) => ({
      name: l.name, quantity: l.quantity,
      unitPrice: l.unit_price, unitLabel: l.unit_label,
      notes: l.notes,
    })),
    subtotalCents:  subtotal,
    taxCents:       Math.max(0, taxCents),
    totalCents:     order.total_amount,
    paymentMethod:  order.payment_method ?? 'Paid',
    storeName:      store?.name,
    storeAddress:   store?.address,
    storeCityPostal: store?.cityPostal,
    storePhone:     store?.phone,
    staffName,
    readyDate,
  }

  // buildReceiptESCPOS includes both Customer Copy + Store Copy + cut between them
  await qzPrintRaw(printerName, buildReceiptESCPOS(data))
}
