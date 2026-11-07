import type { ApiMessage, ContentBlock } from './anthropic'

/** How many of the newest browser results are sent in full. Older ones are stubbed out. */
export const BROWSER_KEEP = 2

const STUB = '(older page snapshot left out to save tokens; the newest snapshot is below)'

/**
 * Every browser action returns the whole page (text, element list, sometimes a screenshot), and the full history is
 * sent again on each step, so a long browsing task grows quickly. Element refs change on every snapshot, so an old
 * snapshot is of no use to the AI anyway. This returns a copy of the history with all but the newest few browser
 * results shortened. Errors are kept as they are because they are short and explain what went wrong.
 */
export function slimBrowserResults(messages: ApiMessage[], keep = BROWSER_KEEP): ApiMessage[] {
  const browserIds = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const b of m.content) if (b.type === 'tool_use' && b.name.startsWith('browser_')) browserIds.add(b.id)
  }
  const spots: string[] = []
  messages.forEach((m, mi) => {
    if (m.role !== 'user' || !Array.isArray(m.content)) return
    m.content.forEach((b, bi) => {
      if (b.type === 'tool_result' && browserIds.has(b.tool_use_id) && !b.is_error) spots.push(`${mi}:${bi}`)
    })
  })
  const old = new Set(spots.slice(0, Math.max(0, spots.length - keep)))
  if (!old.size) return messages
  return messages.map((m, mi) => {
    if (m.role !== 'user' || !Array.isArray(m.content)) return m
    return {
      ...m,
      content: m.content.map((b, bi): ContentBlock => {
        if (b.type !== 'tool_result' || !old.has(`${mi}:${bi}`)) return b
        return { ...b, content: STUB }
      })
    }
  })
}

/** Shown when one reply is still too long after the app has quietly asked the AI to carry on a few times. */
export const CUT_OFF_NOTICE = '(I ran out of room for this answer. Ask me to continue and I will pick up where I stopped.)'
/** Shown when a request used every step it is allowed. */
export const STEPS_NOTICE = '(I stopped after many steps. Tell me to keep going if you want me to continue.)'

/** Sent to the AI (not shown) when its reply hit the length limit, so it carries on instead of starting over. */
export const CUT_OFF_NUDGE =
  'Your last reply was cut off because it reached the length limit for a single reply. A tool call that was cut off did not run. ' +
  'Carry on from exactly where you stopped. Do not start over and do not re-read files you already read: their contents are above. ' +
  'Keep each reply shorter: think briefly, and write a big file in smaller pieces (write_file for the first part, then edit_file to add the rest).'

/** What was in the reply that got cut off, so the AI is told what to do differently. */
export interface CutInfo {
  /** The tool call that was cut off half way, if any. */
  call?: { name: string; path?: string }
  /** The reply had no visible text and no complete tool call: it was all hidden thinking. */
  onlyThinking: boolean
}

export function cutOffInfo(content: ContentBlock[]): CutInfo {
  const cut = content.find(isCutCall)
  const visible = content.some((b) => (b.type === 'text' && b.text.trim()) || (b.type === 'tool_use' && !isCutCall(b)))
  const inp = cut && cut.type === 'tool_use' ? (cut.input as { __path?: string }) : undefined
  return { call: cut && cut.type === 'tool_use' ? { name: cut.name, path: inp?.__path } : undefined, onlyThinking: !visible && !cut }
}

/** The note sent to the AI (not shown) after a cut-off, specific to what was cut. */
export function cutOffNudgeFor(info: CutInfo): string {
  const keep = 'Carry on from exactly where you stopped. Do not start over and do not re-read files you already read: their contents are above.'
  if (info.call && (info.call.name === 'write_file' || info.call.name === 'edit_file')) {
    const f = info.call.path ? `"${info.call.path}"` : 'a file'
    return `Your last reply was cut off while you were writing ${f}, so that call did NOT run and nothing was written. ${keep} Write ${f} again in smaller pieces: write_file with the first part (about 150 lines at most), then write_file with append set to true for each next part.`
  }
  if (info.call) return `Your last reply was cut off in the middle of a ${info.call.name} call, so it did not run. ${keep} Make the call again with less in it.`
  if (info.onlyThinking) return `Your last reply used its whole length on thinking and produced no action. ${keep} Stop planning. Do the next step now with a tool call, and keep any thinking to a few lines.`
  return `Your last reply was cut off because it reached the length limit. ${keep} Keep each reply shorter, and write big files in pieces (write_file, then write_file with append set to true).`
}

const isCutCall = (b: ContentBlock): boolean =>
  b.type === 'tool_use' && !!(b.input as { __invalid?: boolean } | undefined)?.__invalid

/** A reply that hit the length limit, minus the tool call that was cut off half way (it cannot run). */
export function dropCutOffCalls(content: ContentBlock[]): ContentBlock[] {
  return content.filter((b) => !isCutCall(b) && !(b.type === 'text' && !b.text.trim()))
}

/** Adds a person turn, joining it to the previous one when that is already a person turn (roles must alternate). */
export function pushUser(messages: ApiMessage[], blocks: ContentBlock[]): void {
  const last = messages[messages.length - 1]
  if (last && last.role === 'user') {
    const prev: ContentBlock[] = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content
    last.content = [...prev, ...blocks]
  } else messages.push({ role: 'user', content: blocks })
}

/**
 * The work of a request that stopped early (files read, commands run), kept per chat so "continue" picks it up.
 * The chat itself only stores the visible text, so without this the AI would forget everything it read and start over.
 * Kept in memory only, for a few chats, and used once.
 */
const unfinished = new Map<string, ApiMessage[]>()
const KEEP_CHATS = 10

export function saveUnfinished(chatId: string | undefined, messages: ApiMessage[]): void {
  if (!chatId) return
  unfinished.delete(chatId)
  unfinished.set(chatId, messages.map((m) => ({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content })))
  while (unfinished.size > KEEP_CHATS) unfinished.delete(unfinished.keys().next().value as string)
}

/**
 * The saved work for this chat, if the chat's last reply is the one that stopped early. Any other reply in
 * between (the person edited the chat, or a later request finished) means the saved work is out of date.
 */
export function takeUnfinished(chatId: string | undefined, history: { role: string; text: string }[]): ApiMessage[] | null {
  if (!chatId) return null
  const saved = unfinished.get(chatId)
  unfinished.delete(chatId)
  if (!saved) return null
  const lastReply = [...history].reverse().find((h) => h.role === 'assistant' && h.text.trim())
  if (!lastReply || !(lastReply.text.includes(CUT_OFF_NOTICE) || lastReply.text.includes(STEPS_NOTICE))) return null
  return saved
}

/** Saved work plus the new request, ready to send: no dangling tool calls, roles alternating. */
export function resumeWith(saved: ApiMessage[], next: ContentBlock[]): ApiMessage[] {
  const out = saved.slice()
  const last = out[out.length - 1]
  if (last && last.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) {
    const kept = last.content.filter((b) => b.type !== 'tool_use')
    if (kept.length) out[out.length - 1] = { ...last, content: kept }
    else out.pop()
  }
  pushUser(out, next)
  return out
}
