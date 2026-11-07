/**
 * Import memory from another AI.
 *
 * The person copies IMPORT_PROMPT into the AI they used before, then pastes the answer back.
 * parseImport turns that answer into short notes for review. It is forgiving about the format
 * (bullets, numbering, bold headings, code fences, dates) because every AI answers a little
 * differently. Nothing here saves anything: the person reviews the notes first, and the main
 * process still validates each one (length, secrets, duplicates, room) when it is saved.
 */

export const IMPORT_PROMPT = `I'm switching to a new AI coding assistant and want to bring over what you know about me, so it can work the way I like from the first message. List everything you have saved or learned about me that would help an AI assistant with coding and everyday work.

Rules:
- Reply with ONLY the list, inside one code block. No introduction and no closing remarks.
- One short fact per line, starting with "- ". Keep each line under 250 characters and write it plainly, for example "Uses pnpm, not npm" or "Prefers short answers".
- Use exactly these two headings:

## Preferences
How I like to work and be answered, in every chat: language, tone, formatting, level of detail, tools and editors I use, coding style, habits.

## Projects
Facts about specific codebases or ongoing work. Start each line with the project name, then the stack, conventions, deployment and decisions I made.

- Include only what I told you or what is clear from our chats. Do not guess or invent anything.
- Leave out passwords, API keys, tokens and other secrets, and private details about other people.
- If you have nothing for a heading, write "- None" under it.`

export type ImportScope = 'global' | 'project'

export interface ImportItem {
  text: string
  /** Where the AI put it: "Projects" becomes project notes, everything else is for every chat. */
  scope: ImportScope
}

export const MAX_IMPORT_CHARS = 100_000
export const MAX_IMPORT_ITEMS = 200
const NOTE_MAX = 300

const PROJECT_HEADING = /\b(projects?|codebases?|repos?|repositories|stack|work)\b/i
const EMPTY = /^(none|n\/a|nothing|no (?:information|notes?|data|projects?|preferences)(?: saved)?|not applicable|-+)\.?$/i

const clean = (s: string): string =>
  s
    .replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '') // bullet or "1."
    .replace(/^\s*[\[(]\d{4}-\d{2}-\d{2}[\])]:?\s*/, '') // [2025-01-02]
    .replace(/^\s*\d{4}-\d{2}-\d{2}\s*[:\-–]\s*/, '') // 2025-01-02: …
    .replace(/^\*\*([^*]+)\*\*\s*[:\-–]?\s*$/, '$1') // a line that is only bold
    .replace(/\s+/g, ' ')
    .trim()

/** Split one over-long line into sentences, packed so that each piece fits in a note. */
function pack(text: string): string[] {
  if (text.length <= NOTE_MAX) return [text]
  const out: string[] = []
  let cur = ''
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (cur && (cur + ' ' + s).length > NOTE_MAX) {
      out.push(cur)
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  if (cur) out.push(cur)
  return out
}

export function parseImport(input: string): ImportItem[] {
  const items: ImportItem[] = []
  const seen = new Set<string>()
  let scope: ImportScope = 'global'

  for (const raw of input.slice(0, MAX_IMPORT_CHARS).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^```/.test(line) || /^<\/?[a-z-]+>$/i.test(line) || /^[-=_*]{3,}$/.test(line)) continue

    const bullet = /^\s*(?:[-*•–]|\d+[.)])\s+/.test(raw)
    const heading = /^#{1,6}\s+(.+)$/.exec(line)?.[1] ?? (!bullet && /^\*\*([^*]+)\*\*:?$/.exec(line)?.[1]) ?? (!bullet && /^(.{1,80}):$/.exec(line)?.[1])
    if (heading) {
      scope = PROJECT_HEADING.test(heading) ? 'project' : 'global'
      continue
    }

    const text = clean(line)
    if (!text || EMPTY.test(text)) continue
    for (const piece of pack(text)) {
      const key = piece.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ text: piece, scope })
      if (items.length >= MAX_IMPORT_ITEMS) return items
    }
  }
  return items
}
