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

// ─── Clock-out + sign-out confirmation modal ──────────────────────────────────

function SignOutModal({
  isClockedIn,
  onClockOutAndSignOut,
  onSignOutOnly,
  onCancel,
  isPending,
}: {
  isClockedIn: boolean
  onClockOutAndSignOut: () => void
  onSignOutOnly: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Sign out</h2>
        {isClockedIn ? (
          <p className="text-sm text-gray-600 mb-5">
            You&apos;re still clocked in. Would you like to clock out before signing out?
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-5">Are you sure you want to sign out?</p>
        )}

        <div className="flex flex-col gap-2">
          {isClockedIn && (
            <button
              onClick={onClockOutAndSignOut}
              disabled={isPending}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {isPending ? 'Clocking out…' : 'Clock out & sign out'}
            </button>
          )}
          <button
            onClick={onSignOutOnly}
            disabled={isPending}
            className={cn(
              'w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40',
              isClockedIn
                ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                : 'bg-brand-600 text-white hover:bg-brand-700',
            )}
          >
            {isClockedIn ? 'Sign out without clocking out' : 'Sign out'}
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Live clock widget (staff only) ──────────────────────────────────────────

function ClockWidget({ role }: { role: string }) {
  const utils = trpc.useUtils()
  const [tick, setTick] = useState(0)

  const { data } = trpc.staff.myStatus.useQuery(undefined, {
    enabled: role === 'staff',
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

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

  if (role !== 'staff' || !data) return null

  if (data.clocked_in && data.entry) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
          {tick >= 0 && formatElapsed(data.entry.clocked_in_at)} on shift
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

// ─── TopBar ───────────────────────────────────────────────────────────────────

export function TopBar({ role = 'staff' }: { role?: string }) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const utils = trpc.useUtils()

  const [showSignOutModal, setShowSignOutModal] = useState(false)

  // Only fetch clock status when the modal is open (to keep it fresh)
  const { data: clockStatus } = trpc.staff.myStatus.useQuery(undefined, {
    enabled: showSignOutModal && role === 'staff',
    staleTime: 0,
  })

  const clockOut = trpc.staff.clockOut.useMutation({
    onError: (e) => toast.error(e.message),
  })

  const doSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSignOutClick = () => {
    if (role === 'staff') {
      setShowSignOutModal(true)
    } else {
      doSignOut()
    }
  }

  const handleClockOutAndSignOut = async () => {
    await clockOut.mutateAsync()
    utils.staff.myStatus.invalidate()
    await doSignOut()
  }

  const isClockedIn = role === 'staff' && (clockStatus?.clocked_in ?? false)

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
        <div />
        <div className="flex items-center gap-3">
          <ClockWidget role={role} />
          <button
            onClick={handleSignOutClick}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {showSignOutModal && (
        <SignOutModal
          isClockedIn={isClockedIn}
          onClockOutAndSignOut={handleClockOutAndSignOut}
          onSignOutOnly={doSignOut}
          onCancel={() => setShowSignOutModal(false)}
          isPending={clockOut.isPending}
        />
      )}
    </>
  )
}
