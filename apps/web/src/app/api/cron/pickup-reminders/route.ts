import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'
import { sendEmail, pickupReminderEmail } from '@laundry/api/lib/email'
import { sendSms, pickupReminderSms } from '@laundry/api/lib/sms'

export async function GET(req: NextRequest) {
  // Accept x-cron-secret header, query param, or Vercel's Authorization: Bearer header
  const secret = req.headers.get('x-cron-secret')
    ?? req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find all pickup stops scheduled for tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: stops, error } = await supabase
    .from('pickup_stops')
    .select(`
      id, scheduled_date, time_start, time_end, tenant_id,
      customer:customers(id, first_name, last_name, email, phone, notification_preference, notification_topics),
      tenant:tenants(name, settings)
    `)
    .eq('scheduled_date', tomorrowStr)
    .eq('type', 'pickup')
    .eq('status', 'pending')

  if (error) {
    console.error('[cron/pickup-reminders] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const stop of stops ?? []) {
    const customer = stop.customer as unknown as { id: string; first_name: string; last_name: string; email?: string | null; phone?: string | null; notification_preference?: string; notification_topics?: Record<string, boolean> } | null
    const pref = customer?.notification_preference ?? 'sms_email'
    const topics = customer?.notification_topics ?? {}
    if (!customer || pref === 'none' || topics.pickup_reminder === false) { skipped++; continue }

    const tenant = stop.tenant as unknown as { name: string; settings?: Record<string, unknown> } | null
    const storeName = tenant?.name ?? 'Laundry'
    const storePhone = (tenant?.settings?.phone as string | undefined) ?? null

    const pickupDate = tomorrow.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })

    let timeWindow: string | null = null
    if (stop.time_start && stop.time_end) {
      const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        const ampm = h >= 12 ? 'pm' : 'am'
        const h12 = h % 12 || 12
        return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
      }
      timeWindow = `${fmt(stop.time_start)} – ${fmt(stop.time_end)}`
    }

    if ((pref === 'email' || pref === 'sms_email') && customer.email) {
      const { subject, html } = pickupReminderEmail({
        storeName,
        storePhone,
        customerName: `${customer.first_name} ${customer.last_name}`,
        pickupDate,
        timeWindow,
      })
      await sendEmail({ to: customer.email, subject, html })
    }

    if ((pref === 'sms' || pref === 'sms_email') && customer.phone) {
      await sendSms(customer.phone, pickupReminderSms(storeName, pickupDate, timeWindow))
    }

    sent++
  }

  return NextResponse.json({ date: tomorrowStr, sent, skipped })
}
