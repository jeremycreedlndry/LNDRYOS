'use client'

import { createBrowserClient } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export function TopBar() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </header>
  )
}
