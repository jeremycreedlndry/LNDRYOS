'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { trpc } from '@/lib/trpc'
import superjson from 'superjson'
import { Toaster } from 'react-hot-toast'

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  return 'http://localhost:3000'
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }))

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            // Read tenant_id from cookie set after login
            const match = document.cookie.match(/(?:^|;\s*)tenant_id=([^;]*)/)
            const tenantId = match ? decodeURIComponent(match[1]) : ''
            return tenantId ? { 'x-tenant-id': tenantId } : {}
          },
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </trpc.Provider>
  )
}
