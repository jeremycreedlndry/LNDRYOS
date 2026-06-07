'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ShoppingCart,
  ClipboardList,
  Users,
  BarChart2,
  Settings,
  Shirt,
  Workflow,
  Truck,
  MessageSquare,
  Search,
  FileText,
  Gift,
  Tag,
  Droplets,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClockWidget } from './ClockWidget'
import { trpc } from '@/lib/trpc'

// permission key → which permission field controls this route (null = always visible)
const NAV: {
  href: string
  label: string
  icon: React.ElementType
  badge?: boolean
  requestBadge?: boolean
  permission?: string | null  // null = always visible to all roles
}[] = [
  { href: '/pos',        label: 'POS',        icon: ShoppingCart,  permission: 'pos' },
  { href: '/orders',     label: 'Orders',      icon: ClipboardList, permission: 'orders' },
  { href: '/workflow',   label: 'Workflow',    icon: Workflow,      permission: 'orders' },
  { href: '/pickups',    label: 'Pickups',     icon: Truck,         permission: 'orders', requestBadge: true },
  { href: '/customers',  label: 'Customers',   icon: Users,         permission: 'customers' },
  { href: '/invoices',   label: 'Invoices',    icon: FileText,      permission: 'manage_invoices' },
  { href: '/gift-cards',     label: 'Gift Cards',     icon: Gift, permission: 'pos' },
  { href: '/bag-out-labels',  label: 'Bag Out Labels',  icon: Tag,      permission: 'orders' },
  { href: '/stain-tracker',   label: 'Stain Tracker',   icon: Droplets,     permission: 'orders' },
  { href: '/scheduler',       label: 'Scheduler',       icon: CalendarDays, permission: null },
  { href: '/search',     label: 'Search',      icon: Search,        permission: null },
  { href: '/inbox',      label: 'Inbox',       icon: MessageSquare, permission: null, badge: true },
  { href: '/reports',    label: 'Reports',     icon: BarChart2,     permission: 'reports' },
  { href: '/settings',   label: 'Settings',    icon: Settings,      permission: 'settings' },
]

interface Props {
  tenantName: string
}

export function Sidebar({ tenantName }: Props) {
  const pathname = usePathname()

  const { data: unread } = trpc.messages.unreadCount.useQuery(undefined, { refetchInterval: 30_000 })
  const unreadCount = unread?.count ?? 0

  const { data: pendingReqs } = trpc.pickupStops.countPendingRequests.useQuery(undefined, { refetchInterval: 30_000 })
  const pendingCount = pendingReqs?.count ?? 0

  const { data: myRole } = trpc.staff.myRole.useQuery(undefined, { staleTime: 60_000 })
  const role  = myRole?.role ?? 'staff'
  const perms = (myRole?.permissions ?? {}) as Record<string, unknown>
  const isPrivileged = role === 'owner' || role === 'manager'

  const visibleNav = NAV.filter(({ permission }) => {
    if (isPrivileged) return true          // owners & managers see everything
    if (permission === null) return true   // always-visible items
    if (!permission) return false          // no permission key = hidden from staff
    return perms[permission] === true      // staff need explicit permission
  })

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Shirt className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900 truncate">{tenantName}</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map(({ href, label, icon: Icon, badge, requestBadge }) => {
          const active = pathname.startsWith(href)
          const showBadge = badge && unreadCount > 0
          const showRequestBadge = requestBadge && pendingCount > 0
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {showRequestBadge && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <ClockWidget />
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-400">LNDRYOS v1.0</p>
      </div>
    </aside>
  )
}
