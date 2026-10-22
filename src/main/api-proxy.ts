import { ipcMain } from 'electron'

/**
 * Calls to the MoreCode server are made from here, not from the page. A desktop app has no web origin that
 * a server can sensibly allow (a packaged app loads from file://), and the browser's CORS rules do not apply
 * to this process. The page can only ask for the MoreCode API paths below, never for an arbitrary address.
 */

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const HEADERS = new Set(['content-type', 'authorization', 'x-tz-offset', 'x-morecode-run', 'x-api-key'])
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

interface ApiRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

function allowed(r: unknown): r is ApiRequest {
  const x = r as ApiRequest
  if (!x || typeof x.url !== 'string' || typeof x.method !== 'string' || !METHODS.has(x.method)) return false
  if (x.body !== undefined && (typeof x.body !== 'string' || x.body.length > 5_000_000)) return false
  let u: URL
  try {
    u = new URL(x.url)
  } catch {
    return false
  }
  const secure = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL.has(u.hostname))
  return secure && (u.pathname.startsWith('/v1/') || u.pathname === '/health')
}

export function registerApiProxy(): void {
  ipcMain.handle('api:request', async (_e, req: unknown): Promise<{ status: number; body: string } | null> => {
    if (!allowed(req)) return null
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers ?? {})) if (HEADERS.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers,
        body: req.method === 'GET' ? undefined : req.body,
        signal: AbortSignal.timeout(30_000)
      })
      return { status: res.status, body: await res.text() }
    } catch (e) {
      console.error(`MoreCode API ${req.method} ${req.url} failed:`, e instanceof Error ? (e.cause ?? e.message) : e)
      return null // the page reports "could not reach MoreCode"
    }
  })
}
