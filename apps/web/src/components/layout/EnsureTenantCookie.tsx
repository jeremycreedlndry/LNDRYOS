'use client'

import { useEffect } from 'react'

/**
 * Guarantees the tenant_id cookie is present on every dashboard load.
 * The tRPC client reads this cookie to set the x-tenant-id header.
 * Without it every tenantProcedure call returns UNAUTHORIZED.
 *
 * We can't set cookies in a server component, so this tiny client
 * component does it on mount using the tenantId the server already resolved.
 */
export function EnsureTenantCookie({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    if (!tenantId) return
    // Always keep the cookie fresh / set it if it was missing
    document.cookie = `tenant_id=${tenantId}; path=/; max-age=31536000; SameSite=Lax`
  }, [tenantId])

  return null
}
