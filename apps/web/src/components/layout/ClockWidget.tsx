'use client'

import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'

function elapsed(since: string): string {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function ClockWidget() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.staff.myStatus.useQuery(undefined, { refetchInterval: 60000 })

  const clockIn = trpc.staff.clockIn.useMutation({
    onSuccess: () => { utils.staff.myStatus.invalidate(); toast.success('Clocked in') },
    onError: (e) => toast.error(e.message),
  })
  const clockOut = trpc.staff.clockOut.useMutation({
    onSuccess: () => { utils.staff.myStatus.invalidate(); toast.success('Clocked out') },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return null

  const isClockedIn = data?.clocked_in
  const isPending = clockIn.isPending || clockOut.isPending

  return (
    <div className="border-t border-gray-200 px-3 py-3">
      <button
        onClick={() => isClockedIn ? clockOut.mutate() : clockIn.mutate()}
        disabled={isPending}
        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          isClockedIn
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${isClockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
        <span className="flex-1 text-left">
          {isClockedIn ? 'Clocked in' : 'Clocked out'}
        </span>
        {isClockedIn && data?.entry && (
          <span className="text-green-500 tabular-nums">{elapsed(data.entry.clocked_in_at)}</span>
        )}
      </button>
    </div>
  )
}
