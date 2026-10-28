import { SECRET_NAMES, secrets } from '@/lib/secrets'
import { AuthError, mockAuthService, type Account, type AuthErrorCode, type AuthService, type BillingService, type PaymentStatus } from './auth-service'

/**
 * Accounts on the MoreCode server (see /server). Set VITE_API_URL (for example in a .env file) to
 * switch the app from the built-in demo accounts to this. Your own API key never leaves this
 * computer: it is stored here, next to the sign-in token, and merged into the account.
 */
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
export const HOSTED = Boolean(API)

const SESSIONS = SECRET_NAMES.sessions
const KEYS = SECRET_NAMES.keys
/** Sign-in sessions and your own API keys are secrets: they go in the encrypted store when the computer has one. */
const isSecret = (key: string): boolean => secrets.secure && (key === SESSIONS || key === KEYS)

interface Saved {
  current: string | null
  sessions: Record<string, { token: string; snapshot: Account }>
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = isSecret(key) ? secrets.get(key) : localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown): void => {
  if (isSecret(key)) {
    secrets.set(key, JSON.stringify(value))
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: this session lasts until the app closes
  }
}

const CODES: Record<string, AuthErrorCode> = {
  exists: 'exists',
  'bad-password': 'bad-password',
  'bad-code': 'bad-code',
  'weak-password': 'weak-password',
  'invalid-email': 'invalid-email',
  unauthorized: 'unauthorized',
  already: 'already',
  pending: 'pending',
  'billing-off': 'billing-off',
  'payment-provider': 'payment-provider'
}

async function request<T>(method: string, path: string, opts: { body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tz-offset': String(new Date().getTimezoneOffset()),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
  }
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body)
  let status: number
  let text: string
  try {
    // in the desktop app the shell makes the call (no CORS); in a plain browser the page does
    const viaShell = typeof window !== 'undefined' ? window.api?.http?.request : undefined
    if (viaShell) {
      const r = await viaShell({ method, url: `${API}${path}`, headers, body })
      if (!r) throw new Error('the desktop shell could not reach the server (see its terminal for the reason)')
      status = r.status
      text = r.body
    } else {
      const res = await fetch(`${API}${path}`, { method, headers, body })
      status = res.status
      text = await res.text()
    }
  } catch (e) {
    console.error(`MoreCode: ${method} ${API}${path} failed before getting an answer.`, e)
    throw new AuthError('network', `Could not reach MoreCode at ${API || 'the server'}. Check your internet connection and try again.`)
  }
  let data: { error?: { code?: string; message?: string } } = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // not JSON (a gateway error page, say)
  }
  if (status < 200 || status >= 300) {
    throw new AuthError(CODES[data.error?.code ?? ''] ?? 'server', data.error?.message ?? 'Something went wrong. Please try again.')
  }
  return data as T
}

const withKey = (a: Account): Account => ({ ...a, apiKey: read<Record<string, string>>(KEYS, {})[a.id] ?? null })

/** The fields the server accepts back. Anything else (counts, ids, your key) stays where it is owned. */
const sendable = (a: Account): Record<string, unknown> => ({
  name: a.name,
  onboarded: a.onboarded,
  tourSeen: a.tourSeen,
  profile: a.profile,
  project: a.project,
  recents: a.recents,
  plan: a.plan,
  billing: a.billing
})
const lastSent = new Map<string, string>()

function remember(token: string, account: Account): Account {
  const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
  saved.sessions[account.id] = { token, snapshot: { ...account, apiKey: null } }
  saved.current = account.id
  write(SESSIONS, saved)
  lastSent.set(account.id, JSON.stringify(sendable(account)))
  return withKey(account)
}

const currentToken = (): string | null => {
  const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
  return saved.current ? (saved.sessions[saved.current]?.token ?? null) : null
}

/** An authenticated call to the MoreCode server for the signed-in account (chats, shares, feedback). */
export async function hostedRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!HOSTED) throw new AuthError('server', 'This build is not connected to a MoreCode server.')
  return request<T>(method, path, { body, token: currentToken() })
}

/** Keep the saved copy of an account in step with what the server says (after a payment, say). */
function adopt(account: Account): Account {
  const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
  const s = saved.sessions[account.id]
  if (s) {
    s.snapshot = { ...account, apiKey: null }
    write(SESSIONS, saved)
    lastSent.set(account.id, JSON.stringify(sendable(account)))
  }
  return withKey(account)
}

