import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ApiFailure, streamMessage, type ApiMessage, type ContentBlock } from './anthropic'
import { changedDeliverables, snapshotDeliverables, type FileInfo } from './deliverables'
import { slimBrowserResults, dropCutOffCalls, cutOffInfo, cutOffNudgeFor, pushUser, saveUnfinished, takeUnfinished, resumeWith, CUT_OFF_NOTICE, STEPS_NOTICE } from './history'
import { usesOpenAIFormat } from './openai-format'
import { streamOpenAI } from './openai-compat'
import { openRuntime, type McpRuntime } from '../mcp/manager'
import type { McpConfig } from '../mcp/client'
import { BROWSER_TOOL_DEFS } from './browser'
import { DESIGN_POINTER, designSection } from './design'
import { memoryPrompt, type MemoryRuntime } from './memory'
import { executeTool, projectTree, TOOL_DEFS, type Decision, type PermissionRequest, type SkillData } from './tools'
import type { QuestionAnswer, QuestionItem } from '../../shared/question'

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
  /** Running estimate of the tokens the AI has produced so far in the reply being written. */
  | { type: 'live'; tokens: number }
  /** Files (a PDF, a spreadsheet...) that a command just made, so the chat can offer them. */
  | { type: 'files'; files: FileInfo[] }

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
  /** Ask the model not to reason before it acts (where the service supports turning that off). */
  noThinking?: boolean
  /** What already happened in this chat (edits, commands, task list), written by the app. */
  progress?: string
  /** No tools: the model can only answer in text. */
  noTools?: boolean
  /** Connectors the person switched on (with their sign-in details). */
  connectors?: McpConfig[]
  /** Skills the person switched on, so the AI knows their names/descriptions and can read their files with read_skill. */
  skills?: SkillInput[]
  /** Where skills are unpacked when read, so their scripts can run. Filled in by the main process. */
  skillsDir?: string
  /** The person's routines, so the AI can tell them what is already scheduled and not repeat it. */
  routines?: { title: string; cadence: string; time: string; enabled: boolean }[]
  /**
   * Memory for this chat. Absent when the person switched it off (a fresh chat) or turned memory off in
   * settings; then the AI gets no notes and no memory tools at all. `dir` is filled in by the main process.
   */
  memory?: { mode: 'ask' | 'auto'; dir?: string }
  runId: string
  /** Extra headers for the MoreCode server (never sent to anyone else). */
  headers?: Record<string, string>
}

export interface RunIo {
  emit: (e: OutEvent) => void
  ask: (req: PermissionRequest) => Promise<Decision>
  /** Put questions on screen and wait for the answers (null when the person skips). */
  askQuestion?: (id: string, items: QuestionItem[]) => Promise<QuestionAnswer[] | null>
  signal: AbortSignal
  fetchImpl?: typeof fetch
}

