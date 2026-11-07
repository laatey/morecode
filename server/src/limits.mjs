/**
 * Usage limits in the style of Claude's: a short "session" window (5 hours) and a weekly window, both counted in
 * tokens. A window starts with the first message after the previous one ended and resets when its time is up.
 * Everything here is pure, so the same rules are used by both databases and by the tests.
 */
export const SESSION_MS = 5 * 3_600_000
export const WEEK_MS = 7 * 86_400_000

/** A model that costs more to run uses the limit up faster. */
const MODEL_WEIGHT = { 'claude-haiku-5-5': 0.25, 'claude-sonnet-5-5': 1, 'claude-opus-5-5': 2 }
export const weightOf = (model) => MODEL_WEIGHT[model] ?? 1

const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0)

/** What one response counts for: input and output tokens, cached input at a tenth, scaled by the model. */
export function costOf(usage, model) {
  const u = usage ?? {}
  const raw = n(u.input_tokens) + n(u.output_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens) * 0.1
  return Math.round(raw * weightOf(model))
}

const EMPTY = { sessionStart: 0, sessionTokens: 0, weekStart: 0, weekTokens: 0 }

/** The row with any window whose time is up emptied. */
export function roll(row, now) {
  const r = { ...EMPTY, ...(row ?? {}) }
  if (r.sessionStart && now >= r.sessionStart + SESSION_MS) { r.sessionStart = 0; r.sessionTokens = 0 }
  if (r.weekStart && now >= r.weekStart + WEEK_MS) { r.weekStart = 0; r.weekTokens = 0 }
  return r
}

/** Begin whichever windows are not running yet. */
export function start(row, now) {
  const r = roll(row, now)
  if (!r.sessionStart) r.sessionStart = now
  if (!r.weekStart) r.weekStart = now
  return r
}

/** null when there is room; otherwise which limit was hit and when it resets (the later one if both were). */
export function blocked(row, now, caps) {
  const r = roll(row, now)
  const hits = []
  if (r.sessionStart && r.sessionTokens >= caps.session) hits.push({ which: 'session', resetsAt: r.sessionStart + SESSION_MS })
  if (r.weekStart && r.weekTokens >= caps.week) hits.push({ which: 'week', resetsAt: r.weekStart + WEEK_MS })
  return hits.sort((a, b) => b.resetsAt - a.resetsAt)[0] ?? null
}

export function addTokens(row, tokens, now) {
  const r = start(row, now)
  r.sessionTokens += tokens
  r.weekTokens += tokens
  return r
}

/** What the app shows: how full each window is and when it resets (null until it has started). */
export function view(row, now, caps) {
  const r = roll(row, now)
  const part = (used, cap, startedAt, length) => ({
    // anything used shows as at least 1%, so a bar never looks untouched after a message
    percent: cap > 0 && used > 0 ? Math.min(100, Math.max(1, Math.round((used / cap) * 100))) : 0,
    resetsAt: startedAt ? startedAt + length : null
  })
  return { session: part(r.sessionTokens, caps.session, r.sessionStart, SESSION_MS), week: part(r.weekTokens, caps.week, r.weekStart, WEEK_MS) }
}

/** Reads token counts out of a streamed (or plain JSON) answer as it passes through, without holding on to it. */
export function usageReader(streaming) {
  const seen = {}
  let rest = ''
  let whole = ''
  const take = (u) => {
    if (!u || typeof u !== 'object') return
    for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
      if (Number.isFinite(u[k])) seen[k] = Math.max(seen[k] ?? 0, u[k])
    }
  }
  const line = (l) => {
    if (!l.startsWith('data:')) return
    try {
      const ev = JSON.parse(l.slice(5))
      if (ev.type === 'message_start') take(ev.message?.usage)
      else if (ev.type === 'message_delta') take(ev.usage)
    } catch {
      // a line that is not JSON carries no counts
    }
  }
  return {
    feed(chunk) {
      const s = chunk.toString('utf8')
      if (!streaming) {
        if (whole.length < 5_000_000) whole += s
        return
      }
      rest += s
      const lines = rest.split('\n')
      rest = lines.pop() ?? ''
      lines.forEach(line)
    },
    done() {
      if (streaming) line(rest)
      else {
        try {
          take(JSON.parse(whole).usage)
        } catch {
          // not JSON: nothing to count
        }
      }
      return seen
    }
  }
}
