import type { Account } from '@/features/auth/auth-service'
import { dayKey } from '@/features/billing/usage'
import { getPlan } from '@/features/billing/plans'
import { cacheHitRate, getLastContext, summarize, type Totals } from '@/features/billing/usage-log'
import type { ChatTotals } from '../use-chat'

/** What the Usage and Context panels show, built from the real usage log and the account's plan. */

export interface PlanLimit {
  id: string
  label: string
  percent: number
  resets: string
}

export interface UsageSnapshot {
  limits: PlanLimit[]
  /** Shown instead of limits when there are none (for example with your own API key). */
  limitsNote?: string
  session: {
    requests: number
    apiTime: string
    activeTime: string
    added: number
    removed: number
    modelName: string
    modelShare: number
    cacheHit: number
  }
  breakdown: { label: string; value: string; hint: string }[]
  drivers: { id: string; percent: number; label: string; hint: string }[]
  tip: string
}

const tokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export const duration = (ms: number): string => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** "Resets in 3 hr 12 min": time left until local midnight, when the daily count starts again. */
function untilMidnight(now = new Date()): string {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const mins = Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 60_000))
  return `Resets in ${Math.floor(mins / 60)} hr ${mins % 60} min`
}

const pct = (n: number, of: number): number => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0)

export function getUsageSnapshot(account: Account | null, modelName: string, totals: ChatTotals): UsageSnapshot {
  const log = account ? summarize(account.id) : null
  const s: Totals = log?.session ?? { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 }

  let limits: PlanLimit[] = []
  let limitsNote: string | undefined
  if (account && !account.apiKey) {
    const plan = getPlan(account.plan)
    let week = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      week += i === 0 ? account.sentToday : (account.usage?.[dayKey(d)] ?? 0)
    }
    limits = [
      { id: 'today', label: 'Daily messages', percent: pct(account.sentToday, plan.dailyMessages), resets: untilMidnight() },
      { id: 'week', label: 'Last 7 days', percent: pct(week, plan.dailyMessages * 7), resets: `${week} messages` }
    ]
  } else if (account) {
    limitsNote = 'You are using your own API key, so there is no daily message limit. Your provider bills you directly.'
  }

  const modelRequests = log?.byModel
    ? Object.entries(log.byModel).find(([id]) => modelName.toLowerCase().includes(id.split('-')[1] ?? '#'))?.[1].requests ?? 0
    : 0

  return {
    limits,
    limitsNote,
    session: {
      requests: s.requests,
      apiTime: duration(s.ms),
      activeTime: duration(Date.now() - (log?.sessionStart ?? Date.now())),
      added: totals.added,
      removed: totals.removed,
      modelName,
      modelShare: s.requests ? Math.round((modelRequests / s.requests) * 100) : 0,
      cacheHit: cacheHitRate(s)
    },
    breakdown: [
      { label: 'Input', value: tokens(s.input), hint: 'New text sent that was not already saved' },
      { label: 'Output', value: tokens(s.output), hint: 'Text the AI wrote back' },
      { label: 'Cache read', value: tokens(s.cacheRead), hint: 'Earlier context reused at a lower cost' },
      { label: 'Cache write', value: tokens(s.cacheWrite), hint: 'Context saved so it can be reused later' }
    ],
    drivers: s.requests
      ? [
          {
            id: 'long-context',
            percent: log?.longContextShare ?? 0,
            label: 'of steps ran above 150k context',
            hint: 'Long chats cost more on every message. Use /compact or /clear to keep them short.'
          },
          {
            id: 'cache',
            percent: cacheHitRate(s),
            label: 'of what the AI read came from cache',
            hint: 'Higher is cheaper: repeated context is billed at a lower rate.'
          }
        ]
      : [],
    tip:
      (log?.longContextShare ?? 0) > 50
        ? 'This chat is very long. Run /compact in the middle of a task, and /clear when you switch to something new.'
        : 'Short, focused chats use less. Start a new chat when you move on to something different.'
  }
}

export interface ContextRow {
  id: string
  label: string
  tokens: number
  /** Tailwind background class for the swatch and bar segment. */
  color: string
  /** Deferred rows are not part of what is used. */
  deferred?: boolean
}

export const CONTEXT_WINDOW = 200_000
/** Rough size of the fixed instructions and tool list sent with every step (an estimate). */
const SYSTEM_PROMPT_TOKENS = 900
const TOOLS_TOKENS = 1500
/** Room kept free for the AI's own reply. */
const REPLY_RESERVE = 8192

/** How full the context window is. Total is what the API reported for the latest step. */
export function getContextRows(_totals?: ChatTotals): {
  rows: ContextRow[]
  buffer: number
  used: number
  free: number
} {
  const total = getLastContext()
  const fixed = SYSTEM_PROMPT_TOKENS + TOOLS_TOKENS
  const rows: ContextRow[] = [
    { id: 'messages', label: 'Messages', tokens: Math.max(0, total - fixed), color: 'bg-[#4f7fd9]' },
    { id: 'system-tools', label: 'Tools', tokens: TOOLS_TOKENS, color: 'bg-[#6a97e6]' },
    { id: 'system-prompt', label: 'Instructions', tokens: SYSTEM_PROMPT_TOKENS, color: 'bg-[#c9d8f8]' }
  ]
  const used = rows.reduce((n, r) => n + r.tokens, 0)
  return { rows, buffer: REPLY_RESERVE, used, free: Math.max(0, CONTEXT_WINDOW - used - REPLY_RESERVE) }
}
