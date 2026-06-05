import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { createServerClient } from '@/lib/supabase-server'
import { isPlatformAdmin } from '@laundry/api'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!isPlatformAdmin(user.email)) redirect('/pos')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-bold text-gray-900">LNDRYOS · Master Admin</span>
        </div>
        <Link href="/pos" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back to app
        </Link>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  )
}
