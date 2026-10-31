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
