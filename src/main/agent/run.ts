import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ApiFailure, streamMessage, type ApiMessage, type ContentBlock } from './anthropic'
import { openRuntime, type McpRuntime } from '../mcp/manager'
import type { McpConfig } from '../mcp/client'
import { BROWSER_TOOL_DEFS } from './browser'
import { DESIGN_POINTER, designSection } from './design'
import { executeTool, projectTree, TOOL_DEFS, type Decision, type PermissionRequest, type SkillData } from './tools'

export type SkillInput = SkillData

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
  /** The linked project, if any. Chats without one run in their own private folder. */
  projectPath?: string
  /** The chat this run belongs to. A chat with no project works in a private folder keyed by this. */
  chatId?: string
  model: string
  cwd: string
  prompt: string
  images: string[]
  attachments: { kind: 'file' | 'folder'; name: string; path?: string }[]
  history: { role: 'user' | 'assistant'; text: string }[]
  style: Style
  /** What already happened in this chat (edits, commands, task list), written by the app. */
  progress?: string
  /** No tools: the model can only answer in text. */
  noTools?: boolean
  /** Connectors the person switched on (with their sign-in details). */
  connectors?: McpConfig[]
  /** Skills the person switched on, so the AI knows their names/descriptions and can read their files with read_skill. */
  skills?: SkillInput[]
  runId: string
  /** Extra headers for the MoreCode server (never sent to anyone else). */
  headers?: Record<string, string>
}

export interface RunIo {
  emit: (e: OutEvent) => void
  ask: (req: PermissionRequest) => Promise<Decision>
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

/** Which shell `run_command` really uses, so the AI writes commands that work on this computer. */
export function shellNote(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return 'The person is on Windows and commands run in cmd.exe, not bash. Use dir (not ls), type (not cat), set NAME=value (not export), and backslash paths. Do not use bash-only syntax.'
  }
  return `The person is on ${platform === 'darwin' ? 'macOS' : 'Linux'} and commands run in /bin/sh. Stick to portable POSIX shell syntax.`
}

export function buildSystem(cwd: string, style: Style, hasProject = true, progress = ''): string {
  let notes = ''
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(cwd, name)
    if (existsSync(file)) {
      notes = `\n\nProject notes from ${name}:\n${readFileSync(file, 'utf8').slice(0, 6000)}`
      break
    }
  }
  return `You are MoreCode, an AI coding assistant${hasProject ? " working inside the person's project folder on their computer." : ' in a chat that is not part of any project. Commands start in this chat\'s own private, empty folder. You do not know about, and must not go looking for, the person\'s other projects or the MoreCode Projects folder: only read or change them if the person names a specific folder. If they want to work on an existing project, tell them to open it from the sidebar and move this chat into it.'}

${VOICE[style]}

How to work:
- Look before you change things. Use list_dir, search and read_file to understand the code. Always read a file before you edit it.
- Make the smallest change that does the job. Prefer edit_file over rewriting whole files. Keep the existing style of the code.
- For anything with more than a couple of steps, call todo_write first and keep it updated.
- After changing code, check your work when a check exists (tests, type check, lint) with run_command.
- ${shellNote()}
- If the person asks for a plan, or the change is large or risky, call present_plan and stop. Do not change files until they approve.
- You can read files and list folders anywhere on the computer, including outside the project (use full paths). If the person points you at other code to copy from, read it directly.
- write_file and edit_file only work inside the project folder. run_command is not limited to the project: to create or change anything elsewhere, use a command (copy, move, mkdir, and so on).
- To start a new project, scaffold it with run_command (for example npm create vite@latest, npm init, or writing the files yourself) in the folder the person names. If they name none, ${hasProject ? 'create it inside the current project folder' : "create it in the current folder (this chat's private folder)"}. Pick the right stack for what they asked for, such as Electron for a desktop app.
- If a command is refused, do not look for a way around it; explain and ask.
- Servers and watchers never finish, so start them with run_command and run_in_background: true. Then carry on, and use command_output (with wait_seconds, or until set to text like "ready" or "Local:") to see when it is up and to read errors. If a normal command is still running when its timeout ends it is not stopped: it becomes a background job, so use command_output to wait for the rest instead of running it again. Stop servers you started with stop_command when you are done with them.
- To look at or test a web page (such as the dev server you started), use the browser_* tools (browser_navigate, browser_snapshot, browser_screenshot, browser_click, browser_type, browser_select, browser_press, browser_scroll, browser_wait_for, browser_back, browser_tabs). They drive the person's Browser tab, which must be open; if a tool says it is not, ask them to open it. Refs like e12 change on every snapshot, so always use the newest one. Use browser_screenshot when how something looks matters (layout, colours, spacing), not just what it says.
${DESIGN_POINTER}
- Only a tool call changes anything. Never type tool activity as text (for example "[Edited file]"), and never say you created or changed something unless a tool result confirmed it.
- Use paths relative to the project root (src/main.js), with no leading slash.
- Keep todo_write up to date: mark each task completed as soon as it is done, so the list is true if the person says "continue".
- If the person says "continue" or "keep going", carry on with the unfinished tasks in the state below. Do not start over or recreate files that already exist.
- delegate is for broad read-only research across many files, never for edits, commands or small lookups, and at most 3 times per request. Do everything else yourself.
- If edit_file fails twice on a file, stop retrying it: read the file, then write_file the complete corrected content.
- If the person mentions a project or file on their computer ("on the desktop", "in Documents"), find it with list_dir under the folders listed below before saying you cannot see it.
- Never invent file contents or command output. If something fails, say so plainly and say what you will try next.
- Finish with a short summary of what changed and anything the person should check. Write for a person, not a log.
- Never use emojis in your replies.

This computer runs ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}. ${process.platform === 'win32' ? 'run_command uses Windows cmd.exe: use dir, type, findstr, copy, move, del and mkdir. There is no head, tail, grep, cat, ls, touch or sed, and no "&&"-free Unix tricks. Use backslashes in paths.' : 'run_command uses a POSIX shell.'} Never invent a drive letter or folder: only use paths from this prompt or ones you found with list_dir.\n\nThis computer: working folder ${cwd}; home folder ${homedir()}; Desktop ${join(homedir(), 'Desktop')}; Documents ${join(homedir(), 'Documents')}.

Files in the working folder right now:
${safeTree(cwd)}${progress ? `\n\nWhat has happened in this chat so far (kept by the app, so it is accurate; trust it over your own memory):\n${progress}` : ''}${notes}`
}

