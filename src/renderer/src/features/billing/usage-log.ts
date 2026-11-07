/**
 * What the AI has really used, recorded from the token counts the API reports after every step.
 * Kept per account on this computer. The Usage and Context panels read from here.
 */

export interface UsageRecord {
  t: number
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** How full the context window was for that step. */
  context: number
  ms: number
}

export interface Totals {
  requests: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  ms: number
}

const key = (accountId: string): string => `morecode:usage:v1:${accountId}`
const KEEP_MS = 30 * 24 * 3_600_000
const MAX_RECORDS = 3000

/** Context-window size after each chat's most recent step, so every chat shows its own. Kept across restarts. */
const CONTEXT_KEY = 'morecode:context:v1'
const MAX_CONTEXTS = 200
const contexts: Map<string, number> = (() => {
  try {
    const raw = localStorage.getItem(CONTEXT_KEY)
    return new Map<string, number>(raw ? (Object.entries(JSON.parse(raw)) as [string, number][]) : [])
  } catch {
    return new Map<string, number>()
  }
})()
let version = 0
const listeners = new Set<() => void>()
export interface SessionEditTotals {
  added: number
  removed: number
}

/**
 * "This session" is kept on disk, so a restart or reload does not wipe it. It carries on until the
 * person has been away for SESSION_IDLE_MS, then the next step starts a fresh one.
 */
const SESSION_IDLE_MS = 6 * 3_600_000
/** A gap longer than this between two steps is time away, not time working. */
const ACTIVE_GAP_MS = 5 * 60_000
const MAX_SESSION_EDITS = 500
const sessionKey = (accountId: string): string => `morecode:session:v1:${accountId}`

interface SessionState {
  start: number
  last: number
  /** Milliseconds spent working in this session. */
  active: number
  edits: Record<string, SessionEditTotals>
}

const sessions = new Map<string, SessionState>()

function saveSession(accountId: string, s: SessionState): void {
  try {
    localStorage.setItem(sessionKey(accountId), JSON.stringify(s))
  } catch {
    // storage full: the numbers on screen still update until the app closes
  }
}

function readSession(accountId: string): SessionState | null {
  try {
    const raw = localStorage.getItem(sessionKey(accountId))
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<SessionState>
    if (typeof s.start !== 'number' || typeof s.last !== 'number') return null
    return { start: s.start, last: s.last, active: typeof s.active === 'number' ? s.active : 0, edits: s.edits ?? {} }
  } catch {
    return null
  }
}

/** This account's current session: loaded from disk, or started now if there is none or it has gone stale. */
function currentSession(accountId: string, now = Date.now()): SessionState {
  let s = sessions.get(accountId) ?? readSession(accountId)
  if (!s || now - s.last > SESSION_IDLE_MS) {
    s = { start: now, last: now, active: 0, edits: {} }
    saveSession(accountId, s)
  }
  sessions.set(accountId, s)
  return s
}

/** Something happened: the session is still alive, and the time since the last step counts as active. */
function touchSession(accountId: string, now = Date.now()): SessionState {
  const s = currentSession(accountId, now)
  s.active += Math.min(Math.max(0, now - s.last), ACTIVE_GAP_MS)
  s.last = now
  return s
}

function notify(): void {
  version++
  listeners.forEach((l) => l())
}

/** Count each applied edit once for this session; undoing it removes its contribution. */
export function recordSessionEdit(accountId: string, id: string, added: number, removed: number): void {
  const s = touchSession(accountId)
  if (s.edits[id]) return
  s.edits[id] = { added, removed }
  const ids = Object.keys(s.edits)
  // oldest first: drop the earliest ones if a very long session piles up
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_SESSION_EDITS))) delete s.edits[old]
  saveSession(accountId, s)
  notify()
}

export function forgetSessionEdit(accountId: string, id: string): void {
  const s = currentSession(accountId)
  if (!s.edits[id]) return
  delete s.edits[id]
  saveSession(accountId, s)
  notify()
}

export function getSessionEditTotals(accountId: string): SessionEditTotals {
  const totals = { added: 0, removed: 0 }
  for (const edit of Object.values(currentSession(accountId).edits)) {
    totals.added += edit.added
    totals.removed += edit.removed
  }
  return totals
}

export function load(accountId: string): UsageRecord[] {
  try {
    const raw = localStorage.getItem(key(accountId))
    return raw ? (JSON.parse(raw) as UsageRecord[]) : []
  } catch {
    return []
  }
}

export function recordUsage(accountId: string, r: Omit<UsageRecord, 't'>, chatId?: string): void {
  const now = Date.now()
  saveSession(accountId, touchSession(accountId, now))
  const all = [...load(accountId), { ...r, t: now }].filter((x) => now - x.t < KEEP_MS).slice(-MAX_RECORDS)
  try {
    localStorage.setItem(key(accountId), JSON.stringify(all))
  } catch {
    // storage full: the numbers on screen still update for this session
  }
  if (chatId) {
    contexts.delete(chatId)
    contexts.set(chatId, r.context)
    while (contexts.size > MAX_CONTEXTS) contexts.delete(contexts.keys().next().value as string)
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(Object.fromEntries(contexts)))
    } catch {
      // not being able to remember it across restarts is harmless
    }
  }
  notify()
}

/** Re-render panels that are open while the AI works. */
export function subscribeUsage(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Changes every time a step is recorded; lets panels re-render with useSyncExternalStore. */
export const getUsageVersion = (): number => version

/** Tokens in this chat's context window after its most recent step (0 before it has run). */
export const getLastContext = (chatId: string): number => contexts.get(chatId) ?? 0

export const emptyTotals = (): Totals => ({ requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 })

const add = (t: Totals, r: UsageRecord): Totals => ({
  requests: t.requests + 1,
  input: t.input + r.input,
  output: t.output + r.output,
  cacheRead: t.cacheRead + r.cacheRead,
  cacheWrite: t.cacheWrite + r.cacheWrite,
  ms: t.ms + r.ms
})

export interface UsageSummary {
  session: Totals
  edits: SessionEditTotals
  today: Totals
  week: Totals
  byModel: Record<string, Totals>
  /** Share of this session's steps that ran with more than 150k tokens of context. */
  longContextShare: number
  sessionStart: number
  /** Time spent working in this session, in milliseconds. */
  activeMs: number
}

export function summarize(accountId: string, now = Date.now()): UsageSummary {
  const records = load(accountId)
  const session = currentSession(accountId, now)
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const weekAgo = now - 7 * 24 * 3_600_000
  const out: UsageSummary = {
    session: emptyTotals(),
    edits: getSessionEditTotals(accountId),
    today: emptyTotals(),
    week: emptyTotals(),
    byModel: {},
    longContextShare: 0,
    sessionStart: session.start,
    activeMs: session.active
  }
  let long = 0
  for (const r of records) {
    if (r.t >= session.start) {
      out.session = add(out.session, r)
      out.byModel[r.model] = add(out.byModel[r.model] ?? emptyTotals(), r)
      if (r.context > 150_000) long++
    }
    if (r.t >= startOfDay.getTime()) out.today = add(out.today, r)
    if (r.t >= weekAgo) out.week = add(out.week, r)
  }
  out.longContextShare = out.session.requests ? Math.round((long / out.session.requests) * 100) : 0
  return out
}

/** Everything the cache served as a share of everything the model read. */
export const cacheHitRate = (t: Totals): number => {
  const total = t.input + t.cacheRead + t.cacheWrite
  return total ? Math.round((t.cacheRead / total) * 100) : 0
}
