import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'
import { shell } from 'electron'

/** What is kept after signing in. Refreshed in the background; the app stores the latest copy. */
export interface OAuthState {
  access_token: string
  refresh_token?: string
  /** Milliseconds since 1970. */
  expires_at?: number
  client_id: string
  token_endpoint: string
}

interface Meta {
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
  scopes_supported?: string[]
}

const b64url = (b: Buffer): string => b.toString('base64url')
const j = async (url: string): Promise<Record<string, unknown> | null> => {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Find where to sign in: the server names its authorization server, which names its endpoints. */
async function discover(serverUrl: string): Promise<{ meta: Meta; scope?: string }> {
  const u = new URL(serverUrl)
  let resourceMeta: Record<string, unknown> | null = null
  // the server may point to its own metadata when asked without credentials
  try {
    const r = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'morecode', version: '1.0.0' } } }),
      signal: AbortSignal.timeout(15_000)
    })
    const hint = r.headers.get('www-authenticate')?.match(/resource_metadata="([^"]+)"/)?.[1]
    if (hint) resourceMeta = await j(hint)
  } catch {
    /* fall through to the well-known places */
  }
  const path = u.pathname.replace(/\/$/, '')
  resourceMeta ??= (await j(`${u.origin}/.well-known/oauth-protected-resource${path}`)) ?? (await j(`${u.origin}/.well-known/oauth-protected-resource`))
  const issuer = ((resourceMeta?.authorization_servers as string[] | undefined)?.[0] ?? u.origin).replace(/\/$/, '')
  const i = new URL(issuer)
  const ip = i.pathname.replace(/\/$/, '')
  const meta =
    (await j(`${i.origin}/.well-known/oauth-authorization-server${ip}`)) ??
    (await j(`${issuer}/.well-known/oauth-authorization-server`)) ??
    (await j(`${issuer}/.well-known/openid-configuration`)) ??
    (await j(`${i.origin}/.well-known/openid-configuration${ip}`))
  if (!meta?.authorization_endpoint || !meta.token_endpoint) throw new Error('This server does not offer browser sign-in.')
  const scopes = (resourceMeta?.scopes_supported as string[] | undefined) ?? undefined
  return { meta: meta as Meta, scope: scopes?.length ? scopes.join(' ') : undefined }
}

async function tokenRequest(endpoint: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000)
  })
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || typeof data.access_token !== 'string') throw new Error(String(data.error_description ?? data.error ?? `Sign-in failed (${r.status}).`))
  return data
}

const toState = (data: Record<string, unknown>, prev: Pick<OAuthState, 'client_id' | 'token_endpoint' | 'refresh_token'>): OAuthState => ({
  access_token: data.access_token as string,
  refresh_token: (data.refresh_token as string | undefined) ?? prev.refresh_token,
  expires_at: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined,
  client_id: prev.client_id,
  token_endpoint: prev.token_endpoint
})

/** Open the browser, let the person sign in, and catch the answer on a loopback address. */
export async function authorize(serverUrl: string, signal?: AbortSignal): Promise<OAuthState> {
  const { meta, scope } = await discover(serverUrl)
  const state = b64url(randomBytes(16))
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())

  let finish!: (r: { code?: string; error?: string }) => void
  const answer = new Promise<{ code?: string; error?: string }>((ok) => (finish = ok))
  const server = createServer((req, res) => {
    const q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams
    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404).end()
      return
    }
    const fine = q.get('state') === state && q.get('code')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<body style="font:15px system-ui;background:#1f1f1e;color:#ececea;display:grid;place-items:center;height:100vh;margin:0"><p>${fine ? 'You are signed in. You can close this tab and return to MoreCode.' : 'Sign-in did not finish. Return to MoreCode and try again.'}</p></body>`)
    finish(fine ? { code: q.get('code') as string } : { error: q.get('error_description') ?? q.get('error') ?? 'Sign-in did not finish.' })
  })
  await new Promise<void>((ok, no) => server.once('error', no).listen(0, '127.0.0.1', ok))
  const port = (server.address() as { port: number }).port
  const redirect = `http://127.0.0.1:${port}/callback`
  const timer = setTimeout(() => finish({ error: 'Sign-in took too long.' }), 5 * 60_000)
  signal?.addEventListener('abort', () => finish({ error: 'Stopped.' }), { once: true })

  try {
    let clientId: string | undefined
    if (meta.registration_endpoint) {
      const r = await fetch(meta.registration_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_name: 'MoreCode', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
        signal: AbortSignal.timeout(20_000)
      })
      clientId = ((await r.json().catch(() => ({}))) as { client_id?: string }).client_id
    }
    if (!clientId) throw new Error('This server needs an app registered for it first, so browser sign-in is not available. Use an access token instead.')

    const url = new URL(meta.authorization_endpoint as string)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirect,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: serverUrl,
      ...(scope ? { scope } : {})
    }).toString()
    await shell.openExternal(url.toString())

    const got = await answer
    if (!got.code) throw new Error(got.error ?? 'Sign-in did not finish.')
    const data = await tokenRequest(meta.token_endpoint as string, {
      grant_type: 'authorization_code',
      code: got.code,
      redirect_uri: redirect,
      client_id: clientId,
      code_verifier: verifier,
      resource: serverUrl
    })
    return toState(data, { client_id: clientId, token_endpoint: meta.token_endpoint as string })
  } finally {
    clearTimeout(timer)
    server.close()
  }
}

/** A fresh token when the saved one is about to run out; null when it cannot be renewed. */
export async function refreshIfNeeded(o: OAuthState): Promise<OAuthState | null> {
  if (!o.expires_at || o.expires_at - Date.now() > 60_000) return o
  if (!o.refresh_token) return null
  try {
    const data = await tokenRequest(o.token_endpoint, { grant_type: 'refresh_token', refresh_token: o.refresh_token, client_id: o.client_id })
    return toState(data, o)
  } catch {
    return null
  }
}
