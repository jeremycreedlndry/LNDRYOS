'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, ClipboardList, Users, Settings, WashingMachine, Truck, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'

const NAV = [
  { href: '/pos',       label: 'POS',      icon: ShoppingCart },
  { href: '/orders',    label: 'Orders',   icon: ClipboardList },
  { href: '/machines',  label: 'Machines', icon: WashingMachine },
  { href: '/pickups',   label: 'Pickups',  icon: Truck },
  { href: '/inbox',     label: 'Inbox',    icon: MessageSquare, badge: true },
  { href: '/customers', label: 'Customers',icon: Users },
  { href: '/settings',  label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const { data: unread } = trpc.messages.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  })
  const unreadCount = unread?.count ?? 0

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-gray-200 bg-white">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = pathname.startsWith(href)
        const showBadge = badge && unreadCount > 0
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
              active ? 'text-brand-700' : 'text-gray-500'
            )}
          >
            <div className="relative">
              <Icon className={cn('h-5 w-5', active ? 'text-brand-600' : 'text-gray-400')} />
              {showBadge && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-500 px-0.5 text-[8px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
