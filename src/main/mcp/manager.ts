import { BrowserWindow } from 'electron'
import { refreshIfNeeded } from './oauth'
import { McpClient, resultText, type McpConfig } from './client'
import type { ToolDef } from '../agent/anthropic'

/** Live connections, kept between runs so a server starts once and is reused. */
const live = new Map<string, { sig: string; client: McpClient }>()

const sigOf = (c: McpConfig, cwd?: string): string =>
  JSON.stringify([c.kind, c.url, c.headers, c.command, c.args, c.env, c.kind === 'stdio' ? cwd ?? '' : ''])

const withTimeout = (ms: number, signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

/** Turn a saved sign-in into a header, renewing it first when it is about to expire. */
async function withAuth(config: McpConfig): Promise<McpConfig> {
  if (!config.oauth) return config
  const fresh = await refreshIfNeeded(config.oauth)
  if (!fresh) throw new Error('Your sign-in expired. Open the connector and choose “Sign in again”.')
  if (fresh !== config.oauth) {
    // the app keeps the latest copy so the next launch starts from it
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('mcp:tokens', { id: config.id, oauth: fresh })
  }
  return { ...config, oauth: fresh, headers: { ...config.headers, Authorization: `Bearer ${fresh.access_token}` } }
}

export async function connectOne(raw: McpConfig, cwd?: string): Promise<McpClient> {
  const config = await withAuth(raw)
  const sig = sigOf(config, cwd)
  const known = live.get(config.id)
  if (known && known.sig === sig) return known.client
  known?.client.close()
  live.delete(config.id)
  const client = new McpClient(config, cwd)
  try {
    await client.connect(withTimeout(30_000))
  } catch (err) {
    client.close()
    throw err
  }
  live.set(config.id, { sig, client })
  return client
}

export function disconnect(id: string): void {
  live.get(id)?.client.close()
  live.delete(id)
}

export function disconnectAll(): void {
  for (const id of [...live.keys()]) disconnect(id)
}

/** What the person sees in the Customize page after trying a connection. */
export async function testConnector(config: McpConfig): Promise<{
  ok: boolean
  error?: string
  serverName?: string
  tools?: { name: string; description?: string; readOnly?: boolean }[]
}> {
  try {
    const c = await connectOne(config)
    return {
      ok: true,
      serverName: c.serverName,
      tools: c.tools.map((t) => ({ name: t.name, description: t.description?.slice(0, 300), readOnly: t.annotations?.readOnlyHint === true }))
    }
  } catch (err) {
    disconnect(config.id)
    return { ok: false, error: (err as Error).message || 'Could not connect.' }
  }
}

export interface McpRuntime {
  defs: ToolDef[]
  names: string[]
  failedAuth?: { id: string; name: string; error: string }[]
  /** Which connector and tool a model-facing name stands for. */
  find: (name: string) => { config: McpConfig; client: McpClient; tool: string; readOnly: boolean } | undefined
}

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_')

/** Connect every enabled connector (in parallel, skipping any that fail) and describe their tools for the model. */
export async function openRuntime(configs: McpConfig[], cwd: string, signal: AbortSignal): Promise<McpRuntime | null> {
  if (!configs.length) return null
  const failedAuth: { id: string; name: string; error: string }[] = []
  const ready = (
    await Promise.all(
      configs.map(async (c) => {
        try {
          return await Promise.race([
            connectOne(c, cwd),
            new Promise<never>((_, no) => signal.addEventListener('abort', () => no(new Error('Stopped.')), { once: true }))
          ])
        } catch (err) {
          const msg = (err as Error).message || ''
          if (/\b(401|403)\b|sign-in expired|unauthorized|forbidden|invalid_token|token expired/i.test(msg)) {
            failedAuth.push({ id: c.id, name: c.name, error: msg })
          }
          return null
        }
      })
    )
  ).filter((c): c is McpClient => c !== null)
  if (!ready.length && !failedAuth.length) return null

  const table = new Map<string, { config: McpConfig; client: McpClient; tool: string; readOnly: boolean }>()
  const defs: ToolDef[] = []
  for (const client of ready) {
    for (const t of client.tools) {
      const name = `mcp__${safe(client.config.id)}__${safe(t.name)}`.slice(0, 64)
      if (table.has(name)) continue
      table.set(name, { config: client.config, client, tool: t.name, readOnly: t.annotations?.readOnlyHint === true })
      if (client.config.perms?.[t.name] === 'block') continue
      defs.push({
        name,
        description: `[${client.config.name}] ${t.description ?? t.name}`.slice(0, 1000),
        input_schema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} }
      })
    }
  }
  return { defs, names: ready.map((c) => c.config.name), failedAuth, find: (n) => table.get(n) }
}

export { resultText }
