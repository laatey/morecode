import type { OAuthState } from './oauth'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

/** A connector as the main process needs it. Secrets are already filled in by the app. */
export interface McpConfig {
  id: string
  name: string
  kind: 'http' | 'stdio'
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Per tool: allow, ask first, or block. Anything missing follows the tool's own read-only hint. */
  perms?: Record<string, 'allow' | 'ask' | 'block'>
  /** Set when the person signed in through the browser. The manager turns it into a header. */
  oauth?: OAuthState
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; title?: string }
}

export interface McpResult {
  content?: { type: string; text?: string; mimeType?: string; resource?: { text?: string; uri?: string } }[]
  isError?: boolean
}

type Rpc = { jsonrpc: '2.0'; id?: number; result?: unknown; error?: { code: number; message: string } }
const PROTOCOL = '2025-06-18'
const INFO = { name: 'morecode', version: '1.0.0' }

interface Transport {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>
  notify(method: string, params?: unknown): Promise<void>
  close(): void
}

/** Streamable HTTP: every message is a POST; the answer is JSON or a short event stream. */
class HttpTransport implements Transport {
  private next = 1
  private session: string | undefined
  private version: string | undefined
  constructor(private url: string, private headers: Record<string, string>) {}

  private async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.session ? { 'Mcp-Session-Id': this.session } : {}),
        ...(this.version ? { 'MCP-Protocol-Version': this.version } : {}),
        ...this.headers
      },
      body: JSON.stringify(body),
      signal
    })
    this.session = res.headers.get('mcp-session-id') ?? this.session
    return res
  }

  async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.next++
    const res = await this.post({ jsonrpc: '2.0', id, method, params }, signal)
    if (res.status === 401 || res.status === 403) throw new Error('The server did not accept the sign-in details (401/403).')
    if (!res.ok) throw new Error(`The server answered ${res.status}.`)
    if (method === 'initialize') this.version = PROTOCOL
    const type = res.headers.get('content-type') ?? ''
    let msg: Rpc | undefined
    if (type.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      read: for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let cut: number
        while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, cut)
          buf = buf.slice(cut).replace(/^\r?\n\r?\n/, '')
          const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
          if (!data) continue
          try {
            const m = JSON.parse(data) as Rpc
            if (m.id === id) {
              msg = m
              break read
            }
          } catch {
            /* not JSON: ignore */
          }
        }
      }
      void reader.cancel().catch(() => undefined)
    } else {
      const m = (await res.json()) as Rpc | Rpc[]
      msg = Array.isArray(m) ? m.find((x) => x.id === id) : m
    }
    if (!msg) throw new Error('The server sent no answer.')
    if (msg.error) throw new Error(msg.error.message)
    return msg.result
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.post({ jsonrpc: '2.0', method, params }).catch(() => undefined)
  }

  close(): void {
    if (!this.session) return
    void fetch(this.url, { method: 'DELETE', headers: { 'Mcp-Session-Id': this.session, ...this.headers } }).catch(() => undefined)
  }
}

/** The older web transport: one long event stream down, plain POSTs up. */
class SseTransport implements Transport {
  private next = 1
  private post: string | undefined
  private pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()
  private abort = new AbortController()
  private ready: Promise<void>

  constructor(private url: string, private headers: Record<string, string>) {
    this.ready = new Promise((ok, no) => {
      void this.listen(ok, no)
      setTimeout(() => no(new Error('The server did not answer.')), 20_000)
    })
  }

  private async listen(ok: () => void, no: (e: Error) => void): Promise<void> {
    try {
      const res = await fetch(this.url, { headers: { Accept: 'text/event-stream', ...this.headers }, signal: this.abort.signal })
      if (res.status === 401 || res.status === 403) return no(new Error('The server did not accept the sign-in details (401/403).'))
      if (!res.ok || !res.body) return no(new Error(`The server answered ${res.status}.`))
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let cut: number
        while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, cut)
          buf = buf.slice(cut).replace(/^\r?\n\r?\n/, '')
          const lines = block.split(/\r?\n/)
          const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim() ?? 'message'
          const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
          if (event === 'endpoint') {
            this.post = new URL(data, this.url).toString()
            ok()
          } else if (data) {
            try {
              const m = JSON.parse(data) as Rpc
              const p = m.id === undefined ? undefined : this.pending.get(m.id)
              if (!p || m.id === undefined) continue
              this.pending.delete(m.id)
              if (m.error) p.fail(new Error(m.error.message))
              else p.ok(m.result)
            } catch {
              /* ignore */
            }
          }
        }
      }
      for (const p of this.pending.values()) p.fail(new Error('The connection closed.'))
      this.pending.clear()
    } catch (e) {
      no(e as Error)
    }
  }

  private async send(body: unknown): Promise<void> {
    await this.ready
    const r = await fetch(this.post as string, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`The server answered ${r.status}.`)
  }

  async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.next++
    const answer = new Promise<unknown>((ok, fail) => {
      this.pending.set(id, { ok, fail })
      signal?.addEventListener('abort', () => {
        this.pending.delete(id)
        fail(new Error('Stopped.'))
      }, { once: true })
    })
    await this.send({ jsonrpc: '2.0', id, method, params })
    return answer
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.send({ jsonrpc: '2.0', method, params }).catch(() => undefined)
  }

  close(): void {
    this.abort.abort()
  }
}

