/**
 * Platform-level (master) admin allowlist. Server-side only.
 * Set PLATFORM_ADMIN_EMAILS to a comma-separated list of emails.
 */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allow.includes(email.trim().toLowerCase())
}
