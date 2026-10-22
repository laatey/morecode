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

/** When this run of the app started: "this session" means since then. */
const sessionStart = Date.now()
let lastContext = 0
let version = 0
const listeners = new Set<() => void>()

export function load(accountId: string): UsageRecord[] {
  try {
    const raw = localStorage.getItem(key(accountId))
    return raw ? (JSON.parse(raw) as UsageRecord[]) : []
  } catch {
    return []
  }
}

export function recordUsage(accountId: string, r: Omit<UsageRecord, 't'>): void {
  const now = Date.now()
  const all = [...load(accountId), { ...r, t: now }].filter((x) => now - x.t < KEEP_MS).slice(-MAX_RECORDS)
  try {
    localStorage.setItem(key(accountId), JSON.stringify(all))
  } catch {
    // storage full: the numbers on screen still update for this session
  }
  lastContext = r.context
  version++
  listeners.forEach((l) => l())
}

/** Re-render panels that are open while the AI works. */
export function subscribeUsage(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Changes every time a step is recorded; lets panels re-render with useSyncExternalStore. */
export const getUsageVersion = (): number => version

/** Tokens in the context window after the most recent step (0 before anything has run). */
export const getLastContext = (): number => lastContext

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
  today: Totals
  week: Totals
  byModel: Record<string, Totals>
  /** Share of this session's steps that ran with more than 150k tokens of context. */
  longContextShare: number
  sessionStart: number
}

export function summarize(accountId: string, now = Date.now()): UsageSummary {
  const records = load(accountId)
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const weekAgo = now - 7 * 24 * 3_600_000
  const out: UsageSummary = {
    session: emptyTotals(),
    today: emptyTotals(),
    week: emptyTotals(),
    byModel: {},
    longContextShare: 0,
    sessionStart
  }
  let long = 0
  for (const r of records) {
    if (r.t >= sessionStart) {
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
