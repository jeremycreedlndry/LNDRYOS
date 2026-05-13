const QUO_API_URL = 'https://api.openphone.com/v1/messages'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logMessage(supabase: any, msg: {
  tenant_id: string
  customer_id: string
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  body: string
  subject?: string | null
  from_address?: string | null
  to_address?: string | null
  staff_user_id?: string | null
}) {
  await supabase.from('messages').insert({
    ...msg,
    read_at: msg.direction === 'outbound' ? new Date().toISOString() : null,
  })
}

export async function sendSms(to: string, message: string): Promise<void> {
  const apiKey = process.env.QUO_API_KEY
  const from = process.env.QUO_FROM_NUMBER

  if (!apiKey || !from) {
    console.log(`[sms] No QUO credentials — would send to ${to}: ${message}`)
    return
  }

  // Normalise to E.164 (+1xxxxxxxxxx)
  const toFormatted = to.replace(/\D/g, '')
  const toE164 = toFormatted.startsWith('1') ? `+${toFormatted}` : `+1${toFormatted}`

  const res = await fetch(QUO_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: message, from, to: [toE164] }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[sms] Send error ${res.status}:`, body)
  }
}

// ─── Message templates ────────────────────────────────────────────────────────

export function orderCreatedSms(storeName: string, orderNumber: string): string {
  return `${storeName}: Your order #${orderNumber} has been received and is now being cleaned. We'll text you when it's ready!`
}

export function orderReadySms(storeName: string, orderNumber: string, paymentLink?: string): string {
  if (paymentLink) {
    return `${storeName}: Your laundry is ready for pickup! Order #${orderNumber}. Pay online: ${paymentLink}`
  }
  return `${storeName}: Your laundry is ready for pickup! Order #${orderNumber}.`
}

export function pickupReminderSms(storeName: string, pickupDate: string, timeWindow?: string | null): string {
  const time = timeWindow ? ` between ${timeWindow}` : ''
  return `${storeName}: Reminder — we'll be picking up your laundry tomorrow, ${pickupDate}${time}. Please have it ready.`
}
