export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