/** A local program that speaks MCP over its standard input and output, one JSON message per line. */
class StdioTransport implements Transport {
  private next = 1
  private proc: ChildProcessWithoutNullStreams
  private pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()
  private buf = ''
  private tail = ''

  constructor(command: string, args: string[], env: Record<string, string>, cwd?: string) {
    this.proc = spawn(command, args, {
      env: { ...process.env, ...env },
      cwd,
      shell: process.platform === 'win32', // npx and uvx are .cmd files on Windows
      windowsHide: true
    })
    this.proc.stdout.on('data', (d: Buffer) => {
      this.buf += d.toString('utf8')
      let nl: number
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim()
        this.buf = this.buf.slice(nl + 1)
        if (!line) continue
        try {
          const m = JSON.parse(line) as Rpc
          if (m.id === undefined) continue
          const p = this.pending.get(m.id)
          if (!p) continue
          this.pending.delete(m.id)
          if (m.error) p.fail(new Error(m.error.message))
          else p.ok(m.result)
        } catch {
          /* a log line, not a message */
        }
      }
    })
    this.proc.stderr.on('data', (d: Buffer) => (this.tail = (this.tail + d.toString('utf8')).slice(-400)))
    const dead = (why: string): void => {
      for (const p of this.pending.values()) p.fail(new Error(why))
      this.pending.clear()
    }
    this.proc.on('error', (e) => dead(`Could not start “${command}”: ${e.message}`))
    this.proc.on('exit', (code) => dead(this.tail.trim() || `The program stopped (exit ${code}).`))
  }

  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.next++
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail })
      signal?.addEventListener('abort', () => {
        this.pending.delete(id)
        fail(new Error('Stopped.'))
      }, { once: true })
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', (e) => {
        if (e) fail(e)
      })
    })
  }

  async notify(method: string, params?: unknown): Promise<void> {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  close(): void {
    this.proc.stdin.end()
    this.proc.kill()
  }
}

export class McpClient {
  tools: McpTool[] = []
  serverName = ''
  private t!: Transport

  constructor(readonly config: McpConfig, cwd?: string) {
    if (config.kind === 'http') {
      if (!config.url || !/^https?:\/\//i.test(config.url)) throw new Error('Enter the full address, starting with https://')
      // addresses ending in /sse are the older transport
      this.t = /\/sse\/?$/i.test(config.url) ? new SseTransport(config.url, config.headers ?? {}) : new HttpTransport(config.url, config.headers ?? {})
    } else {
      if (!config.command?.trim()) throw new Error('Enter the command that starts the server.')
      this.t = new StdioTransport(config.command.trim(), config.args ?? [], config.env ?? {}, cwd)
    }
  }

  async connect(signal?: AbortSignal): Promise<void> {
    const hello = { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: INFO }
    let init: { serverInfo?: { name?: string } }
    try {
      init = (await this.t.request('initialize', hello, signal)) as typeof init
    } catch (err) {
      // a server that only speaks the older transport answers the new one with 404, 405 or 400
      const c = this.config
      if (c.kind !== 'http' || !c.url || !/answered (400|404|405)\b/.test((err as Error).message)) throw err
      this.t.close()
      this.t = new SseTransport(c.url, c.headers ?? {})
      init = (await this.t.request('initialize', hello, signal)) as typeof init
    }
    this.serverName = init?.serverInfo?.name ?? ''
    await this.t.notify('notifications/initialized')
    this.tools = []
    let cursor: string | undefined
    for (let i = 0; i < 10; i++) {
      const r = (await this.t.request('tools/list', cursor ? { cursor } : {}, signal)) as { tools?: McpTool[]; nextCursor?: string }
      this.tools.push(...(r.tools ?? []))
      cursor = r.nextCursor
      if (!cursor) break
    }
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpResult> {
    return (await this.t.request('tools/call', { name, arguments: args }, signal)) as McpResult
  }

  close(): void {
    try {
      this.t.close()
    } catch {
      /* already gone */
    }
  }
}

/** Flatten a tool result into text the model (and the person) can read. */
export function resultText(r: McpResult): string {
  const parts = (r.content ?? []).map((c) =>
    c.type === 'text' ? (c.text ?? '') : c.type === 'resource' ? (c.resource?.text ?? c.resource?.uri ?? '') : `[${c.type}${c.mimeType ? ` ${c.mimeType}` : ''}]`
  )
  return parts.join('\n').trim() || '(no output)'
}
