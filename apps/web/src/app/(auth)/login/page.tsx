'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shirt } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Pick the tenant where user is owner AND has delivery zones (real tenant)
      // Falls back to oldest owner membership if none have zones
      const { data: members } = await supabase
        .from('tenant_members')
        .select('tenant_id, role, created_at')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: true })

      // If only one membership → use it directly, no guessing needed
      let member = members?.length === 1 ? members[0] : null

      if (!member && members && members.length > 1) {
        // Multiple tenants (e.g. owner has real store + junk onboarding tenants).
        // Pick the one with the most orders — that's always the real store.
        const counts = await Promise.all(
          members.map(async (m) => {
            const { count } = await supabase
              .from('orders')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', m.tenant_id)
            return { m, count: count ?? 0 }
          })
        )
        counts.sort((a, b) => b.count - a.count)
        // Use highest-order-count tenant; fall back to oldest owner, then oldest member
        const ownerMembers = members.filter((m) => m.role === 'owner')
        member = counts[0]?.count > 0
          ? counts[0].m
          : ownerMembers[0] ?? members[0]
      }

      if (member?.tenant_id) {
        document.cookie = `tenant_id=${member.tenant_id}; path=/; max-age=31536000`
      }

      // Re-prompt for the station on each login (clears the per-device "chosen"
      // flags). New windows of an active session don't hit login, so they won't nag.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('lndryos_station_chosen'))
        .forEach((k) => localStorage.removeItem(k))

      router.push('/pos')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600">
            <Shirt className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">LNDRYOS</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your store</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <a href="/onboarding" className="text-brand-600 hover:underline">Get started</a>
        </p>
      </div>
    </div>
  )
}
