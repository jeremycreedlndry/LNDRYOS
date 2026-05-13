'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-client'
import { trpc } from '@/lib/trpc'
import { TapDialog } from './TapDialog'

interface TapInfo {
  id: string
  equipment: { id: string; name: string; type: string } | null
  employeeName: string
  tapped_at: string
}

interface Props {
  userId: string
  tenantId: string
}

export function NayaxTapListener({ userId, tenantId }: Props) {
  const [pendingTap, setPendingTap] = useState<TapInfo | null>(null)
  const { data: equipment = [] } = trpc.equipment.list.useQuery(undefined, { staleTime: 60_000 })
  const { data: staff = [] } = trpc.nayax.listStaff.useQuery(undefined, { staleTime: 60_000 })

  // Poll for any unresolved taps on mount (missed while browser was closed)
  const { data: existingTaps = [], refetch: refetchTaps } = trpc.nayax.listPendingTaps.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: true,
  })

  // Show first unresolved existing tap on mount (if any)
  useEffect(() => {
    if (pendingTap || existingTaps.length === 0) return
    const tap = existingTaps[0] as {
      id: string; equipment_id: string | null; employee_user_id: string | null; tapped_at: string
    }
    setPendingTap(buildTapInfo(tap, equipment, staff))
  }, [existingTaps]) // eslint-disable-line react-hooks/exhaustive-deps

  // Respond instantly to simulated taps (bypasses Realtime latency)
  useEffect(() => {
    const handler = async () => {
      const { data } = await refetchTaps()
      const taps = data as { id: string; equipment_id: string | null; employee_user_id: string | null; tapped_at: string }[] | undefined
      if (taps && taps.length > 0 && !pendingTap) {
        setPendingTap(buildTapInfo(taps[0], equipment, staff))
      }
    }
    window.addEventListener('nayax:simulated-tap', handler)
    return () => window.removeEventListener('nayax:simulated-tap', handler)
  }, [equipment, staff, pendingTap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to new taps via Supabase Realtime
  useEffect(() => {
    const supabase = createBrowserClient()

    const channel = supabase
      .channel(`pending-taps-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pending_taps',
          filter: `employee_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string; equipment_id: string | null; employee_user_id: string | null; tapped_at: string
          }
          if (!pendingTap) {
            setPendingTap(buildTapInfo(row, equipment, staff))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, equipment, staff]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pendingTap) return null

  return (
    <TapDialog
      tap={pendingTap}
      onDismiss={() => setPendingTap(null)}
    />
  )
}

function buildTapInfo(
  row: { id: string; equipment_id: string | null; employee_user_id: string | null; tapped_at: string },
  equipment: { id: string; name: string; type: string }[],
  staff: { user_id: string; display_name: string }[]
): TapInfo {
  const equip = row.equipment_id ? equipment.find((e) => e.id === row.equipment_id) ?? null : null
  const member = row.employee_user_id ? staff.find((m) => m.user_id === row.employee_user_id) : null

  return {
    id: row.id,
    equipment: equip ? { id: equip.id, name: equip.name, type: equip.type } : null,
    employeeName: (member as { display_name: string } | undefined)?.display_name ?? 'Unknown staff',
    tapped_at: row.tapped_at,
  }
}
