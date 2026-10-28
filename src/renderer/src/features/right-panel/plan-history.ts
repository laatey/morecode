import { useCallback, useSyncExternalStore } from 'react'

/**
 * Every plan the AI has made, kept between launches so an old plan can be read again and re-run.
 * Plans are matched by chat + plan id, because plan ids alone repeat from one launch to the next.
 */
export interface SavedPlan {
  key: string
  title: string
  summary: string
  steps: string[]
  state: 'draft' | 'approved'
  /** When the plan first appeared. */
  at: number
}

export interface PlanInput {
  id: string
  title: string
  summary: string
  steps: string[]
  state: 'draft' | 'approved'
}

const KEY = 'morecode:plan-history:v1'
const MAX_PLANS = 30
const listeners = new Set<() => void>()
let cache: { raw: string | null; list: SavedPlan[] } = { raw: null, list: [] }

function read(): SavedPlan[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return cache.list
  }
  if (raw === cache.raw) return cache.list
  let list: SavedPlan[] = []
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    if (Array.isArray(parsed)) {
      list = parsed.filter(
        (p): p is SavedPlan =>
          Boolean(p) && typeof p.key === 'string' && typeof p.title === 'string' && Array.isArray(p.steps)
      )
    }
  } catch {
    list = []
  }
  cache = { raw, list }
  return list
}

function write(list: SavedPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PLANS)))
  } catch {
    // storage full: history just stops growing
  }
  listeners.forEach((l) => l())
}

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const planKey = (chatId: string, planId: string): string => `${chatId}:${planId}`

/** Add new plans and refresh ones that changed (for example once approved). Newest first. */
export function recordPlans(chatId: string, plans: PlanInput[]): void {
  const list = read()
  let next = list
  for (const p of plans) {
    const key = planKey(chatId, p.id)
    const seen = next.find((x) => x.key === key)
    if (!seen) {
      next = [{ key, title: p.title, summary: p.summary, steps: p.steps, state: p.state, at: Date.now() }, ...next]
    } else if (seen.state !== p.state && p.state === 'approved') {
      next = next.map((x) => (x.key === key ? { ...x, state: p.state } : x))
    }
  }
  if (next !== list) write(next)
}

/** Remember the steps as the person edited them, so "run again" repeats what actually ran. */
export function updatePlanSteps(chatId: string, planId: string, steps: string[]): void {
  const key = planKey(chatId, planId)
  write(read().map((x) => (x.key === key ? { ...x, steps } : x)))
}

export function usePlanHistory(): {
  plans: SavedPlan[]
  remove: (key: string) => void
  clear: () => void
} {
  const plans = useSyncExternalStore(subscribe, read, read)
  const remove = useCallback((key: string) => write(read().filter((p) => p.key !== key)), [])
  const clear = useCallback(() => write([]), [])
  return { plans, remove, clear }
}

/** The message sent to the AI to carry out a plan. Used by Approve and by Run again. */
export const planPrompt = (steps: string[]): string =>
  `Go ahead with this plan:\n${steps.map((s, i) => `${i + 1}. ${s.replace(/^\s*(?:step\s*)?\d+[.):-]\s*/i, '')}`).join('\n')}`
