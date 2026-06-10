'use client'

import { useState } from 'react'
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
  Wrench,
  ChevronDown,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClockWidget } from './ClockWidget'
import { trpc } from '@/lib/trpc'

// ─── Nav config ───────────────────────────────────────────────────────────────

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  badge?: boolean
  requestBadge?: boolean
  permission?: string | null   // null = always visible; undefined = hidden from staff
}

type NavGroup = {
  group: string
  icon: React.ElementType
  permission?: string | null   // controls visibility of the whole group
  items: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e }

const NAV: NavEntry[] = [
  { href: '/pos',       label: 'POS',       icon: ShoppingCart,  permission: 'pos' },
  { href: '/orders',    label: 'Orders',     icon: ClipboardList, permission: 'orders' },
  { href: '/workflow',  label: 'Workflow',   icon: Workflow,      permission: 'orders' },
  { href: '/pickups',   label: 'Pickups',    icon: Truck,         permission: 'orders', requestBadge: true },
  { href: '/customers', label: 'Customers',  icon: Users,         permission: 'customers' },
  { href: '/invoices',  label: 'Invoices',   icon: FileText,      permission: 'manage_invoices' },
  {
    group: 'Tools',
    icon: Wrench,
    permission: null,   // visible to all; individual items further filter
    items: [
      { href: '/gift-cards',     label: 'Gift Cards',     icon: Gift,        permission: 'pos' },
      { href: '/bag-out-labels', label: 'Bag Out Labels', icon: Tag,         permission: 'orders' },
      { href: '/stain-tracker',  label: 'Stain Tracker',  icon: Droplets,    permission: 'orders' },
      { href: '/scheduler',      label: 'Scheduler',      icon: CalendarDays, permission: null },
      { href: '/inventory',      label: 'Inventory',      icon: Package,      permission: null },
    ],
  },
  { href: '/search',  label: 'Search',  icon: Search,        permission: null },
  { href: '/inbox',   label: 'Inbox',   icon: MessageSquare, permission: null, badge: true },
  { href: '/reports', label: 'Reports', icon: BarChart2,     permission: 'reports' },
  { href: '/settings',label: 'Settings',icon: Settings,      permission: 'settings' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { tenantName: string }

export function Sidebar({ tenantName }: Props) {
  const pathname = usePathname()

  const { data: unread }      = trpc.messages.unreadCount.useQuery(undefined, { refetchInterval: 30_000 })
  const { data: pendingReqs } = trpc.pickupStops.countPendingRequests.useQuery(undefined, { refetchInterval: 30_000 })
  const { data: myRole }      = trpc.staff.myRole.useQuery(undefined, { staleTime: 60_000 })

  const unreadCount  = unread?.count ?? 0
  const pendingCount = pendingReqs?.count ?? 0
  const role         = myRole?.role ?? 'staff'
  const perms        = (myRole?.permissions ?? {}) as Record<string, unknown>
  const isPrivileged = role === 'owner' || role === 'manager'

  // Auto-open Tools group if current path is inside it
  const toolPaths = ['/gift-cards', '/bag-out-labels', '/stain-tracker', '/scheduler']
  const [toolsOpen, setToolsOpen] = useState(() => toolPaths.some((p) => pathname.startsWith(p)))

  const canSee = (permission: string | null | undefined) => {
    if (isPrivileged)         return true
    if (permission === null)  return true
    if (!permission)          return false
    return perms[permission] === true
  }

  const linkClass = (active: boolean) => cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  )

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Logo / tenant name */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Shirt className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900 truncate">{tenantName}</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((entry) => {
          if (isGroup(entry)) {
            // Filter items the user can see
            const visibleItems = entry.items.filter((item) => canSee(item.permission))
            if (!canSee(entry.permission) || visibleItems.length === 0) return null

            const groupActive = visibleItems.some((item) => pathname.startsWith(item.href))
            const GroupIcon   = entry.icon

            return (
              <div key={entry.group}>
                {/* Group toggle button */}
                <button
                  onClick={() => setToolsOpen((o) => !o)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    groupActive && !toolsOpen
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{entry.group}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', toolsOpen && 'rotate-180')} />
                </button>

                {/* Sub-items */}
                {toolsOpen && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                    {visibleItems.map((item) => {
                      const active = pathname.startsWith(item.href)
                      const Icon   = item.icon
                      return (
                        <Link key={item.href} href={item.href} className={linkClass(active)}>
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          // Regular item
          if (!canSee(entry.permission)) return null
          const active           = pathname.startsWith(entry.href)
          const showBadge        = !!entry.badge        && unreadCount  > 0
          const showRequestBadge = !!entry.requestBadge && pendingCount > 0
          const Icon             = entry.icon

          return (
            <Link key={entry.href} href={entry.href} className={linkClass(active)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{entry.label}</span>
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
