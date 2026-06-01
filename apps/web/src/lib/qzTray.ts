/**
 * QZ Tray bridge — connects to the local QZ Tray agent (ws://localhost:8182)
 * and exposes printer discovery + raw print helpers.
 *
 * Uses certificate-based signing so QZ Tray trusts any browser/device
 * without per-machine prompts or Chrome mixed-content workarounds.
 *
 * QZ Tray must be running on the client machine.
 * https://qz.io
 */

import { QZ_CERT } from './qz-cert'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let qz: any = null

async function getQZ() {
  if (qz) return qz
  const mod = await import('qz-tray')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qz = (mod as any).default ?? mod
  return qz
}

/** Connect to the QZ Tray WebSocket. Safe to call multiple times. */
export async function qzConnect(): Promise<void> {
  const q = await getQZ()
  if (q.websocket.isActive()) return

  // Certificate-based trust: server signs each request with our private key.
  // QZ Tray verifies the signature against the embedded certificate — no
  // per-machine trust prompt needed.
  q.security.setCertificatePromise((resolve: (v: string) => void) => {
    resolve(QZ_CERT)
  })
  q.security.setSignatureAlgorithm('SHA512')
  q.security.setSignaturePromise((toSign: string) => async (resolve: (v: string) => void, reject: (e: unknown) => void) => {
    try {
      const res = await fetch('/api/qz-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: toSign }),
      })
      const { signature } = await res.json()
      resolve(signature)
    } catch (e) {
      reject(e)
    }
  })

  try {
    await q.websocket.connect({ host: 'localhost', port: 8182, retries: 2, delay: 0.5 })
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    if (msg.includes('Unable to establish') || msg.includes('refused')) {
      throw new Error('QZ Tray is not running. Open QZ Tray on this machine and try again.')
    }
    throw e
  }
}

/** Disconnect if connected. */
export async function qzDisconnect(): Promise<void> {
  const q = await getQZ()
  if (q.websocket.isActive()) await q.websocket.disconnect()
}

/** Returns a sorted list of all printers visible to QZ Tray. */
export async function qzListPrinters(): Promise<string[]> {
  await qzConnect()
  const q = await getQZ()
  const result = await q.printers.find()
  return (Array.isArray(result) ? result : [result]).filter(Boolean).sort()
}

/** Send raw ZPL to a printer by name. */
export async function qzPrintZPL(printerName: string, zpl: string): Promise<void> {
  await qzConnect()
  const q = await getQZ()
  const config = q.configs.create(printerName)
  await q.print(config, [{ type: 'raw', format: 'command', data: zpl }])
}

/** Send raw ESC/POS (or plain text) to a printer by name. */
export async function qzPrintRaw(printerName: string, data: string): Promise<void> {
  await qzConnect()
  const q = await getQZ()
  const config = q.configs.create(printerName)
  await q.print(config, [{ type: 'raw', format: 'plain', data }])
}

/** Returns true if QZ Tray is reachable. */
export async function qzIsAvailable(): Promise<boolean> {
  try {
    await qzConnect()
    return true
  } catch {
    return false
  }
}
