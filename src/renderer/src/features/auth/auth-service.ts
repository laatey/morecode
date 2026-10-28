import type { PlanId } from '../billing/plans'

/**
 * MOCK HOSTED-ACCOUNT BACKEND. Everything is stored in this browser's localStorage and every call
 * is slowed down a little so loading states are visible. To go live, implement `AuthService`
 * against your real API and pass it to <AuthProvider service={...}>; no screen needs to change.
 */

export type Experience = 'new' | 'some' | 'pro'
export type Goal = 'website' | 'app' | 'api' | 'script' | 'learn' | 'other'

export interface Project {
  name: string
  /** Folder on disk, or empty for a project that has not been saved yet. */
  path: string
}

export interface Profile {
  goals: Goal[]
  experience: Experience
}

export interface Card {
  brand: string
  last4: string
  exp: string
}

export interface Invoice {
  id: string
  date: number
  description: string
  /** In whole units of `currency` (so 250.5 is GH₵250.50). */
  amount: number
  /** ISO code such as GHS or USD. Older demo invoices have none and are US dollars. */
  currency?: string
}

export interface Billing {
  card: Card | null
  yearly: boolean
  /** When the current plan renews, or null on Free. */
  renews: number | null
  invoices: Invoice[]
  /** The plan has been cancelled and ends on `renews`. */
  cancelling?: boolean
  /** The last renewal payment failed. The plan keeps working for a few days. */
  pastDue?: boolean
  currency?: string
}

export const EMPTY_BILLING: Billing = { card: null, yearly: false, renews: null, invoices: [] }

export interface Account {
  id: string
  name: string
  email: string
  provider: 'password' | 'google' | 'github'
  verified: boolean
  onboarded: boolean
  tourSeen: boolean
  profile: Profile | null
  project: Project | null
  recents: Project[]
  plan: PlanId
  /** Own API key, if the person chose to bring one. */
  apiKey: string | null
  /** Messages sent today on this plan, for the daily limit demo. */
  sentToday: number
  /** Day (YYYY-MM-DD) that `sentToday` belongs to. */
  sentDate?: string
  /** Messages sent per day, for the usage history. */
  usage?: Record<string, number>
  billing?: Billing
}

export type AuthErrorCode =
  | 'exists'
  | 'not-found'
  | 'bad-password'
  | 'bad-code'
  | 'weak-password'
  | 'invalid-email'
  | 'bad-key'
  | 'network'
  | 'server'
  | 'unauthorized'
  | 'already'
  | 'pending'
  | 'billing-off'
  | 'payment-provider'

export class AuthError extends Error {
  code: AuthErrorCode
  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** How this server takes payment, and what the plans cost in its currency. */
export interface BillingConfig {
  /** paystack = real payments; demo = plans change with no payment; off = plan changes unavailable. */
  billing: 'paystack' | 'demo' | 'off'
  currency: string
  /** Price per month in whole currency units. `yearly` is the per-month price when paid for a year. */
  prices: Record<'pro' | 'max', { monthly: number; yearly: number }>
}

export type PaymentStatus = 'success' | 'pending' | 'failed' | 'rejected' | 'unknown'

/** Payments on the MoreCode server. Card details are typed on the payment page, never in this app. */
export interface BillingService {
  checkout(plan: 'pro' | 'max', yearly: boolean): Promise<{ url: string; reference: string }>
  status(reference: string): Promise<{ status: PaymentStatus; account: Account }>
  /** Stops renewing. The plan stays until the end of the period already paid for. */
  cancel(): Promise<Account>
  /** A page where the card for the subscription can be changed. */
  cardLink(): Promise<string>
}

export interface AuthService {
  restore(): Promise<{ current: Account | null; others: Account[] }>
  signUp(name: string, email: string, password: string): Promise<Account>
  verifyEmail(email: string, code: string): Promise<Account>
  resendCode(email: string): Promise<void>
  signIn(email: string, password: string): Promise<Account>
  signInWith(provider: 'google' | 'github'): Promise<Account>
  requestReset(email: string): Promise<void>
  resetPassword(email: string, code: string, password: string): Promise<void>
  signOut(): Promise<void>
  switchTo(id: string): Promise<Account>
  save(account: Account): Promise<Account>
  testApiKey(key: string): Promise<void>
  /** Permanently remove the account and its sign-in details. */
  deleteAccount(id: string): Promise<void>
  /** Present when accounts live on a server: where it is and the current sign-in token. */
  hosted?: { url: string; token(): string | null }
  /** Present when accounts live on a server that takes payments. */
  billing?: BillingService
}

/** The demo accepts this code for both email verification and password reset. */
export const DEMO_CODE = '123456'

const KEY = 'morecode:accounts:v1'
const wait = (ms = 700): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Store {
  accounts: Account[]
  passwords: Record<string, string>
  current: string | null
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  return { accounts: [], passwords: {}, current: null }
}

function persist(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full or blocked; the session still works until reload
  }
}

