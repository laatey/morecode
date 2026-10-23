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

/** Messages per day for the last `days` days. Only recorded usage is shown—never invented data. */
export function getUsageHistory(account: Account, days = 14): DayUsage[] {
  const out: DayUsage[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = dayKey(d)
    const real = account.usage?.[key]
    out.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      count: i === 0 ? (account.usage?.[key] ?? account.sentToday) : (real ?? 0),
      today: i === 0
    })
  }
  return out
}