/** Safety net against an AI that loops forever. Big jobs need many steps, so this is generous. */
const MAX_STEPS = 150
/** How many replies in a row may hit the length limit before the person is asked to continue (resets after any reply that finishes). */
const MAX_CUT_OFF_RECOVERIES = 6
/** Longest single reply asked for. Services with a lower ceiling cap it themselves. */
const REPLY_TOKENS = 32768
const MAX_HISTORY = 30
let thinkSeq = 0

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
- Think briefly. For routine steps (a read, a search, a simple edit) go straight to the tool call with at most a line or two of reasoning. Save longer reasoning for a real design decision or a bug you cannot explain.\n- Every tool call re-sends the whole conversation, so fewer calls is cheaper than many small ones. Make independent reads in one step, and make all the changes to a file in one edit_file or write_file call instead of a string of tiny edits.
- Research is a means, not the goal. After about five research calls, start producing the deliverable with what you know and correct it later. Never repeat a failed tool call unchanged: change the approach or tell the person what is blocked. For common hardware (such as a Raspberry Pi board) use the well-known dimensions you already have instead of reverse-engineering a drawing.
- Do not re-read a file you already read or edited in this run: you know what it contains. Re-read only if a command may have changed it.
- Check code once: run the build or test command (a build usually type-checks too). Do not run the type check and the build separately, and do not check again when nothing changed.
- Screenshots cost more than other tools, so use browser_snapshot for text and structure and take a screenshot only when how something looks matters. When you are matching a design, a few screenshots to compare and fix real visual differences are worth it; stop once it matches, and do not repeat one when nothing changed.
- Minified or generated files (CSS or JS on one huge line) cannot be searched with findstr or grep: they return the whole file. Extract only what you need with a single precise regex command, and fetch only the reference files you actually need.
- ${shellNote()}
- If the person asks for a plan, or the change is large or risky, call present_plan and stop. Do not change files until they approve.
- You can read files and list folders anywhere on the computer, including outside the project (use full paths). If the person points you at other code to copy from, read it directly.
- write_file and edit_file only work inside the project folder. run_command is not limited to the project: to create or change anything elsewhere, use a command (copy, move, mkdir, and so on).
- To start a new project, scaffold it with run_command (for example npm create vite@latest, npm init, or writing the files yourself) in the folder the person names. If they name none, ${hasProject ? 'create it inside the current project folder' : "create it in the current folder (this chat's private folder)"}. Pick the right stack for what they asked for, such as Electron for a desktop app.
- If a command is refused, do not look for a way around it; explain and ask.
- Servers and watchers never finish, so start them with run_command and run_in_background: true. Then carry on, and use command_output (with wait_seconds, or until set to text like "ready" or "Local:") to see when it is up and to read errors. If a normal command is still running when its timeout ends it is not stopped: it becomes a background job, so use command_output to wait for the rest instead of running it again. Stop servers you started with stop_command when you are done with them.
- To look at or test a web page (such as the dev server you started), use the browser_* tools (browser_navigate, browser_snapshot, browser_screenshot, browser_click, browser_type, browser_select, browser_press, browser_scroll, browser_wait_for, browser_back, browser_tabs). They drive the person's Browser tab; if it is not open the tools open it for you, so just call browser_navigate directly and never ask the person to open the tab first (only ask if a tool explicitly fails to open it). Refs like e12 change on every snapshot, so always use the newest one. Use browser_screenshot when how something looks matters (layout, colours, spacing), not just what it says.
${DESIGN_POINTER}
- web_search finds things on the internet and web_fetch reads one page. Use them for anything that may have changed or that you are unsure of (library versions, API details, error messages, documentation), not for things in the project. Search, then fetch the best result before relying on it, and say which page you used.
- When a choice changes what you build and you cannot sensibly decide or look it up yourself, call ask_user with 1 to 3 short questions (2 to 4 options each, your recommendation first, ending in “(Recommended)”) instead of guessing or writing questions in your reply. Do not ask what you can decide, and do not ask for permission to run commands; that is handled for you.
- For git use git_status, git_diff and git_log to look, and git_commit, git_branch, git_push and git_pull_request only when the person asked or it is plainly part of the task (they ask first). Check git_status before committing, write imperative messages under 72 characters, and never use run_command for a git action that has its own tool.
- If the person wants something done again on a schedule, call draft_routine; it only proposes, they press Save. Say plainly that it is not scheduled until they do.
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
      const stream = usesOpenAIFormat(args.baseUrl) ? streamOpenAI : streamMessage
      let chars = 0
      let lastLive = 0
      // the AI's hidden reasoning, shown as a "Thinking 15s" row that becomes "Thought for 15s" when it moves on
      let thinkId = ''
      let thinkText = ''
      let thinkStart = 0
      let thinkEmit = 0
      // short thoughts (under 2 seconds) never get a row: a row per step made the chat jumpy
      let thinkShown = false
      const showThink = (status: 'running' | 'done'): void => {
        thinkShown = true
        io.emit({
          type: 'tool',
          tool: { kind: 'thinking', id: thinkId, text: thinkText.slice(-30000), status, startedAt: thinkStart, ...(status === 'done' ? { durationMs: Date.now() - thinkStart } : {}) }
        })
      }
      const endThink = (): void => {
        if (!thinkId) return
        if (thinkShown) showThink('done')
        thinkId = ''
        thinkText = ''
        thinkShown = false
      }
      try {
      return await stream(args, {
        thinking: (delta) => {
          if (!thinkId) {
            thinkId = `think-${++thinkSeq}`
            thinkStart = Date.now()
            thinkEmit = 0
          }
          thinkText += delta
          const t = Date.now()
          if (t - thinkStart >= 2000 && (thinkEmit === 0 || t - thinkEmit > 400)) {
            thinkEmit = t
            showThink('running')
          }
        },
        text: (delta) => {
          endThink()
          spoke = true
          io.emit({ type: 'text', delta })
        },
        progress: (n, thinking) => {
          if (!thinking) endThink()
          chars += n
          const now = Date.now()
          if (now - lastLive < 250) return
          lastLive = now
          io.emit({ type: 'live', tokens: Math.ceil(chars / 3.5) })
        }
      })
      } finally {
        endThink()
      }
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
          .join('\n')}\nIf a skill is relevant to the person's task, call read_skill with its id (and an optional file path from its files list, such as "skills/analyze/SKILL.md") to read its instructions before proceeding. Reading a skill also tells you the folder it was unpacked to; use that folder only to run scripts the skill names, and keep using read_skill to read anything in it.`
      : ''
  const routinesSection =
    !input.noTools && input.routines?.length
      ? `\n\nThe person's routines already scheduled:\n${input.routines.slice(0, 30).map((r) => `- ${r.title} (${r.cadence}${r.cadence === 'hourly' ? '' : ` at ${r.time}`}${r.enabled ? '' : ', paused'})`).join('\n')}\nDo not draft a routine that repeats one of these.`
      : ''
  const memoryRt: MemoryRuntime | undefined =
    !input.noTools && input.memory?.dir ? { dir: input.memory.dir, mode: input.memory.mode, projectPath: input.projectPath, chat: input.chatId } : undefined
  const system =
    buildSystem(input.cwd, input.style, hasProject, input.progress ?? '') +
    skillsSection +
    routinesSection +
    (memoryRt ? memoryPrompt(memoryRt) : '') +
    designSection({ prompt: input.prompt, images: input.images, history: input.history }) +
    (mcp ? `\n\nConnected connectors: ${mcp.names.join(', ')}. Their tools start with mcp__. Use them when the task needs that service's data or actions, and say which one you used. When a connector tool saves a file (such as a screenshot), pass a path inside the working folder (${input.cwd}) unless the person asked for another place.` : '')
  const baseTools = activeSkills.length > 0 ? TOOL_DEFS : TOOL_DEFS.filter((t) => t.name !== 'read_skill')
  const withoutMemory = memoryRt ? baseTools : baseTools.filter((t) => !t.name.startsWith('memory_'))
  const tools = input.noTools ? [] : [...withoutMemory, ...BROWSER_TOOL_DEFS, ...(mcp?.defs ?? [])]
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
  // when the last request stopped early, carry on from its real work (files read, results) instead of only its text
  const saved = takeUnfinished(input.chatId, input.history)
  const messages: ApiMessage[] = saved ? resumeWith(saved, userContent(input)) : [...past, { role: 'user', content: next }]
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
    askQuestion: io.askQuestion,
    memory: memoryRt,
    delegate,
    mcp,
    skills: activeSkills,
    skillsDir: activeSkills.length > 0 ? input.skillsDir : undefined,
    skillDirsShown: new Set<string>(),
    editFailures: new Map<string, number>()
  }

  let recoveries = 0
  for (let step = 0; step < MAX_STEPS; step++) {
    if (io.signal.aborted) return
    const started = Date.now()
    const result = await streamWithRetry(
      {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        system,
        messages: slimBrowserResults(messages),
        tools,
        maxTokens: REPLY_TOKENS,
        noThinking: input.noThinking,
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

    const cutOff = result.stopReason === 'max_tokens'
    const cutInfo = cutOff ? cutOffInfo(result.content) : null
    const content = cutOff ? dropCutOffCalls(result.content) : result.content
    if (!cutOff) recoveries = 0
    if (cutOff && recoveries >= MAX_CUT_OFF_RECOVERIES) {
      // still too long after several tries: keep the text, keep the work for "continue", and tell the person
      const text = content.filter((b) => b.type === 'text')
      if (text.length) messages.push({ role: 'assistant', content: text })
      saveUnfinished(input.chatId, messages)
      io.emit({ type: 'text', delta: `\n\n${CUT_OFF_NOTICE}` })
      return
    }
    if (content.length) messages.push({ role: 'assistant', content })
    if (!cutOff && result.stopReason !== 'tool_use') return

    const results: ContentBlock[] = []
    let stop = false
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      if (io.signal.aborted) return
      // a command can make a file no tool reports (a PDF from a script): look at the folder before and after
      const before = block.name === 'run_command' ? snapshotDeliverables(input.cwd) : null
      const r = await executeTool(block.name, block.id, block.input, ctx)
      if (before) {
        const made = changedDeliverables(input.cwd, before, snapshotDeliverables(input.cwd))
        if (made.length) io.emit({ type: 'files', files: made })
      }
      const content = r.images?.length
        ? [{ type: 'text' as const, text: r.content }, ...r.images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.media_type, data: im.data } }))]
        : r.content
      results.push({ type: 'tool_result', tool_use_id: block.id, content, ...(r.isError ? { is_error: true } : {}) })
      if (r.stop) stop = true
    }
    if (stop) return
    if (cutOff) {
      // the reply hit the length limit: quietly ask the AI to carry on, with everything it has read still in view
      recoveries++
      pushUser(messages, [...results, { type: 'text', text: cutOffNudgeFor(cutInfo!) }])
      continue
    }
    messages.push({ role: 'user', content: results })
  }
  saveUnfinished(input.chatId, messages)
  io.emit({ type: 'text', delta: `\n\n${STEPS_NOTICE}` })
}

export { ApiFailure }
