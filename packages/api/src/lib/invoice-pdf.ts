import React from 'react'
import {
  Document, Page, Text, View, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

// shorthand — avoids JSX entirely so Next.js dev-mode jsx-dev-runtime never runs
const el = React.createElement

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = { dark: '#1a1a2e', gray: '#6b7280', lightGray: '#f3f4f6', border: '#e5e7eb', text: '#111827', muted: '#9ca3af' }

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 10, color: C.text, backgroundColor: '#fff', paddingBottom: 40 },
  statusBar:   { backgroundColor: C.dark, padding: '12 24', textAlign: 'center' },
  statusText:  { color: '#fff', fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  body:        { padding: '24 40 0' },
  storeRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottom: `1 solid ${C.border}` },
  logo:        { height: 48, maxWidth: 140, objectFit: 'contain', marginRight: 12 },
  storeName:   { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  storeInfo:   { fontSize: 9, color: C.gray, lineHeight: 1.5 },
  twoCol:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: `1 solid ${C.border}` },
  billTo:      { flex: 1 },
  label:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  billName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  billAddr:    { fontSize: 9, color: C.gray },
  metaTable:   { width: 200 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaKey:     { fontSize: 9, color: C.muted, fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right', paddingRight: 8 },
  metaVal:     { fontSize: 9, fontFamily: 'Helvetica-Bold', flex: 1.2, textAlign: 'right' },
  tableHead:   { flexDirection: 'row', backgroundColor: C.dark, padding: '6 8' },
  thText:      { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  tableRow:    { flexDirection: 'row', padding: '6 8', borderBottom: `1 solid ${C.lightGray}` },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tdText:      { fontSize: 9, color: C.text },
  totalsWrap:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totalsInner: { width: 220 },
  totRow:      { flexDirection: 'row', justifyContent: 'space-between', padding: '3 4' },
  totKey:      { fontSize: 10, color: C.gray },
  totVal:      { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  totalDivider:{ borderTop: `2 solid ${C.dark}`, marginTop: 6, paddingTop: 6 },
  grandKey:    { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  grandVal:    { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  taxReg:      { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 6 },
  colId:       { width: '12%' },
  colDate:     { width: '11%' },
  colCleaned:  { width: '11%' },
  colSummary:  { flex: 1 },
  colPrice:    { width: '12%', textAlign: 'right' },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoicePdfData {
  invoiceNumber:      string
  issueDate:          string
  dueDate?:           string | null
  status:             string
  storeName:          string
  storeAddress?:      string | null
  storePhone?:        string | null
  logoUrl?:           string | null
  taxName:            string
  taxId?:             string | null
  recipientName:      string
  recipientAddress1?: string | null
  recipientAddress2?: string | null
  orders: {
    id:           string
    orderNumber:  string
    createdAt:    string
    readyAt?:     string | null
    totalAmount:  number
    paidAmount:   number
    lines:        { name: string; quantity: number; lineTotal: number }[]
  }[]
  subtotalCents: number
  taxCents:      number
  totalCents:    number
  reference:     string
}

// ─── Component (no JSX — uses React.createElement to avoid jsx-dev-runtime) ───

function InvoiceDocument(d: InvoicePdfData) {
  const isPaid = d.status === 'paid'

  const metaRows = [
    ['Invoice #', d.invoiceNumber],
    ['Reference', d.reference],
    ['Date', fmtDate(d.issueDate)],
    ...(d.dueDate ? [['Due Date', fmtDate(d.dueDate)]] : []),
  ].map(([k, v]) =>
    el(View, { key: k, style: s.metaRow },
      el(Text, { style: s.metaKey }, k),
      el(Text, { style: s.metaVal }, v),
    )
  )

  const orderRows = d.orders.map((order, i) => {
    const summary = order.lines.length > 0
      ? order.lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.name}`).join(', ')
      : '—'
    const balance = order.totalAmount - (order.paidAmount ?? 0)
    const rowStyle = i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow
    return el(View, { key: order.id, style: rowStyle },
      el(Text, { style: [s.tdText, s.colId, { fontFamily: 'Helvetica-Bold' }] }, order.orderNumber),
      el(Text, { style: [s.tdText, s.colDate] }, fmtDate(order.createdAt)),
      el(Text, { style: [s.tdText, s.colCleaned] }, order.readyAt ? fmtDate(order.readyAt) : 'N/A'),
      el(Text, { style: [s.tdText, s.colSummary] }, summary),
      el(Text, { style: [s.tdText, s.colPrice] }, fmt(balance)),
    )
  })

  const storeHeader = d.logoUrl
    ? el(Image, { src: d.logoUrl, style: s.logo })
    : el(Text, { style: s.storeName }, d.storeName)

  return el(Document, null,
    el(Page, { size: 'A4', style: s.page },
      // Status bar
      el(View, { style: s.statusBar },
        el(Text, { style: s.statusText }, `INVOICE ${isPaid ? '— PAID' : '— UNPAID'}`)
      ),
      el(View, { style: s.body },
        // Store header
        el(View, { style: s.storeRow },
          el(View, null,
            storeHeader,
            el(Text, { style: s.storeInfo },
              [d.storeAddress, d.storePhone].filter(Boolean).join('\n')
            ),
          ),
        ),
        // Bill to + meta
        el(View, { style: s.twoCol },
          el(View, { style: s.billTo },
            el(Text, { style: s.label }, 'Bill To'),
            el(Text, { style: s.billName }, d.recipientName),
            ...(d.recipientAddress1 ? [el(Text, { style: s.billAddr }, d.recipientAddress1)] : []),
            ...(d.recipientAddress2 ? [el(Text, { style: s.billAddr }, d.recipientAddress2)] : []),
          ),
          el(View, { style: s.metaTable }, ...metaRows),
        ),
        // Orders table header
        el(View, { style: s.tableHead },
          el(Text, { style: [s.thText, s.colId] }, 'Order'),
          el(Text, { style: [s.thText, s.colDate] }, 'Date'),
          el(Text, { style: [s.thText, s.colCleaned] }, 'Cleaned'),
          el(Text, { style: [s.thText, s.colSummary] }, 'Summary'),
          el(Text, { style: [s.thText, s.colPrice] }, 'Price'),
        ),
        // Order rows
        ...orderRows,
        // Totals
        el(View, { style: s.totalsWrap },
          el(View, { style: s.totalsInner },
            ...(d.taxCents > 0 ? [
              el(View, { style: s.totRow },
                el(Text, { style: s.totKey }, 'Subtotal'),
                el(Text, { style: s.totVal }, fmt(d.subtotalCents)),
              ),
              el(View, { style: s.totRow },
                el(Text, { style: s.totKey }, d.taxName),
                el(Text, { style: s.totVal }, fmt(d.taxCents)),
              ),
            ] : []),
            el(View, { style: [s.totRow, s.totalDivider] },
              el(Text, { style: s.grandKey }, 'Total'),
              el(Text, { style: s.grandVal }, fmt(d.totalCents)),
            ),
            ...(d.taxId ? [el(Text, { style: s.taxReg }, `${d.taxName} #: ${d.taxId}`)] : []),
          ),
        ),
      ),
    ),
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function generateInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  const buffer = await renderToBuffer(InvoiceDocument(d))
  return Buffer.from(buffer)
}
