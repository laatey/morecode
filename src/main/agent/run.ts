import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ApiFailure, streamMessage, type ApiMessage, type ContentBlock } from './anthropic'
import { executeTool, TOOL_DEFS, type Decision, type PermissionAction } from './tools'

export type Style = 'new' | 'some' | 'pro'

export interface UsageDetail {
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Everything the model saw on this step: how full the context window is. */
  contextTokens: number
  ms: number
}

export type OutEvent =
  | { type: 'tool'; tool: Record<string, unknown> }
  | { type: 'text'; delta: string }
  | { type: 'project'; name: string; path: string }
  | { type: 'usage'; tokens: number; detail: UsageDetail }

export interface RunInput {
  apiKey: string
  baseUrl?: string
  model: string
  cwd: string
  prompt: string
  images: string[]
  attachments: { kind: 'file' | 'folder'; name: string; path?: string }[]
  history: { role: 'user' | 'assistant'; text: string }[]
  style: Style
  runId: string
  /** Documents-based parent used only when a person asks to start a separate project. */
  newProjectRoot?: string
  /** Extra headers for the MoreCode server (never sent to anyone else). */
  headers?: Record<string, string>
}

export interface RunIo {
  emit: (e: OutEvent) => void
  ask: (req: { id: string; action: PermissionAction; title: string; command: string; reason?: string }) => Promise<Decision>
  signal: AbortSignal
  fetchImpl?: typeof fetch
}

const MAX_STEPS = 40
const MAX_HISTORY = 30

const VOICE: Record<Style, string> = {
  new: 'The person is new to coding. Use plain language, avoid jargon, and say what a change does for them rather than how it works. Keep explanations short and kind.',
  some: 'The person knows some coding. Explain changes in a sentence or two with the key details.',
  pro: 'The person is an experienced developer. Be brief and technical; skip basics.'
}

export function buildSystem(cwd: string, style: Style, newProjectRoot?: string): string {
  let notes = ''
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(cwd, name)
    if (existsSync(file)) {
      notes = `\n\nProject notes from ${name}:\n${readFileSync(file, 'utf8').slice(0, 6000)}`
      break
    }
  }
  return `You are MoreCode, an AI coding assistant working inside the person's project folder on their computer.

${VOICE[style]}

How to work:
- Look before you change things. Use list_dir, search and read_file to understand the code. Always read a file before you edit it.
- Make the smallest change that does the job. Prefer edit_file over rewriting whole files. Keep the existing style of the code.
- For anything with more than a couple of steps, call todo_write first and keep it updated.
- After changing code, check your work when a check exists (tests, type check, lint) with run_command.
- If the person asks for a plan, or the change is large or risky, call present_plan and stop. Do not change files until they approve.
- If the person asks to create a new, separate project and has not named a folder, call create_project. It creates the project in ${newProjectRoot ?? 'their Documents folder'}, switches this run into it, and keeps it out of the project currently open in MoreCode. Never scaffold a separate project inside the current project unless the person explicitly gives that location.
- You can only touch files inside the project folder. If a command is refused, do not look for a way around it; explain and ask.
- Never invent file contents or command output. If something fails, say so plainly and say what you will try next.
- Finish with a short summary of what changed and anything the person should check. Write for a person, not a log.${notes}`
}

/** History from the chat, as API messages: roles alternate and the first one is the person's. */
export function buildHistory(history: RunInput['history']): ApiMessage[] {
  const out: ApiMessage[] = []
  for (const h of history.slice(-MAX_HISTORY)) {
    const text = h.text.trim()
    if (!text) continue
    const last = out[out.length - 1]
    if (last && last.role === h.role) last.content = `${last.content as string}\n\n${text}`
    else out.push({ role: h.role, content: text })
  }
  while (out.length && out[0].role !== 'user') out.shift()
  if (out.length && out[out.length - 1].role === 'user') out.pop() // the new prompt follows; two user turns in a row are not allowed
  return out
}

function userContent(input: RunInput): ContentBlock[] {
  const blocks: ContentBlock[] = []
  for (const img of input.images) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(img)
    if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  const files = input.attachments.length
    ? `\n\nAttached: ${input.attachments.map((a) => `${a.kind} ${a.path || a.name}`).join(', ')}. Read them with your tools if they matter.`
    : ''
  blocks.push({ type: 'text', text: `${input.prompt}${files}` })
  return blocks
}

/** One whole request: keep asking the model and running its tools until it has finished. */
export async function runAgent(input: RunInput, io: RunIo): Promise<void> {
  const system = buildSystem(input.cwd, input.style, input.newProjectRoot)
  const messages: ApiMessage[] = [...buildHistory(input.history), { role: 'user', content: userContent(input) }]
  const ctx = {
    cwd: input.cwd,
    newProjectRoot: input.newProjectRoot,
    signal: io.signal,
    runId: input.runId,
    emit: (tool: Record<string, unknown>) => io.emit({ type: 'tool', tool }),
    ask: io.ask
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (io.signal.aborted) return
    const started = Date.now()
    const result = await streamMessage(
      {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        system,
        messages,
        tools: TOOL_DEFS,
        signal: io.signal,
        headers: input.headers,
        fetchImpl: io.fetchImpl
      },
      { text: (delta) => io.emit({ type: 'text', delta }) }
    )

    const u = result.usage
    io.emit({
      type: 'usage',
      tokens: u.input + u.output + u.cacheRead + u.cacheWrite,
      detail: {
        model: input.model,
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
        contextTokens: u.input + u.cacheRead + u.cacheWrite,
        ms: Date.now() - started
      }
    })

    if (result.content.length) messages.push({ role: 'assistant', content: result.content })
    if (result.stopReason === 'max_tokens') {
      io.emit({ type: 'text', delta: '\n\n(I ran out of room for this answer. Ask me to continue and I will pick up where I stopped.)' })
      return
    }
    if (result.stopReason !== 'tool_use') return

    const results: ContentBlock[] = []
    let stop = false
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue
      if (io.signal.aborted) return
      const r = await executeTool(block.name, block.id, block.input, ctx)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })
      if (r.stop) stop = true
    }
    if (stop) return
    messages.push({ role: 'user', content: results })
  }
  io.emit({ type: 'text', delta: '\n\n(I stopped after many steps. Tell me to keep going if you want me to continue.)' })
}

export { ApiFailure }
