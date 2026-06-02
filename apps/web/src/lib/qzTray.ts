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
  // Certificate-based trust — QZ Tray auto-allows when cert+signature match
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.security.setCertificatePromise((resolve: any) => {
    fetch('/api/qz-cert').then(r => r.text()).then(resolve).catch(resolve)
  })
  q.security.setSignatureAlgorithm('SHA512')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.security.setSignaturePromise((toSign: string) => (resolve: any, reject: any) => {
    fetch('/api/qz-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: toSign }),
    })
      .then(r => r.json())
      .then(j => { if (j.signature) resolve(j.signature); else reject(new Error(j.error)) })
      .catch(reject)
  })

  try {
    await q.websocket.connect({
      host: ['localhost'],
      port: { secure: [8181, 8183], insecure: [8080, 8182] },
      keepAlive: 60,
      retries: 2,
      delay: 0.5,
    })
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

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

/** Build a QZ Tray config — uses direct socket for IP addresses, Windows driver for named printers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(q: any, printerName: string, port = 9100) {
  if (IP_RE.test(printerName.trim())) {
    // Direct raw socket — bypasses Windows driver, cut commands work
    return q.configs.create({ host: printerName.trim(), port, retries: 2, waitTime: 5000 })
  }
  return q.configs.create(printerName)
}

/** Convert string to base64 without spreading large arrays (avoids call stack overflow). */
function toBase64(data: string): string {
  const bytes = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Send raw ZPL to a printer by name or IP. */
export async function qzPrintZPL(printerName: string, zpl: string): Promise<void> {
  await qzConnect()
  const q = await getQZ()
  const config = makeConfig(q, printerName)
  await q.print(config, [{ type: 'raw', format: 'command', data: zpl }])
}

/** Send raw ESC/POS to a printer by name or IP — base64 encoded so bytes aren't corrupted. */
export async function qzPrintRaw(printerName: string, data: string): Promise<void> {
  await qzConnect()
  const q = await getQZ()
  const config = makeConfig(q, printerName)
  await q.print(config, [{ type: 'raw', format: 'base64', data: toBase64(data) }])
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
