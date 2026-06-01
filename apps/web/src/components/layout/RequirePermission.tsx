'use client'

import { trpc } from '@/lib/trpc'
import { ShieldOff } from 'lucide-react'

/**
 * Wraps a page and shows an "Access denied" screen if the current staff
 * member doesn't have the required permission.
 * Owners and managers always pass through.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: React.ReactNode
}) {
  const { data: myRole, isLoading } = trpc.staff.myRole.useQuery(undefined, { staleTime: 60_000 })

  if (isLoading) return null

  const role  = myRole?.role ?? 'staff'
  const perms = (myRole?.permissions ?? {}) as Record<string, unknown>
  const allowed = role === 'owner' || role === 'manager' || perms[permission] === true

  if (!allowed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <ShieldOff className="h-7 w-7 text-gray-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Access denied</h2>
          <p className="mt-1 text-sm text-gray-500">
            You don&apos;t have permission to view this page.<br />
            Ask an owner or manager to update your permissions.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
