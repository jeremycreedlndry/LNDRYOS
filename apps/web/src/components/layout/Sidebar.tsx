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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClockWidget } from './ClockWidget'
import { trpc } from '@/lib/trpc'

const NAV = [
  { href: '/pos',       label: 'POS',       icon: ShoppingCart },
  { href: '/orders',    label: 'Orders',    icon: ClipboardList },
  { href: '/workflow',  label: 'Workflow',  icon: Workflow },
  { href: '/pickups',   label: 'Pickups',   icon: Truck },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/inbox',     label: 'Inbox',     icon: MessageSquare, badge: true },
  { href: '/reports',   label: 'Reports',   icon: BarChart2 },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

interface Props {
  tenantName: string
}

export function Sidebar({ tenantName }: Props) {
  const pathname = usePathname()
  const { data: unread } = trpc.messages.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  })
  const unreadCount = unread?.count ?? 0

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Shirt className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900 truncate">{tenantName}</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname.startsWith(href)
          const showBadge = badge && unreadCount > 0
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
