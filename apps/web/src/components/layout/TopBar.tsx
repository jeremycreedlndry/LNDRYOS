'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { LogOut, Clock, LogIn } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

function formatElapsed(sinceIso: string): string {
  const ms = Date.now() - new Date(sinceIso).getTime()
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function ClockWidget({ role }: { role: string }) {
  const utils = trpc.useUtils()
  const [tick, setTick] = useState(0)

  const { data } = trpc.staff.myStatus.useQuery(undefined, {
    enabled: role === 'staff',
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // Tick every minute to refresh the elapsed display
  useEffect(() => {
    if (!data?.clocked_in) return
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [data?.clocked_in])

  const clockOut = trpc.staff.clockOut.useMutation({
    onSuccess: () => {
      utils.staff.myStatus.invalidate()
      toast.success('Clocked out — see you next time!')
    },
    onError: (e) => toast.error(e.message),
  })

  const clockIn = trpc.staff.clockIn.useMutation({
    onSuccess: () => {
      utils.staff.myStatus.invalidate()
      toast.success('Clocked in!')
    },
    onError: (e) => toast.error(e.message),
  })

  if (role !== 'staff') return null
  if (!data) return null

  if (data.clocked_in && data.entry) {
    return (
      <div className="flex items-center gap-2">
        {/* Live elapsed timer */}
        <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {formatElapsed(data.entry.clocked_in_at)} on shift
        </span>
        <button
          onClick={() => clockOut.mutate()}
          disabled={clockOut.isPending}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
            clockOut.isPending
              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-red-200 text-red-600 hover:bg-red-50',
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          {clockOut.isPending ? 'Clocking out…' : 'Clock Out'}
        </button>
      </div>
    )
  }

  // Not clocked in — show a subtle clock-in option (shouldn't normally appear
  // since ClockInGate blocks the UI, but good fallback)
  return (
    <button
      onClick={() => clockIn.mutate()}
      disabled={clockIn.isPending}
      className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
    >
      <LogIn className="h-3.5 w-3.5" />
      {clockIn.isPending ? 'Clocking in…' : 'Clock In'}
    </button>
  )
}

export function TopBar({ role = 'staff' }: { role?: string }) {
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <ClockWidget role={role} />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