const billing: BillingService = {
  async checkout(plan, yearly) {
    return request<{ url: string; reference: string }>('POST', '/v1/billing/checkout', { token: currentToken(), body: { plan, yearly } })
  },
  async status(reference) {
    const r = await request<{ status: PaymentStatus; account: Account }>('GET', `/v1/billing/status?reference=${encodeURIComponent(reference)}`, { token: currentToken() })
    return { status: r.status, account: adopt(r.account) }
  },
  async cancel() {
    const r = await request<{ account: Account }>('POST', '/v1/billing/cancel', { token: currentToken() })
    return adopt(r.account)
  },
  async cardLink() {
    const r = await request<{ url: string }>('POST', '/v1/billing/portal', { token: currentToken() })
    return r.url
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const httpAuthService: AuthService = {
  hosted: { url: API, token: currentToken },
  billing,

  async restore() {
    const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
    let current: Account | null = null
    if (saved.current && saved.sessions[saved.current]) {
      const s = saved.sessions[saved.current]
      try {
        const { account } = await request<{ account: Account }>('GET', '/v1/me', { token: s.token })
        s.snapshot = { ...account, apiKey: null }
        lastSent.set(account.id, JSON.stringify(sendable(account)))
        current = withKey(account)
      } catch (e) {
        if (e instanceof AuthError && e.code === 'unauthorized') {
          delete saved.sessions[saved.current] // the session ended on the server: sign in again
          saved.current = null
        } else {
          current = withKey(s.snapshot) // offline: open with what we last saw
        }
      }
      write(SESSIONS, saved)
    }
    const others = Object.entries(saved.sessions)
      .filter(([id]) => id !== current?.id)
      .map(([, s]) => withKey(s.snapshot))
    return { current, others }
  },

  async signUp(name, email, password) {
    // the server creates the (unverified) account and sends the code; its reply only says "code sent",
    // so a placeholder carries the details to the next step
    await request('POST', '/v1/auth/signup', { body: { name, email, password } })
    return { id: 'pending', name, email, provider: 'password', verified: false, onboarded: false, tourSeen: false, profile: null, project: null, recents: [], plan: 'free', apiKey: null, sentToday: 0 }
  },

  async verifyEmail(email, code) {
    const { token, account } = await request<{ token: string; account: Account }>('POST', '/v1/auth/verify', { body: { email, code } })
    return remember(token, account)
  },

  async resendCode(email) {
    await request('POST', '/v1/auth/resend', { body: { email } })
  },

  async signIn(email, password) {
    const { token, account } = await request<{ token: string; account: Account }>('POST', '/v1/auth/signin', { body: { email, password } })
    return remember(token, account)
  },

  /**
   * Opens the provider's sign-in page in your normal browser, then waits for the server to say it
   * finished (the browser and the app never share anything except a one-time random id).
   */
  async signInWith(provider) {
    const name = provider === 'google' ? 'Google' : 'GitHub'
    const cfg = await request<{ social: Record<string, boolean> }>('GET', '/v1/config')
    if (!cfg.social[provider]) {
      throw new AuthError('server', `Sign in with ${name} is not set up on this server yet. Use your email instead.`)
    }
    const client = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '').slice(0, 40)
    window.open(`${API}/v1/auth/oauth/${provider}/start?client=${client}`, '_blank')
    const deadline = Date.now() + 3 * 60_000
    while (Date.now() < deadline) {
      await sleep(1500)
      const r = await request<{ pending?: boolean; token?: string; account?: Account }>('POST', '/v1/auth/oauth/poll', { body: { client } })
      if (r.token && r.account) return remember(r.token, r.account)
    }
    throw new AuthError('server', `Sign in with ${name} took too long. Please try again.`)
  },

  async requestReset(email) {
    await request('POST', '/v1/auth/reset/request', { body: { email } })
  },

  async resetPassword(email, code, password) {
    await request('POST', '/v1/auth/reset/confirm', { body: { email, code, password } })
  },

  async signOut() {
    const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
    const id = saved.current
    if (id && saved.sessions[id]) {
      await request('POST', '/v1/auth/signout', { token: saved.sessions[id].token }).catch(() => undefined)
      delete saved.sessions[id] // the token is cancelled, so it cannot be kept for "continue as"
    }
    saved.current = null
    write(SESSIONS, saved)
  },

  async switchTo(id) {
    const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
    const s = saved.sessions[id]
    if (!s) throw new AuthError('not-found', 'That account is no longer available. Sign in again.')
    try {
      const { account } = await request<{ account: Account }>('GET', '/v1/me', { token: s.token })
      return remember(s.token, account)
    } catch (e) {
      if (e instanceof AuthError && e.code === 'unauthorized') {
        delete saved.sessions[id]
        write(SESSIONS, saved)
        throw new AuthError('not-found', 'That sign-in has expired. Sign in again.')
      }
      throw e
    }
  },

  async save(account) {
    // your API key stays on this computer
    const keys = read<Record<string, string>>(KEYS, {})
    if (account.apiKey) keys[account.id] = account.apiKey
    else delete keys[account.id]
    write(KEYS, keys)

    const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
    const s = saved.sessions[account.id]
    const body = JSON.stringify(sendable(account))
    if (s && lastSent.get(account.id) !== body) {
      const { account: fresh } = await request<{ account: Account }>('PATCH', '/v1/me', { token: s.token, body: sendable(account) })
      lastSent.set(account.id, body)
      s.snapshot = { ...fresh, apiKey: null }
      write(SESSIONS, saved)
    }
    return account
  },

  testApiKey: (key) => mockAuthService.testApiKey(key),

  async deleteAccount(id) {
    const saved = read<Saved>(SESSIONS, { current: null, sessions: {} })
    const s = saved.sessions[id]
    if (s) await request('DELETE', '/v1/me', { token: s.token, body: { confirm: true } })
    delete saved.sessions[id]
    if (saved.current === id) saved.current = null
    write(SESSIONS, saved)
    const keys = read<Record<string, string>>(KEYS, {})
    delete keys[id]
    write(KEYS, keys)
  }
}

/** Server accounts when VITE_API_URL is set, built-in demo accounts otherwise. */
// The built-in demo accounts (no server, anyone can pick any plan) are for development only. An installed build
// that was made without a server address says it is not connected instead of handing out plans.
export const defaultAuthService: AuthService =
  HOSTED || import.meta.env.PROD ? httpAuthService : mockAuthService
