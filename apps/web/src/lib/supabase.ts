import { createClientComponentClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export function createBrowserClient() {
  return createClientComponentClient()
}

export async function createServerClient() {
  return createServerComponentClient({ cookies })
}