const safeTree = (cwd: string): string => {
  try {
    return projectTree(cwd)
  } catch {
    return '(could not list the folder)'
  }
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/** Ask the model, and quietly try again when the connection drops or a free service is briefly busy. */
async function streamWithRetry(
  args: Parameters<typeof streamMessage>[0],
  io: RunIo
): ReturnType<typeof streamMessage> {
  let spoke = false
  for (let attempt = 0; ; attempt++) {
    try {
      return await streamMessage(args, {
        text: (delta) => {
          spoke = true
          io.emit({ type: 'text', delta })
        }
      })
    } catch (err) {
      const f = err instanceof ApiFailure ? err : null
      const transient = !!f && (f.kind === 'interrupted' || f.kind === 'rate_limit' || (f.status ?? 0) >= 500)
      const wait = f?.kind === 'rate_limit' ? (f.retryAfter ?? 5 * (attempt + 1)) : 2 * (attempt + 1)
      if (io.signal.aborted || !transient || spoke || attempt >= 2 || wait > 30) throw err
      await sleep(wait * 1000, io.signal)
      if (io.signal.aborted) throw err
    }
  }
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
  const hasProject = Boolean(input.projectPath)
  const mcp: McpRuntime | null = input.noTools ? null : await openRuntime(input.connectors ?? [], input.cwd, io.signal)
  const activeSkills = input.skills ?? []
  const skillsSection =
    !input.noTools && activeSkills.length > 0
      ? `\n\nAvailable skills (switched on by the person):\n${activeSkills
          .map((s) => {
            const files = Object.keys(s.bundle ?? {})
            const fileHint = files.length > 0 ? ` (files: ${files.slice(0, 12).join(', ')})` : ''
            return `- ${s.id} (${s.name}): ${s.description}${fileHint}`
          })
          .join('\n')}\nIf a skill is relevant to the person's task, call read_skill with its id (and an optional file path from its files list, such as "skills/analyze/SKILL.md") to read its instructions before proceeding.`
      : ''
  const system =
    buildSystem(input.cwd, input.style, hasProject, input.progress ?? '') +
    skillsSection +
    designSection({ prompt: input.prompt, images: input.images, history: input.history }) +
    (mcp ? `\n\nConnected connectors: ${mcp.names.join(', ')}. Their tools start with mcp__. Use them when the task needs that service's data or actions, and say which one you used. When a connector tool saves a file (such as a screenshot), pass a path inside the working folder (${input.cwd}) unless the person asked for another place.` : '')
  const baseTools = activeSkills.length > 0 ? TOOL_DEFS : TOOL_DEFS.filter((t) => t.name !== 'read_skill')
  const tools = input.noTools ? [] : [...baseTools, ...BROWSER_TOOL_DEFS, ...(mcp?.defs ?? [])]
  if (mcp?.failedAuth?.length) {
    for (const f of mcp.failedAuth) {
      io.emit({
        type: 'tool',
        tool: {
          kind: 'mcp',
          id: `auth-${f.id}-${Date.now()}`,
          connectorId: f.id,
          connector: f.name,
          tool: 'authenticate',
          input: {},
          status: 'error',
          authError: true,
          output: f.error
        }
      })
    }
  }
  const past = buildHistory(input.history)
  const next = userContent(input)
  // two person turns in a row are not allowed, so a trailing one (a summary, or a message that never got a reply) rides along with the new prompt
  const carried = past.length && past[past.length - 1].role === 'user' ? (past.pop() as ApiMessage) : null
  if (carried && typeof carried.content === 'string') next.unshift({ type: 'text', text: `${carried.content}\n\n` })
  const messages: ApiMessage[] = [...past, { role: 'user', content: next }]
  let delegations = 0
  const delegate = async (id: string, task: string): Promise<string> => {
    if (delegations >= 3) throw new Error('You already used 3 helpers for this request. Do the rest yourself.')
    delegations++
    const readOnly = TOOL_DEFS.filter((t) => ['list_dir', 'read_file', 'search'].includes(t.name))
    const helperSystem = `You are a read-only research helper for a coding assistant. The project folder is ${input.cwd}. You can list folders, read files and search. You cannot change anything or run commands. Find what the task asks for, then reply with a short report (under 250 words) naming the files and lines that matter. Say plainly what you could not find. Do not guess. Never use emojis.`
    const msgs: ApiMessage[] = [{ role: 'user', content: [{ type: 'text', text: task }] }]
    const show = (steps: number, status: 'running' | 'done' | 'error', report?: string): void =>
      io.emit({ type: 'tool', tool: { kind: 'agent', id, task: task.slice(0, 160), status, steps, ...(report ? { report } : {}) } })
    show(0, 'running')
    let last = ''
    try {
      for (let step = 0; step < 6; step++) {
        if (io.signal.aborted) break
        const r = await streamWithRetry(
          { apiKey: input.apiKey, baseUrl: input.baseUrl, model: input.model, system: helperSystem, messages: msgs, tools: readOnly, signal: io.signal, headers: input.headers, fetchImpl: io.fetchImpl },
          { ...io, emit: () => undefined }
        )
        if (r.content.length) msgs.push({ role: 'assistant', content: r.content })
        last = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim() || last
        if (r.stopReason !== 'tool_use') break
        const results: ContentBlock[] = []
        for (const b of r.content) {
          if (b.type !== 'tool_use') continue
          // the helper's own reads stay out of the chat, and it cannot start helpers of its own
          const out = await executeTool(b.name, b.id, b.input, {
            cwd: input.cwd,
            signal: io.signal,
            runId: input.runId,
            emit: () => undefined,
            ask: io.ask
          })
          results.push({ type: 'tool_result', tool_use_id: b.id, content: out.content, ...(out.isError ? { is_error: true } : {}) })
        }
        msgs.push({ role: 'user', content: results })
        show(step + 1, 'running')
      }
    } catch (err) {
      show(0, 'error')
      throw err
    }
    const report = (last || 'The helper found nothing to report.').slice(0, 2500)
    show(msgs.filter((m) => m.role === 'assistant').length, 'done', report)
    return report
  }

  const ctx = {
    cwd: input.cwd,
    signal: io.signal,
    runId: input.runId,
    emit: (tool: Record<string, unknown>) => io.emit({ type: 'tool', tool }),
    ask: io.ask,
    delegate,
    mcp,
    skills: activeSkills,
    editFailures: new Map<string, number>()
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (io.signal.aborted) return
    const started = Date.now()
    const result = await streamWithRetry(
      {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        system,
        messages,
        tools,
        signal: io.signal,
        headers: input.headers,
        fetchImpl: io.fetchImpl
      },
      io
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
      const content = r.images?.length
        ? [{ type: 'text' as const, text: r.content }, ...r.images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.media_type, data: im.data } }))]
        : r.content
      results.push({ type: 'tool_result', tool_use_id: block.id, content, ...(r.isError ? { is_error: true } : {}) })
      if (r.stop) stop = true
    }
    if (stop) return
    messages.push({ role: 'user', content: results })
  }
  io.emit({ type: 'text', delta: '\n\n(I stopped after many steps. Tell me to keep going if you want me to continue.)' })
}

export { ApiFailure }
