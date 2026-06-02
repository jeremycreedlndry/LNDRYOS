/**
 * QZ Tray bridge — connects to the local QZ Tray agent (ws://localhost:8182)
 * and exposes printer discovery + raw print helpers.
 *
 * Uses unsigned mode — QZ Tray shows a one-time "Allow this app?" prompt.
 * Click "Allow Always" once and it never asks again.
 *
 * QZ Tray must be running on the client machine.
 * https://qz.io
 */

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

  // Unsigned mode: QZ Tray will show a one-time trust prompt.
  // Click "Allow Always" — never asked again on this machine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.security.setCertificatePromise((resolve: any) => resolve())
  q.security.setSignatureAlgorithm('SHA512')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.security.setSignaturePromise(() => (resolve: any) => resolve())

  try {
    await q.websocket.connect({ host: 'localhost', port: 8182, retries: 2, delay: 0.5 })
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    if (msg.includes('Unable to establish') || msg.includes('refused') || msg.includes('ECONNREFUSED')) {
      throw new Error('QZ Tray is not running. Open QZ Tray on this machine and try again.')
    }
    throw new Error(`QZ Tray connection failed: ${msg}`)
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
