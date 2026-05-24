import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

// Nayax sends transaction events via Spark API webhooks or SQS.
// Field names vary by integration — we normalise both camelCase and snake_case.
function extractFields(body: Record<string, unknown>) {
  const deviceId =
    (body.DeviceId ?? body.device_id ?? body.MachineId ?? body.machine_id ?? '') as string
  const cardId =
    (body.CardId ?? body.card_id ?? body.CardNumber ?? body.card_number ?? '') as string
  const tappedAt =
    (body.TransactionDate ?? body.transaction_date ?? body.Timestamp ?? body.timestamp ?? new Date().toISOString()) as string

  return { deviceId: String(deviceId).trim(), cardId: String(cardId).trim(), tappedAt }
}

export async function POST(req: NextRequest) {
  // Optional: verify a shared secret header from Nayax
  const secret = process.env.NAYAX_WEBHOOK_SECRET
  if (secret) {
    const provided = req.headers.get('x-nayax-secret') ?? req.headers.get('authorization')
    if (provided !== secret && provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { deviceId, cardId, tappedAt } = extractFields(body)

  if (!deviceId || !cardId) {
    return NextResponse.json({ error: 'Missing device_id or card_id' }, { status: 400 })
  }

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up equipment by nayax_device_id
  const { data: equipment } = await service
    .from('equipment')
    .select('id, tenant_id')
    .eq('nayax_device_id', deviceId)
    .maybeSingle()

  // Look up staff member by nayax_card_id
  const { data: member } = await service
    .from('tenant_members')
    .select('user_id, tenant_id')
    .eq('nayax_card_id', cardId)
    .maybeSingle()

  // Look up customer gift card by NFC UID (nfc_uid = raw CardId from tap)
  const { data: giftCard } = await service
    .from('customer_gift_cards')
    .select('id, tenant_id, customer_id, balance_cents, status')
    .eq('nfc_uid', cardId)
    .maybeSingle()

  // We need at least one side to resolve the tenant
  const tenantId = equipment?.tenant_id ?? member?.tenant_id ?? giftCard?.tenant_id
  if (!tenantId) {
    // Unknown device and card — log and acknowledge (don't error, Nayax will retry)
    console.warn('[nayax] Unrecognised device_id or card_id', { deviceId, cardId })
    return NextResponse.json({ received: true })
  }

  // Insert the pending tap — Supabase Realtime will push it to the employee's browser
  const { error } = await service.from('pending_taps').insert({
    tenant_id: tenantId,
    equipment_id: equipment?.id ?? null,
    employee_user_id: member?.user_id ?? null,
    gift_card_id: giftCard?.id ?? null,
    nayax_device_id: deviceId,
    nayax_card_id: cardId,
    tapped_at: tappedAt,
  })

  if (error) {
    console.error('[nayax] Failed to insert pending_tap', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
