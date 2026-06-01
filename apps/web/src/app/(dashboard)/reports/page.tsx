'use client'

import Link from 'next/link'
import { Clock, DollarSign, ChevronRight } from 'lucide-react'
import { RequirePermission } from '@/components/layout/RequirePermission'

const REPORTS = [
  {
    href: '/reports/hours',
    icon: Clock,
    title: 'Staff Hours',
    description: 'View clock-in / clock-out records, filter by date range or staff member, and export to CSV.',
  },
  {
    href: '/reports/sales',
    icon: DollarSign,
    title: 'Sales',
    description: 'Track order revenue and collections by date. See totals, outstanding balances, and export to CSV.',
  },
]

function ReportsLanding() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          {REPORTS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 group-hover:bg-brand-100 transition-colors">
                <Icon className="h-5 w-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{title}</p>
                <p className="mt-1 text-sm text-gray-500 leading-snug">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-brand-400 shrink-0 mt-1 transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <RequirePermission permission="reports">
      <ReportsLanding />
    </RequirePermission>
  )
}
