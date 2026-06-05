'use client'

import { useRouter } from 'next/navigation'
import { ExternalLink, Store } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
}
const PLANS = ['starter', 'professional', 'enterprise'] as const

export default function AdminPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: stores = [], isLoading } = trpc.admin.listStores.useQuery()

  const setStatus = trpc.admin.setStoreStatus.useMutation({
    onSuccess: () => { utils.admin.listStores.invalidate(); toast.success('Status updated') },
    onError: (e) => toast.error(e.message),
  })
  const setPlan = trpc.admin.setStorePlan.useMutation({
    onSuccess: () => { utils.admin.listStores.invalidate(); toast.success('Plan updated') },
    onError: (e) => toast.error(e.message),
  })

  const openStore = (tenantId: string) => {
    // Act-as: point this device's tenant cookie at the store, then enter the app
    document.cookie = `tenant_id=${tenantId}; path=/; max-age=31536000`
    router.push('/pos')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
        <p className="text-sm text-gray-500 mt-0.5">{stores.length} registered store{stores.length === 1 ? '' : 's'}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Store</th>
              <th className="px-4 py-2.5 text-left font-semibold">Owner</th>
              <th className="px-4 py-2.5 text-right font-semibold">Customers</th>
              <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
              <th className="px-4 py-2.5 text-left font-semibold">Plan</th>
              <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && stores.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No stores.</td></tr>
            )}
            {stores.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-gray-300 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.slug} · {new Date(s.created_at).toLocaleDateString('en-CA')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <p className="truncate">{s.owner_email ?? '—'}</p>
                  {s.owner_name && <p className="text-xs text-gray-400 truncate">{s.owner_name}</p>}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{s.customer_count}</td>
                <td className="px-4 py-3 text-right text-gray-700">{s.order_count}</td>
                <td className="px-4 py-3">
                  <select
                    value={s.plan}
                    onChange={(e) => setPlan.mutate({ tenant_id: s.id, plan: e.target.value as typeof PLANS[number] })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs capitalize focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[s.status] ?? 'bg-gray-100 text-gray-500')}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setStatus.mutate({ tenant_id: s.id, status: s.status === 'active' ? 'suspended' : 'active' })}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {s.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openStore(s.id)}
                      className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      <ExternalLink className="h-3 w-3" /> Open
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
