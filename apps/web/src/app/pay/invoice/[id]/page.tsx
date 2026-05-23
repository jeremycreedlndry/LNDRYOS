'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CreditCard, CheckCircle, AlertCircle, FileText, Mail } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoicePayData {
  id:              string
  invoice_number:  string
  status:          string
  issue_date:      string
  due_date?:       string | null
  subtotal_cents:  number
  tax_cents:       number
  total_cents:     number
  notes?:          string | null
  store_name:      string
  etransfer_email?: string | null
  store_phone?:    string | null
  already_paid?:   boolean
  customer?:       { first_name: string; last_name: string; email: string } | null
  business_account?: { name: string; email: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

function useHelcimScript() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (document.getElementById('helcim-pay-script')) { setReady(true); return }
    const s = document.createElement('script')
    s.id  = 'helcim-pay-script'
    s.src = 'https://secure.helcim.app/helcim-pay/services/start.js'
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])
  return ready
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicePayPage() {
  const { id }          = useParams<{ id: string }>()
  const helcimReady     = useHelcimScript()

  const [invoice,  setInvoice]  = useState<InvoicePayData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [paid,     setPaid]     = useState(false)
  const [paying,   setPaying]   = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const checkoutTokenRef = useRef<string | null>(null)

  // ── Load invoice ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setError('Invalid payment link'); setLoading(false); return }

    fetch(`/api/pay/invoice-details?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else {
          setInvoice(data)
          if (data.already_paid || data.status === 'paid') setPaid(true)
        }
      })
      .catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  // ── HelcimPay.js message listener ───────────────────────────────────────────
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const ct = checkoutTokenRef.current
      if (!ct || event.data?.eventName !== `helcim-pay-js-${ct}`) return

      const { eventStatus } = event.data
      if (eventStatus === 'ABORTED') {
        setPaying(false); setPayError('Payment cancelled.'); checkoutTokenRef.current = null; return
      }
      if (eventStatus === 'SUCCESS') {
        // Extract transaction details from Helcim event message
        const txn           = event.data.eventMessage ?? {}
        const transactionId = txn.transactionId ?? txn.transaction?.transactionId
        const amountCents   = txn.amount ? Math.round(txn.amount * 100) : invoice?.total_cents

        // Confirm server-side
        try {
          const res = await fetch('/api/pay/helcim-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoice_id:     id,
              transaction_id: transactionId,
              amount_cents:   amountCents,
            }),
          })
          if (res.ok) {
            setPaid(true)
          } else {
            setPayError('Payment received but confirmation failed — please contact us.')
          }
        } catch {
          setPayError('Network error during confirmation.')
        } finally {
          setPaying(false)
          checkoutTokenRef.current = null
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [id, invoice?.total_cents])

  // ── Pay by card ─────────────────────────────────────────────────────────────
  const handlePayByCard = async () => {
    if (!invoice || !helcimReady) return
    setPaying(true); setPayError(null)
    try {
      const res = await fetch('/api/pay/helcim-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: invoice.total_cents,
          invoice_number: invoice.invoice_number,
          invoice_id: id,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.checkoutToken) throw new Error(data.error ?? 'Payment initialization failed')
      checkoutTokenRef.current = data.checkoutToken
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).appendHelcimPayIframe(data.checkoutToken)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment initialization failed')
      setPaying(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading invoice…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-base font-semibold text-gray-900">{error}</p>
        </div>
      </div>
    )
  }

  if (paid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-1">Invoice Paid</h2>
          <p className="text-sm text-gray-500">
            {invoice?.invoice_number} — {invoice ? fmt(invoice.total_cents) : ''} has been received. Thank you!
          </p>
          {invoice?.store_phone && (
            <p className="text-xs text-gray-400 mt-4">Questions? Call {invoice.store_phone}</p>
          )}
        </div>
      </div>
    )
  }

  if (!invoice) return null

  const recipientName = invoice.business_account?.name
    ?? (invoice.customer ? `${invoice.customer.first_name} ${invoice.customer.last_name}` : null)

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <FileText className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{invoice.store_name}</p>
              <h1 className="text-lg font-bold text-gray-900">{invoice.invoice_number}</h1>
            </div>
          </div>

          {recipientName && (
            <p className="text-sm text-gray-600 mb-3">Bill to: <strong>{recipientName}</strong></p>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Issued {fmtDate(invoice.issue_date)}</span>
            {invoice.due_date && (
              <span className="font-semibold text-red-600">Due {fmtDate(invoice.due_date)}</span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
            {invoice.tax_cents > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>{fmt(invoice.subtotal_cents)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Tax</span><span>{fmt(invoice.tax_cents)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
              <span>Total Due</span><span>{fmt(invoice.total_cents)}</span>
            </div>
          </div>

          {invoice.notes && (
            <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">{invoice.notes}</p>
          )}
        </div>

        {/* Payment options header */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Choose how to pay</p>

        {/* CC payment */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-1">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Pay by Credit Card</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">Visa, Mastercard, and Amex accepted. Secure payment powered by Helcim.</p>

          {payError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {payError}
            </div>
          )}

          <button
            onClick={handlePayByCard}
            disabled={paying || !helcimReady}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {paying ? 'Opening payment form…' : `Pay ${fmt(invoice.total_cents)} by Card`}
          </button>
        </div>

        {/* e-Transfer */}
        {invoice.etransfer_email && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6">
            <div className="flex items-center gap-3 mb-1">
              <Mail className="h-5 w-5 text-green-600" />
              <h2 className="text-base font-semibold text-gray-900">Pay by Interac e-Transfer</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Send the exact amount to the email below. Include the invoice number as your reference.</p>
            <div className="space-y-3">
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Send to</p>
                <p className="text-base font-bold text-green-900 select-all">{invoice.etransfer_email}</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Amount</p>
                <p className="text-base font-bold text-green-900">{fmt(invoice.total_cents)}</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Reference / Message</p>
                <p className="text-base font-bold text-green-900 select-all">{invoice.invoice_number}</p>
              </div>
            </div>
          </div>
        )}

        {invoice.store_phone && (
          <p className="text-center text-xs text-gray-400 pb-4">
            Questions? Call {invoice.store_phone}
          </p>
        )}
      </div>
    </div>
  )
}
