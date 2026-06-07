import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@laundry/db'

// ─── ICS helpers ──────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, '0') }

/** Local floating time (no Z) so calendar apps show it as wall-clock time. */
function toICSDateTime(date: string, time: string) {
  const [y, m, d] = date.split('-')
  const [hh, mm]  = time.split(':')
  return `${y}${m}${d}T${pad(Number(hh))}${pad(Number(mm))}00`
}

function toICSStamp(d: Date) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  )
}

function escapeICS(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return new NextResponse('Missing token', { status: 400 })

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve token → user + tenant
  const { data: tokenRow } = await service
    .from('schedule_tokens')
    .select('user_id, tenant_id')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return new NextResponse('Invalid token', { status: 404 })

  const { user_id, tenant_id } = tokenRow

  // Fetch member display name and tenant name
  const [{ data: member }, { data: tenant }] = await Promise.all([
    service.from('tenant_members').select('display_name').eq('tenant_id', tenant_id).eq('user_id', user_id).maybeSingle(),
    service.from('tenants').select('name').eq('id', tenant_id).maybeSingle(),
  ])

  const name      = member?.display_name || 'Employee'
  const storeName = tenant?.name         || 'LNDRYOS'

  // Shifts: 60 days back → 365 days forward
  const today = new Date()
  const from  = new Date(today); from.setDate(from.getDate() - 60)
  const to    = new Date(today); to.setDate(to.getDate() + 365)

  const { data: shifts } = await service
    .from('employee_shifts')
    .select('id, shift_date, start_time, end_time, notes, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('user_id', user_id)
    .gte('shift_date', from.toISOString().slice(0, 10))
    .lte('shift_date', to.toISOString().slice(0, 10))
    .order('shift_date', { ascending: true })

  const stamp = toICSStamp(new Date())

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escapeICS(storeName)}//Scheduler//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(`${name} – Work Schedule`)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const s of shifts ?? []) {
    const summary     = 'Shift'
    const description = s.notes ? escapeICS(s.notes) : ''
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@lndryos-scheduler`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toICSDateTime(s.shift_date, s.start_time)}`,
      `DTEND:${toICSDateTime(s.shift_date, s.end_time)}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, max-age=0',
      'Content-Disposition': 'inline; filename="schedule.ics"',
    },
  })
}
