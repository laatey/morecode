import type { Account } from '@/features/auth/auth-service'

export const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The daily count starts again each day. */
export const rollDay = (a: Account): Account =>
  a.sentDate === dayKey() ? a : { ...a, sentToday: 0, sentDate: dayKey() }

export interface DayUsage {
  key: string
  label: string
  count: number
  today: boolean
}

/** Small deterministic number from a string, so sample history stays the same between renders. */
const seeded = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

/**
 * Messages per day for the last `days` days. Today and any days you really used come from the
 * account. Earlier days are SAMPLE numbers; return real history from your backend here.
 */
export function getUsageHistory(account: Account, days = 14): DayUsage[] {
  const out: DayUsage[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = dayKey(d)
    const real = account.usage?.[key]
    const sample = Math.round(seeded(account.id + key) * 22 * (d.getDay() % 6 === 0 ? 0.3 : 1))
    out.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      count: i === 0 ? (account.usage?.[key] ?? account.sentToday) : (real ?? sample),
      today: i === 0
    })
  }
  return out
}
