import { NextResponse } from 'next/server'
import { QZ_CERT } from '@/lib/qz-cert'

export async function GET() {
  return new NextResponse(QZ_CERT, {
    headers: { 'Content-Type': 'text/plain' },
  })
}
