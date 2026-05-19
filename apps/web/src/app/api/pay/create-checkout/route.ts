/**
 * Deprecated — payment is now handled by Helcim.
 * This endpoint is kept as a tombstone so any old links return a clear error
 * rather than a 404.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is no longer active. Payment is handled via Helcim.' },
    { status: 410 }
  )
}
