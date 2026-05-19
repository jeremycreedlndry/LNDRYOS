/**
 * Helcim webhook handler
 * https://devdocs.helcim.com/docs/webhooks
 *
 * Helcim signs webhooks with HMAC-SHA256.
 * Set HELCIM_WEBHOOK_TOKEN in env to your verifier token from the Helcim dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const webhookId  = req.headers.get('webhook-id')        ?? ''
  const timestamp  = req.headers.get('webhook-timestamp') ?? ''
  const signature  = req.headers.get('webhook-signature') ?? ''
  const body       = await req.text()

  // Verify signature if token is configured
  const verifierToken = process.env.HELCIM_WEBHOOK_TOKEN
  if (verifierToken) {
    try {
      const secret       = Buffer.from(verifierToken, 'base64')
      const signedContent = `${webhookId}.${timestamp}.${body}`
      const expected     = crypto.createHmac('sha256', secret).update(signedContent).digest('hex')
      if (expected !== signature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
    }
  }

  // Parse event
  let event: Record<string, unknown>
  try { event = JSON.parse(body) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[helcim webhook]', event['event-type'], event.transactionId)

  // For now, we handle payment confirmation in helcim-confirm (client-side post-payment).
  // This webhook acts as a backup / audit trail.
  // Future: reconcile any orders where client-side confirm failed.

  return NextResponse.json({ received: true })
}
