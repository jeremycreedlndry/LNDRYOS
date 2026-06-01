'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ─── Clock-in modal ───────────────────────────────────────────────────────────

function ClockInModal({ displayName, onClocked }: { displayName: string; onClocked: () => void }) {
  const clockIn = trpc.staff.clockIn.useMutation({
    onSuccess: () => { toast.success('Clocked in — have a great shift!'); onClocked() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-brand-600 px-6 py-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <Clock className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">
            Welcome{displayName ? `, ${displayName.split(' ')[0]}` : ''}!
          </h2>
          <p className="mt-1 text-sm text-brand-100">Please clock in to start your shift.</p>
        </div>

        <div className="px-6 py-6">
          <p className="text-center text-sm text-gray-500 mb-5">
            {new Date().toLocaleString('en-CA', {
              weekday: 'long', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit', hour12: true,
            })}
          </p>

          <button
            onClick={() => clockIn.mutate()}
            disabled={clockIn.isPending}
            className={cn(
              'w-full rounded-xl py-3 text-base font-semibold text-white transition-colors',
              clockIn.isPending
                ? 'bg-brand-400 cursor-not-allowed'
                : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {clockIn.isPending ? 'Clocking in…' : 'Clock In'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Gate — only renders the modal if staff is not yet clocked in ─────────────

export function ClockInGate({ role, displayName }: { role: string; displayName: string }) {
  const [dismissed, setDismissed] = useState(false)

  // Only relevant for staff (not owner / manager)
  const isStaff = role === 'staff'

  const { data, isLoading } = trpc.staff.myStatus.useQuery(undefined, {
    enabled: isStaff,
    // Check once on mount — no need to poll
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // Not staff, or still loading, or already clocked in, or dismissed after clocking in
  if (!isStaff || isLoading || data?.clocked_in || dismissed) return null

  return <ClockInModal displayName={displayName} onClocked={() => setDismissed(true)} />
}