export const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

const blank = (
  name: string,
  email: string,
  provider: Account['provider'],
  verified: boolean
): Account => ({
  id: crypto.randomUUID().slice(0, 8),
  name,
  email: email.trim().toLowerCase(),
  provider,
  verified,
  onboarded: false,
  tourSeen: false,
  profile: null,
  project: null,
  recents: [],
  plan: 'free',
  apiKey: null,
  sentToday: 0
})

export const mockAuthService: AuthService = {
  async restore() {
    const s = load()
    const current = s.accounts.find((a) => a.id === s.current && a.verified) ?? null
    return { current, others: s.accounts.filter((a) => a.verified && a.id !== current?.id) }
  },

  async signUp(name, email, password) {
    await wait()
    const s = load()
    if (!isEmail(email)) throw new AuthError('invalid-email', 'Enter a valid email address.')
    if (password.length < 8) throw new AuthError('weak-password', 'Use at least 8 characters.')
    const existing = s.accounts.find((a) => a.email === email.trim().toLowerCase())
    if (existing?.verified) {
      throw new AuthError(
        'exists',
        'An account with this email already exists. Try signing in instead.'
      )
    }
    const account = existing ?? blank(name.trim(), email, 'password', false)
    account.name = name.trim()
    s.accounts = [...s.accounts.filter((a) => a.id !== account.id), account]
    s.passwords[account.id] = password
    persist(s)
    return account
  },

  async verifyEmail(email, code) {
    await wait(600)
    const s = load()
    const account = s.accounts.find((a) => a.email === email.trim().toLowerCase())
    if (!account) throw new AuthError('not-found', 'We could not find that account.')
    if (code !== DEMO_CODE) {
      throw new AuthError('bad-code', 'That code is not right. Check it and try again.')
    }
    account.verified = true
    s.current = account.id
    persist(s)
    return account
  },

  async resendCode() {
    await wait(500)
  },

  async signIn(email, password) {
    await wait()
    const s = load()
    const account = s.accounts.find((a) => a.email === email.trim().toLowerCase() && a.verified)
    if (!account || s.passwords[account.id] !== password) {
      // one message for both cases, so nobody can probe which emails have accounts
      throw new AuthError('bad-password', 'The email or password is not right.')
    }
    s.current = account.id
    persist(s)
    return account
  },

  async signInWith(provider) {
    await wait(1100)
    const s = load()
    const email = `you@${provider}.demo`
    let account = s.accounts.find((a) => a.email === email)
    if (!account) {
      account = blank(provider === 'google' ? 'Google User' : 'GitHub User', email, provider, true)
      s.accounts.push(account)
    }
    s.current = account.id
    persist(s)
    return account
  },

  async requestReset(email) {
    await wait()
    if (!isEmail(email)) throw new AuthError('invalid-email', 'Enter a valid email address.')
    // always succeeds, whether or not the account exists
  },

  async resetPassword(email, code, password) {
    await wait()
    if (code !== DEMO_CODE) {
      throw new AuthError('bad-code', 'That code is not right. Check it and try again.')
    }
    if (password.length < 8) throw new AuthError('weak-password', 'Use at least 8 characters.')
    const s = load()
    const account = s.accounts.find((a) => a.email === email.trim().toLowerCase())
    if (account) {
      s.passwords[account.id] = password
      persist(s)
    }
  },

  async signOut() {
    const s = load()
    s.current = null
    persist(s)
  },

  async switchTo(id) {
    await wait(300)
    const s = load()
    const account = s.accounts.find((a) => a.id === id)
    if (!account) throw new AuthError('not-found', 'That account is no longer available.')
    s.current = id
    persist(s)
    return account
  },

  async save(account) {
    const s = load()
    s.accounts = s.accounts.map((a) => (a.id === account.id ? account : a))
    persist(s)
    return account
  },

  async deleteAccount(id) {
    await wait(900)
    const s = load()
    s.accounts = s.accounts.filter((a) => a.id !== id)
    delete s.passwords[id]
    if (s.current === id) s.current = null
    persist(s)
  },

  async testApiKey(key) {
    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key.trim())) {
      throw new AuthError('bad-key', 'That does not look like a valid key. Keys start with “sk-”.')
    }
    // in the desktop app, make a tiny real request so a wrong or expired key is caught now
    const test = typeof window !== 'undefined' ? window.api?.agent?.testProvider : undefined
    if (test) {
      const r = await test({ provider: 'anthropic', key: key.trim() })
      if (!r.ok) throw new AuthError('bad-key', r.message ?? 'That key was not accepted.')
    } else {
      await wait(600)
    }
  }
}
