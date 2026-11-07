import type { Account } from '@/features/auth/auth-service'
import { LIMIT_LABEL, resetsIn, windowOf } from '@/features/billing/limits'
import { cacheHitRate, getLastContext, summarize, type Totals } from '@/features/billing/usage-log'

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

export function getUsageSnapshot(account: Account | null, modelName: string): UsageSnapshot {
  const log = summarize(account?.id ?? 'guest')
  const s: Totals = log?.session ?? { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 }

  let limits: PlanLimit[] = []
  let limitsNote: string | undefined
  if (account && !account.apiKey) {
    // the server counts both windows; with no server there is nothing to measure
    limits = (['session', 'week'] as const).flatMap((kind) => {
      const w = windowOf(account, kind)
      return w ? [{ id: kind, label: LIMIT_LABEL[kind], percent: w.percent, resets: resetsIn(w.resetsAt) }] : []
    })
  } else if (account) {
    limitsNote = 'You are using your own API key, so there is no usage limit. Your provider bills you directly.'
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
      activeTime: duration(log.activeMs),
      added: log.edits.added,
      removed: log.edits.removed,
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
export function getContextRows(chatId: string): {
  rows: ContextRow[]
  buffer: number
  used: number
  free: number
} {
  const total = getLastContext(chatId)
  const fixed = SYSTEM_PROMPT_TOKENS + TOOLS_TOKENS
  const rows: ContextRow[] = [
    { id: 'messages', label: 'Messages', tokens: Math.max(0, total - fixed), color: 'bg-primary' },
    { id: 'system-tools', label: 'Tools', tokens: TOOLS_TOKENS, color: 'bg-primary' },
    { id: 'system-prompt', label: 'Instructions', tokens: SYSTEM_PROMPT_TOKENS, color: 'bg-primary' }
  ]
  const used = rows.reduce((n, r) => n + r.tokens, 0)
  return { rows, buffer: REPLY_RESERVE, used, free: Math.max(0, CONTEXT_WINDOW - used - REPLY_RESERVE) }
}
