import type { Account, LimitWindow } from '@/features/auth/auth-service'

/**
 * Two usage windows, like Claude's: a 5-hour session and a week. Each starts with your first message after the last
 * one ended and resets when its time is up. The server counts and enforces them; this only describes them.
 */
export type LimitKind = 'session' | 'week'

export const LIMIT_LABEL: Record<LimitKind, string> = { session: '5-hour limit', week: 'Weekly limit' }

/** A window whose reset time has passed is empty again, even if the account has not been refreshed yet. */
export function windowOf(account: Account | null, kind: LimitKind, now = Date.now()): LimitWindow | null {
  if (!account || account.apiKey || !account.limits) return null
  const w = account.limits[kind]
  return w.resetsAt !== null && w.resetsAt <= now ? { percent: 0, resetsAt: null } : w
}

/** Which limit is full right now, if any (the one that resets later when both are). */
export function limitHit(account: Account | null, now = Date.now()): { kind: LimitKind; resetsAt: number } | null {
  const hits = (['session', 'week'] as const)
    .map((kind) => ({ kind, w: windowOf(account, kind, now) }))
    .filter((x) => x.w && x.w.percent >= 100 && x.w.resetsAt !== null)
    .map((x) => ({ kind: x.kind, resetsAt: x.w!.resetsAt as number }))
  return hits.sort((a, b) => b.resetsAt - a.resetsAt)[0] ?? null
}

/** "in 2 hr 10 min" for something close, "Thu 9:00 am" for later; a window not started yet says so. */
export function resetsIn(resetsAt: number | null, now = Date.now()): string {
  if (resetsAt === null) return 'Starts with your next message'
  const mins = Math.max(1, Math.ceil((resetsAt - now) / 60_000))
  if (mins < 60) return `Resets in ${mins} min`
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `Resets in ${h} hr${m ? ` ${m} min` : ''}`
  }
  return `Resets ${new Date(resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
}
