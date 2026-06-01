import { createSign } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Signs QZ Tray request strings with our private key.
 * QZ Tray calls this endpoint to verify the browser is talking to a trusted app.
 */
export async function POST(req: NextRequest) {
  const { request } = await req.json()
  if (!request) return NextResponse.json({ error: 'Missing request' }, { status: 400 })

  const privateKey = process.env.QZ_PRIVATE_KEY
  if (!privateKey) return NextResponse.json({ error: 'QZ_PRIVATE_KEY not configured' }, { status: 500 })

  const sign = createSign('SHA512')
  sign.update(request)
  const signature = sign.sign(privateKey, 'base64')

  return NextResponse.json({ signature })
}
