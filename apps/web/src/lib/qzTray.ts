/**
 * QZ Tray bridge — loads qz-tray.js via script tag (officially supported method)
 * and connects to the local QZ Tray agent on ws://localhost:8182.
 *
 * Uses unsigned mode — QZ Tray shows a one-time "Allow this app?" prompt.
 * Click "Allow Always" once and it never asks again.
 *
 * QZ Tray must be running on the client machine.
 * https://qz.io
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getQZ(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).qz
}

/** Load QZ Tray script from CDN if not already loaded */
async function loadQZScript(): Promise<void> {
  if (getQZ()) return
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load QZ Tray script'))
    document.head.appendChild(script)
  })
}

/** Connect to the QZ Tray WebSocket. Safe to call multiple times. */
export async function qzConnect(): Promise<void> {
  await loadQZScript()
  const q = getQZ()

  if (!q) throw new Error('QZ Tray library failed to load')
  if (q.websocket.isActive()) return

  // Unsigned mode: QZ Tray shows a one-time trust prompt.
  // Click "Allow Always" — never asked again on this machine.
  q.security.setCertificatePromise((_resolve: () => void, reject: () => void) => reject())
  q.security.setSignatureAlgorithm('SHA512')
  q.security.setSignaturePromise(() => (_resolve: () => void, reject: () => void) => reject())

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
