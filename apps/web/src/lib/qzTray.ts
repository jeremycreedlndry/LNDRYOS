/**
 * QZ Tray bridge — connects to the local QZ Tray agent (ws://localhost:8182)
 * and exposes printer discovery + raw print helpers.
 *
 * QZ Tray must be running on the client machine.
 * https://qz.io
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let qz: any = null

async function getQZ() {
  if (qz) return qz
  // qz-tray uses a global `qz` object after import
  const mod = await import('qz-tray')
  qz = (mod as any).default ?? mod
  return qz
}

/** Connect to the QZ Tray WebSocket. Safe to call multiple times. */
export async function qzConnect(): Promise<void> {
  const q = await getQZ()
  if (q.websocket.isActive()) return

  // Unsigned mode — QZ Tray will prompt the user to allow once, then remembers
  q.security.setCertificatePromise((resolve: (v: string) => void) => {
    resolve('')
  })
  q.security.setSignatureAlgorithm('SHA512')
  q.security.setSignaturePromise(() => (resolve: () => void) => {
    resolve()
  })

  try {
    // Try standard WS port first (8182), then secure WSS port (8183)
    await q.websocket.connect({ retries: 1, delay: 0.5 })
  } catch {
    try {
      await q.websocket.connect({ host: 'localhost', port: { secure: [8183], insecure: [8182] }, retries: 1, delay: 0.5 })
    } catch (e2) {
      const msg = (e2 as Error)?.message ?? ''
      if (msg.includes('Unable to establish') || msg.includes('refused')) {
        throw new Error('QZ Tray is not running. Open QZ Tray on this machine and try again.')
      }
      if (msg.includes('trust') || msg.includes('sign') || msg.includes('Untrusted')) {
        throw new Error('This site is not trusted by QZ Tray. Right-click the QZ Tray icon → Site Manager → add this site, then try again.')
      }
      throw e2
    }
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
