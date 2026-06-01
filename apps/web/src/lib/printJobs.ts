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

// ─── ESC/POS Receipt ──────────────────────────────────────────────────────────

// ─── ESC/POS + Star commands ──────────────────────────────────────────────────

const ESC = '\x1B'

const INIT     = ESC + '@'           // initialize printer
const CENTER   = ESC + 'a\x01'
const LEFT     = ESC + 'a\x00'
const BOLD_ON  = ESC + 'E\x01'
const BOLD_OFF = ESC + 'E\x00'
const LARGE    = ESC + '!\x30'       // double width + double height
const NORMAL   = ESC + '!\x00'
const SMALL    = ESC + '!\x01'       // condensed
// Star full cut (works on TSP100/TSP650 in Star mode and ESC/POS emulation)
const CUT      = ESC + 'd\x05' + ESC + 'i'

const W = 32  // chars at normal size on 58mm paper

function center(text: string, width = W): string {
  const t = text.slice(0, width)
  const pad = Math.max(0, Math.floor((width - t.length) / 2))
  return ' '.repeat(pad) + t + '\n'
}

function padLine(left: string, right: string, width = W): string {
  const l = left.slice(0, width - right.length - 1)
  const gap = width - l.length - right.length
  return l + ' '.repeat(Math.max(1, gap)) + right + '\n'
}

const DASH = '-'.repeat(W) + '\n'

function buildReceiptESCPOS(data: ReceiptData): string {
  const droppedOff = data.droppedOffDate
    ?? new Date().toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', year: '2-digit' })

  const pieces = data.lines
    .filter((l) => l.unitLabel !== 'lb')
    .reduce((s, l) => s + l.quantity, 0)
  const totalLbs = data.lines
    .filter((l) => l.unitLabel === 'lb')
    .reduce((s, l) => s + l.quantity, 0)
  const piecesLine = totalLbs > 0
    ? `${totalLbs.toFixed(1)} lbs`
    : `${pieces} Piece${pieces !== 1 ? 's' : ''}`

  // Collect order notes from line notes (preferences)
  const noteStrings = data.lines
    .map((l) => l.notes)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
  const notesBlock = data.orderNotes
    ? [data.orderNotes]
    : noteStrings as string[]

  const parts: string[] = [
    INIT,
    CENTER,

    // ── Order # + pieces ──
    BOLD_ON, `#${data.orderNumber}\n`, BOLD_OFF,
    `${piecesLine}\n`,
    '\n',

    // ── Store header ──
    BOLD_ON, LARGE,
    center(data.storeName ?? 'The Laundry Co.', W),
    NORMAL, BOLD_OFF,
    ...(data.storeAddress ? [center(data.storeAddress, W)] : []),
    ...(data.storeCityPostal ? [center(data.storeCityPostal, W)] : []),
    ...(data.storePhone ? [center(`Tel: ${data.storePhone}`, W)] : []),
    ...(data.staffName ? [center(`Served By: ${data.staffName}`, W)] : []),
    '\n',

    // ── Customer ──
    BOLD_ON, LARGE,
    center(data.customerName || 'Walk-in', W),
    NORMAL, BOLD_OFF,
    ...(data.customerPhone ? [center(data.customerPhone, W)] : []),
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

    // ── Notes + dates ──
    LEFT,
    ...(notesBlock.length > 0 ? [
      `Notes: ${notesBlock.join('\n       ')}\n`,
      '\n',
    ] : []),
    `Dropped Off: ${droppedOff}\n`,
    '\n',

    // ── Ready date (large) ──
    ...(data.readyDate ? [
      CENTER, BOLD_ON, LARGE,
      center(`Ready: ${data.readyDate}`, W),
      NORMAL, BOLD_OFF,
    ] : []),

    '\n',
    CENTER,
    'Thank you for your business!\n',
    '\n',
    CUT,
  ]

  return parts.join('')
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

  const raw = buildReceiptESCPOS(data)
  // Print 2 copies: customer copy + store copy
  await qzPrintRaw(printerName, raw)
  await qzPrintRaw(printerName, raw)
}
