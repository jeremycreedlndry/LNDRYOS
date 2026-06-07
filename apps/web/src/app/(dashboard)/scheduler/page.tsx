'use client'

import { useMemo, useState } from 'react'
import {
  addDays, addWeeks, subWeeks, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, isSameDay, isSameMonth, parseISO,
} from 'date-fns'
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Plus, Settings2, Trash2, Calendar, Copy, RefreshCw, Loader2, X,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type Shift = {
  id: string
  user_id: string
  shift_date: string
  start_time: string
  end_time: string
  notes: string | null
}

type StaffMember = {
  user_id: string
  display_name: string
  role: string
  is_active: boolean
}

type ViewMode = 'week' | 'month'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToHours(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function shiftsOverlap(a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) {
  return a.start_time < b.end_time && a.end_time > b.start_time
}

// ─── Subscribe dialog ─────────────────────────────────────────────────────────

function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const { data: tokenRow, refetch } = trpc.scheduler.getOrCreateToken.useQuery()
  const resetToken = trpc.scheduler.resetToken.useMutation({ onSuccess: () => refetch() })

  const feedUrl   = tokenRow?.token ? `/api/schedule/ics?token=${tokenRow.token}` : ''
  const webcalUrl = feedUrl.replace(/^https?:\/\/[^/]+/, '').replace('http', 'webcal')

  const copy = async (val: string) => {
    await navigator.clipboard.writeText(window.location.origin + val)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Subscribe to your schedule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Add your shifts to Google, Apple, or Outlook. Updates sync automatically.
          </p>

          {!tokenRow ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Calendar feed URL</label>
                <div className="flex gap-2">
                  <input readOnly value={window.location.origin + feedUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none" />
                  <button onClick={() => copy(feedUrl)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">Keep this private — anyone with the link can see your schedule.</p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
                <p className="font-semibold text-gray-700">How to add it</p>
                <p><strong className="text-gray-800">Apple:</strong>{' '}
                  <a href={`webcal://${window.location.host}${feedUrl}`} className="underline">Tap here</a>
                  {' '}or Settings → Calendar → Accounts → Add Subscribed Calendar.
                </p>
                <p><strong className="text-gray-800">Google:</strong>{' '}
                  calendar.google.com → Other calendars → + → From URL → paste link.
                </p>
                <p><strong className="text-gray-800">Outlook:</strong>{' '}
                  Add calendar → Subscribe from web → paste link.
                </p>
                <p className="text-gray-400">Google refreshes every 6–12 hrs. Apple every 15–60 min.</p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-between border-t border-gray-100 px-6 py-4">
          <button onClick={() => resetToken.mutate()} disabled={resetToken.isPending}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Reset link
          </button>
          <button onClick={onClose}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shift dialog (add / edit) ────────────────────────────────────────────────

type ShiftForm = {
  user_id: string
  shift_date: string
  extra_dates: string[]
  start_time: string
  end_time: string
  notes: string
}

function ShiftDialog({
  staff, shifts, editShift, defaultUserId, defaultDate, onClose, onSaved,
}: {
  staff: StaffMember[]
  shifts: Shift[]
  editShift: Shift | null
  defaultUserId?: string
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ShiftForm>({
    user_id:     editShift?.user_id     ?? defaultUserId ?? staff[0]?.user_id ?? '',
    shift_date:  editShift?.shift_date  ?? defaultDate   ?? format(new Date(), 'yyyy-MM-dd'),
    extra_dates: [],
    start_time:  editShift ? editShift.start_time.slice(0, 5) : '08:00',
    end_time:    editShift ? editShift.end_time.slice(0, 5)   : '16:00',
    notes:       editShift?.notes ?? '',
  })

  const upsert = trpc.scheduler.upsertShift.useMutation()

  const hasOverlap = (date: string) => {
    return shifts.some((s) =>
      s.user_id === form.user_id &&
      s.shift_date === date &&
      s.id !== editShift?.id &&
      shiftsOverlap({ start_time: form.start_time, end_time: form.end_time }, s)
    )
  }

  const handleSave = async () => {
    if (!form.user_id || !form.shift_date || !form.start_time || !form.end_time) {
      toast.error('All fields required'); return
    }
    if (form.start_time >= form.end_time) {
      toast.error('End time must be after start time'); return
    }

    const dates = editShift
      ? [form.shift_date]
      : [...new Set([form.shift_date, ...form.extra_dates].filter(Boolean))]

    for (const d of dates) {
      if (hasOverlap(d)) {
        toast.error(`Overlapping shift on ${format(parseISO(d), 'MMM d')}`); return
      }
    }

    await upsert.mutateAsync({
      id:          editShift?.id,
      user_id:     form.user_id,
      shift_dates: dates,
      start_time:  form.start_time,
      end_time:    form.end_time,
      notes:       form.notes.trim() || null,
    })
    toast.success(editShift ? 'Shift updated' : `${dates.length} shift${dates.length === 1 ? '' : 's'} added`)
    onSaved()
    onClose()
  }

  const set = (k: keyof ShiftForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{editShift ? 'Edit shift' : 'Add shift'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Employee */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</label>
            <select value={form.user_id} onChange={(e) => set('user_id', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
            </select>
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
              <input type="date" value={form.shift_date} onChange={(e) => set('shift_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Start</label>
              <input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">End</label>
              <input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes (optional)</label>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)}
              placeholder="e.g. opening shift"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Extra dates (create only) */}
          {!editShift && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional days</label>
                <button onClick={() => {
                  const last = form.extra_dates[form.extra_dates.length - 1] || form.shift_date
                  const next = last ? format(addDays(parseISO(last), 1), 'yyyy-MM-dd') : ''
                  set('extra_dates', [...form.extra_dates, next])
                }} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  <Plus className="h-3.5 w-3.5" /> Add day
                </button>
              </div>
              {form.extra_dates.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input type="date" value={d}
                    onChange={(e) => set('extra_dates', form.extra_dates.map((x, j) => j === i ? e.target.value : x))}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <button onClick={() => set('extra_dates', form.extra_dates.filter((_, j) => j !== i))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-gray-500 hover:bg-gray-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={upsert.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editShift ? 'Save changes' : 'Save shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Swap dialog ──────────────────────────────────────────────────────────────

function SwapDialog({
  shift, staff, shifts, canEdit, onClose, onSaved,
}: {
  shift: Shift
  staff: StaffMember[]
  shifts: Shift[]
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [targetUserId, setTargetUserId] = useState(shift.user_id)
  const [editing, setEditing] = useState(false)
  const swap   = trpc.scheduler.swapShift.useMutation()
  const del    = trpc.scheduler.deleteShift.useMutation()

  const handleSwap = async () => {
    if (targetUserId === shift.user_id) { onClose(); return }
    const overlap = shifts.some((s) =>
      s.user_id === targetUserId &&
      s.shift_date === shift.shift_date &&
      s.id !== shift.id &&
      shiftsOverlap(shift, s)
    )
    if (overlap) { toast.error('That employee already has an overlapping shift'); return }
    await swap.mutateAsync({ id: shift.id, new_user_id: targetUserId })
    toast.success('Shift reassigned')
    onSaved(); onClose()
  }

  const handleDelete = async () => {
    await del.mutateAsync({ id: shift.id })
    toast.success('Shift deleted')
    onSaved(); onClose()
  }

  if (editing) {
    return (
      <ShiftDialog
        staff={staff} shifts={shifts} editShift={shift}
        onClose={() => setEditing(false)} onSaved={() => { onSaved(); onClose() }}
      />
    )
  }

  const currentName = staff.find((s) => s.user_id === shift.user_id)?.display_name ?? 'Unknown'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Shift options</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Shift summary */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <p className="font-semibold text-gray-900">{format(parseISO(shift.shift_date), 'EEE, MMM d')}</p>
            <p className="text-gray-500">{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)} · {currentName}</p>
          </div>

          {canEdit && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Move shift to</label>
              <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {canEdit && <>
            <button onClick={() => setEditing(true)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Edit
            </button>
            <button onClick={handleDelete} disabled={del.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
            <button onClick={handleSwap} disabled={swap.isPending || targetUserId === shift.user_id}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {swap.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />} Swap
            </button>
          </>}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [viewMode,   setViewMode]   = useState<ViewMode>('week')
  const [weekStart,  setWeekStart]  = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [addDialog, setAddDialog]   = useState<{ userId?: string; date?: string } | null>(null)
  const [swapShift, setSwapShift]   = useState<Shift | null>(null)

  // Role
  const { data: myRole } = trpc.staff.myRole.useQuery(undefined, { staleTime: 60_000 })
  const canEdit = myRole?.role === 'owner' || myRole?.role === 'manager'

  // Staff (active only)
  const { data: allStaff = [] } = trpc.staff.list.useQuery()
  const staff = useMemo(
    () => (allStaff as StaffMember[])
      .filter((s) => s.is_active)
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [allStaff]
  )

  // Date ranges
  const monthStart   = useMemo(() => startOfMonth(weekStart), [weekStart])
  const monthEnd     = useMemo(() => endOfMonth(weekStart),   [weekStart])
  const weekDays     = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const monthDays    = useMemo(() => eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end:   endOfWeek(monthEnd,     { weekStartsOn: 1 }),
  }), [monthStart, monthEnd])

  const queryFrom = format(startOfWeek(monthStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const queryTo   = format(endOfWeek(monthEnd,     { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data: shifts = [], refetch } = trpc.scheduler.listShifts.useQuery(
    { date_from: queryFrom, date_to: queryTo },
    { staleTime: 30_000 }
  )

  const shiftsTyped = shifts as Shift[]

  // Helpers
  const shiftsForCell = (userId: string, day: Date) =>
    shiftsTyped.filter((s) => s.user_id === userId && isSameDay(parseISO(s.shift_date), day))

  const shiftsForDay = (day: Date) =>
    shiftsTyped.filter((s) => isSameDay(parseISO(s.shift_date), day))

  const weekHours = (userId: string) => {
    const mins = shiftsTyped
      .filter((s) => s.user_id === userId && weekDays.some((d) => isSameDay(parseISO(s.shift_date), d)))
      .reduce((total, s) => total + timeToMinutes(s.end_time) - timeToMinutes(s.start_time), 0)
    return minutesToHours(mins)
  }

  const stats = useMemo(() => {
    const weekShifts = shiftsTyped.filter((s) => weekDays.some((d) => isSameDay(parseISO(s.shift_date), d)))
    return {
      shifts:    weekShifts.length,
      scheduled: new Set(weekShifts.map((s) => s.user_id)).size,
      week:      format(weekStart, 'MMM d'),
    }
  }, [shiftsTyped, weekDays, weekStart])

  const navigate = (dir: 1 | -1) => setWeekStart((w) => dir === 1 ? addWeeks(w, 1) : subWeeks(w, 1))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-gray-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Scheduler</h1>
              <p className="text-sm text-gray-500">
                {canEdit ? 'View and manage team shifts.' : 'View team shifts.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSubscribe(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Calendar className="h-4 w-4" /> Subscribe
            </button>
            {canEdit && (
              <button onClick={() => setAddDialog({})}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Add shift
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Shifts this week',    value: stats.shifts },
            { label: 'Scheduled staff',     value: stats.scheduled },
            { label: 'Week of',             value: stats.week },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Calendar nav */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {viewMode === 'week'
                  ? `${format(weekStart, 'MMM d')} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
                  : format(weekStart, 'MMMM yyyy')}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {viewMode === 'week' ? 'Weekly staffing board' : 'Monthly overview'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['week', 'month'] as ViewMode[]).map((v) => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors capitalize',
                      viewMode === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50')}>
                    {v}
                  </button>
                ))}
              </div>
              <button onClick={() => navigate(-1)}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                Today
              </button>
              <button onClick={() => navigate(1)}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Week view ── */}
          {viewMode === 'week' && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px] grid grid-cols-[180px_repeat(7,minmax(0,1fr))] gap-px bg-gray-100">

                {/* Header row */}
                <div className="bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Team member</p>
                </div>
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className={cn(
                    'bg-white px-3 py-3 text-center',
                    isSameDay(day, new Date()) && 'bg-brand-50'
                  )}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{format(day, 'EEE')}</p>
                    <p className={cn('text-sm font-bold', isSameDay(day, new Date()) ? 'text-brand-700' : 'text-gray-900')}>
                      {format(day, 'd')}
                    </p>
                  </div>
                ))}

                {/* Staff rows */}
                {staff.map((member) => (
                  <div key={member.user_id} className="contents">
                    {/* Name column */}
                    <div className="bg-white px-4 py-3 space-y-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{member.display_name}</p>
                      <p className="text-[10px] text-gray-400">{weekHours(member.user_id)} this week</p>
                      {canEdit && (
                        <button onClick={() => setAddDialog({ userId: member.user_id })}
                          className="flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:text-brand-700">
                          <Plus className="h-3 w-3" /> Shift
                        </button>
                      )}
                    </div>

                    {/* Day cells */}
                    {weekDays.map((day) => {
                      const cell = shiftsForCell(member.user_id, day)
                      return (
                        <div key={day.toISOString()} className={cn(
                          'min-h-[120px] bg-white p-2 flex flex-col gap-1.5',
                          isSameDay(day, new Date()) && 'bg-brand-50/40'
                        )}>
                          {cell.map((s) => (
                            <button key={s.id} onClick={() => setSwapShift(s)}
                              className="w-full text-left rounded-lg border border-gray-200 bg-white px-2 py-1.5 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                              <p className="text-xs font-semibold text-gray-900">
                                {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                              </p>
                              {s.notes && <p className="text-[10px] text-gray-400 truncate">{s.notes}</p>}
                            </button>
                          ))}
                          {canEdit && (
                            <button onClick={() => setAddDialog({ userId: member.user_id, date: format(day, 'yyyy-MM-dd') })}
                              className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 py-2 text-[10px] font-medium text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors">
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}

                {staff.length === 0 && (
                  <div className="col-span-8 bg-white px-6 py-10 text-center text-sm text-gray-400">
                    No active staff yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Month view ── */}
          {viewMode === 'month' && (
            <div className="overflow-x-auto">
              <div className="min-w-[600px] grid grid-cols-7 gap-px bg-gray-100">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="bg-white px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {d}
                  </div>
                ))}
                {monthDays.map((day) => {
                  const dayShifts = shiftsForDay(day)
                  const isToday   = isSameDay(day, new Date())
                  const inMonth   = isSameMonth(day, monthStart)
                  return (
                    <div key={day.toISOString()} className={cn(
                      'min-h-[110px] bg-white p-2',
                      !inMonth && 'bg-gray-50',
                      isToday && 'ring-1 ring-inset ring-brand-400'
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-semibold',
                          isToday ? 'text-brand-700' : inMonth ? 'text-gray-900' : 'text-gray-300')}>
                          {format(day, 'd')}
                        </span>
                        {dayShifts.length > 0 && (
                          <span className="text-[9px] text-gray-400">{dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayShifts.length === 0 ? (
                          <div className="rounded border border-dashed border-gray-100 py-2 text-center text-[9px] text-gray-300">—</div>
                        ) : dayShifts.slice(0, 3).map((s) => {
                          const name = staff.find((m) => m.user_id === s.user_id)?.display_name ?? '?'
                          return (
                            <button key={s.id} onClick={() => setSwapShift(s)}
                              className="w-full text-left rounded bg-brand-50 px-1.5 py-1 text-[9px] hover:bg-brand-100 transition-colors truncate">
                              <span className="font-semibold text-brand-800">{s.start_time.slice(0, 5)}</span>
                              {' '}<span className="text-brand-600">{name.split(' ')[0]}</span>
                            </button>
                          )
                        })}
                        {dayShifts.length > 3 && (
                          <p className="text-[9px] text-gray-400 pl-1">+{dayShifts.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {!canEdit && (
          <p className="text-center text-xs text-gray-400">
            View-only — contact a manager to make schedule changes.
          </p>
        )}
      </div>

      {/* Dialogs */}
      {showSubscribe && <SubscribeDialog onClose={() => setShowSubscribe(false)} />}

      {addDialog && (
        <ShiftDialog
          staff={staff}
          shifts={shiftsTyped}
          editShift={null}
          defaultUserId={addDialog.userId}
          defaultDate={addDialog.date}
          onClose={() => setAddDialog(null)}
          onSaved={() => refetch()}
        />
      )}

      {swapShift && (
        <SwapDialog
          shift={swapShift}
          staff={staff}
          shifts={shiftsTyped}
          canEdit={canEdit}
          onClose={() => setSwapShift(null)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  )
}
