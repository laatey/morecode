import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { ToolDef } from './anthropic'
import { diffFiles } from './diff'
import { resultText } from '../mcp/client'
import type { McpRuntime } from '../mcp/manager'
import { dropJob, getJob, listJobs, markDetached, seconds, startJob, stopJob, takeNew, waitForJob, type Job } from './background'

/**
 * The things the AI is allowed to do. Reading is free anywhere on the computer; the file-edit
 * tools stay inside the project folder; run_command is unrestricted (it asks first, per settings).
 * Every function returns text for the model; what the person sees goes out through `ctx.emit`.
 */

export type Decision = 'once' | 'always' | 'deny'
export type PermissionAction = 'command' | 'install' | 'remove' | 'network'

export interface ToolContext {
  cwd: string
  /** Hand a read-only research job to a helper. Set by the run, which enforces the limits. */
  delegate?: (id: string, task: string) => Promise<string>
  /** How many edit_file attempts have failed per file in this run. */
  editFailures?: Map<string, number>
  signal: AbortSignal
  emit: (tool: Record<string, unknown>) => void
  ask: (req: { id: string; action: PermissionAction; title: string; command: string; reason?: string }) => Promise<Decision>
  runId: string
  /** Tools from the person's connected connectors, when any are switched on. */
  mcp?: McpRuntime | null
}

export interface ToolResult {
  content: string
  isError?: boolean
  /** The run should end after this tool (a plan is waiting for approval). */
  stop?: boolean
}

const MAX_READ_BYTES = 200_000
const MAX_WRITE_BYTES = 1_000_000
const MAX_OUTPUT_CHARS = 12_000
export const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.next', '.cache', 'coverage', '.venv', 'venv', 'target', '__pycache__'])

/* ---------- keeping the AI inside the project folder ---------- */

/** Resolve a path the model gave us; refuse anything outside the project (including via symlinks). */
export function resolveSafe(cwd: string, p: string): string {
  const root = realpathSync(cwd)
  const attempt = (raw: string): string | null => {
    const abs = isAbsolute(raw) ? resolve(raw) : resolve(root, raw)
    // follow symlinks on the part that already exists
    let probe = abs
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
    const real = existsSync(probe) ? realpathSync(probe) : probe
    const finalPath = resolve(real, relative(probe, abs))
    return finalPath === root || finalPath.startsWith(root + sep) ? finalPath : null
  }
  // "/src/app.js" or "\\src\\app.js" almost always means "inside the project", so treat it that way
  const rooted = /^[\\/][^\\/]/.test(p)
  const finalPath = attempt(p) ?? (rooted ? attempt(p.replace(/^[\\/]+/, '')) : null)
  if (!finalPath) {
    throw new Error(`“${p}” is outside the project folder, so the edit tools cannot change it. Use a path relative to the project root (for example src/main.js). To create or change files elsewhere, use run_command.`)
  }
  if (relative(root, finalPath).split(sep)[0] === '.git') {
    throw new Error('The .git folder is managed by git and cannot be changed here.')
  }
  return finalPath
}

/** Reading may go anywhere on the computer. Only the edit tools use resolveSafe. */
export function resolveRead(cwd: string, p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(realpathSync(cwd), p)
}

/** A path as shown to the person and the AI: relative inside the project, full path outside it. */
const rel = (cwd: string, abs: string): string => {
  const r = relative(realpathSync(cwd), abs)
  if (r.startsWith('..') || isAbsolute(r)) return abs
  return r.split(sep).join('/') || '.'
}

const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0)

const clip = (text: string, max = MAX_OUTPUT_CHARS): string =>
  text.length <= max ? text : `${text.slice(0, max / 2)}\n… [${text.length - max} characters left out] …\n${text.slice(-max / 2)}`

/* ---------- undo ---------- */

interface Snapshot {
  abs: string
  /** null means the file did not exist before the AI created it. */
  original: string | null
}
const snapshots = new Map<string, Snapshot>()
/** What each file looked like before its first edit that is still waiting for review, to count the real net change. */
const baselines = new Map<string, string | null>()
const releaseBaseline = (abs: string): void => {
  if (![...snapshots.values()].some((s) => s.abs === abs)) baselines.delete(abs)
}

/** Put a file back the way it was before one edit. Returns false if there is nothing to undo. */
export function revertEdit(id: string): boolean {
  const snap = snapshots.get(id)
  if (!snap) return false
  try {
    if (snap.original === null) {
      if (existsSync(snap.abs)) unlinkSync(snap.abs)
    } else {
      writeFileSync(snap.abs, snap.original)
    }
  } catch {
    return false
  }
  snapshots.delete(id)
  releaseBaseline(snap.abs)
  return true
}

/** The person kept an edit; the undo copy is no longer needed. */
export function keepEdit(id: string): void {
  const snap = snapshots.get(id)
  snapshots.delete(id)
  if (snap) releaseBaseline(snap.abs)
}

/* ---------- classifying commands for the permission prompt ---------- */

export function classifyCommand(command: string): PermissionAction {
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bcargo\s+(add|install)\b|\bgo\s+(get|install)\b|\b(apt|apt-get|brew|choco|winget)\s+install\b/i.test(command)) return 'install'
  if (/(^|[\s;&|])(rm|rmdir|del|erase|rd|Remove-Item)\b/i.test(command)) return 'remove'
  if (/\b(curl|wget|Invoke-WebRequest|iwr|git\s+(clone|pull|push|fetch)|ssh|scp)\b/i.test(command)) return 'network'
  return 'command'
}

const TITLE: Record<PermissionAction, string> = {
  command: 'Run a command',
  install: 'Install packages',
  remove: 'Delete files',
  network: 'Use the internet'
}

/* ---------- the tools ---------- */

type Input = Record<string, unknown>
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`“${name}” must be text.`)
  return v
}

async function readFile(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const abs = resolveRead(ctx.cwd, str(i.path, 'path'))
  const shown = rel(ctx.cwd, abs)
  ctx.emit({ kind: 'read', id, paths: [shown], status: 'running' })
  if (!existsSync(abs)) throw new Error(`There is no file at ${shown}.`)
  const st = statSync(abs)
  if (st.isDirectory()) throw new Error(`${shown} is a folder. Use list_dir to see what is inside.`)
  const buf = readFileSync(abs)
  if (looksBinary(buf)) throw new Error(`${shown} is a binary file, so it cannot be read as text.`)
  const all = buf.subarray(0, MAX_READ_BYTES).toString('utf8').split('\n')
  const start = Math.max(1, Number(i.start_line) || 1)
  const end = Math.min(all.length, Number(i.end_line) || all.length)
  const body = all
    .slice(start - 1, end)
    .map((line, n) => `${String(start + n).padStart(5)}  ${line}`)
    .join('\n')
  ctx.emit({ kind: 'read', id, paths: [shown], status: 'done' })
  const cut = buf.length > MAX_READ_BYTES ? `\n[file is ${buf.length} bytes; only the first ${MAX_READ_BYTES} were read]` : ''
  return { content: `${shown} (${all.length} lines)\n${body}${cut}` }
}

function listDir(ctx: ToolContext, id: string, i: Input): ToolResult {
  const abs = resolveRead(ctx.cwd, typeof i.path === 'string' && i.path ? i.path : '.')
  const shown = rel(ctx.cwd, abs)
  ctx.emit({ kind: 'read', id, paths: [shown === '.' ? 'project folder' : shown], status: 'running' })
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`${shown} is not a folder.`)
  const entries = readdirSync(abs, { withFileTypes: true })
    .filter((e) => !SKIP_DIRS.has(e.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 500)
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
  ctx.emit({ kind: 'read', id, paths: [shown === '.' ? 'project folder' : shown], status: 'done' })
  return { content: entries.length ? entries.join('\n') : '(empty folder)' }
}

function search(ctx: ToolContext, id: string, i: Input): ToolResult {
  const pattern = str(i.pattern, 'pattern')
  const base = resolveRead(ctx.cwd, typeof i.path === 'string' && i.path ? i.path : '.')
  ctx.emit({ kind: 'read', id, paths: [`“${pattern}”`], status: 'running' })
  let re: RegExp
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') // not valid regex: search for it literally
  }
  const hits: string[] = []
  let files = 0
  const walk = (dir: string): void => {
    if (hits.length >= 80 || files > 4000) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (hits.length >= 80) return
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name))
        continue
      }
      if (!e.isFile()) continue
      const full = join(dir, e.name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.size > 1_000_000) continue
      files++
      const buf = readFileSync(full)
      if (looksBinary(buf)) continue
      buf
        .toString('utf8')
        .split('\n')
        .forEach((line, n) => {
          if (hits.length < 80 && re.test(line)) hits.push(`${rel(ctx.cwd, full)}:${n + 1}: ${line.trim().slice(0, 200)}`)
        })
    }
  }
  if (statSync(base).isDirectory()) walk(base)
  else if (re.test(readFileSync(base, 'utf8'))) hits.push(rel(ctx.cwd, base))
  ctx.emit({ kind: 'read', id, paths: [`“${pattern}”`], status: 'done' })
  return { content: hits.length ? hits.join('\n') + (hits.length >= 80 ? '\n[showing the first 80 matches]' : '') : 'No matches.' }
}

/** Match the file's own line endings so an edit never mixes them. */
const toEol = (text: string, eol: string): string => (eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'))

function applyWrite(ctx: ToolContext, id: string, abs: string, before: string | null, after: string): ToolResult {
  const shown = rel(ctx.cwd, abs)
  if (Buffer.byteLength(after) > MAX_WRITE_BYTES) throw new Error('That file would be larger than 1 MB, which is too big to write in one go.')
  snapshots.set(id, { abs, original: before })
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, after)
  const diff = diffFiles(shown, before, after)
  if (!baselines.has(abs)) baselines.set(abs, before)
  const net = diffFiles(shown, baselines.get(abs) ?? null, after)
  ctx.emit({ kind: 'edit', id, path: shown, added: diff.additions, removed: diff.deletions, netAdded: net.additions, netRemoved: net.deletions, status: 'done', diff })
  return { content: `${before === null ? 'Created' : 'Updated'} ${shown} (+${diff.additions} −${diff.deletions}).` }
}

const indentOf = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? ''

/** The model often gets indentation or trailing spaces slightly wrong. Match whole lines ignoring that, if there is exactly one place it fits. */
function looseReplace(before: string, oldText: string, newText: string): string | { hint: string } {
  const text = before.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n')
  while (oldLines.length && !oldLines[0].trim()) oldLines.shift()
  while (oldLines.length && !oldLines[oldLines.length - 1].trim()) oldLines.pop()
  if (!oldLines.length) return { hint: '' }
  const norm = oldLines.map((l) => l.trim())
  const starts: number[] = []
  for (let s = 0; s + norm.length <= lines.length; s++) {
    if (norm.every((n, k) => lines[s + k].trim() === n)) starts.push(s)
  }
  if (starts.length === 1) {
    const s0 = starts[0]
    const real = indentOf(lines[s0])
    const given = indentOf(oldLines[0])
    const fixed = newText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => (l.trim() && l.startsWith(given) ? real + l.slice(given.length) : l))
    return [...lines.slice(0, s0), ...fixed, ...lines.slice(s0 + norm.length)].join('\n')
  }
  // no single match: point at the nearest line so the next attempt can copy it exactly
  const key = norm.find((n) => n.length >= 4) ?? norm[0]
  const near = lines.findIndex((l) => key && l.includes(key))
  if (near < 0) return { hint: '' }
  const from = Math.max(0, near - 2)
  const shownLines = lines.slice(from, near + 5).map((l, n) => `${String(from + n + 1).padStart(5)}  ${l}`)
  return { hint: `The closest match is around line ${near + 1}:\n${shownLines.join('\n')}` }
}

const failNote = (ctx: ToolContext, abs: string): string => {
  const map = (ctx.editFailures ??= new Map())
  const n = (map.get(abs) ?? 0) + 1
  map.set(abs, n)
  return n >= 2 ? `\nThis is edit failure number ${n} on this file. Stop using edit_file for it: read_file it, then write_file the complete corrected file.` : ''
}

function editFile(ctx: ToolContext, id: string, i: Input): ToolResult {
  const abs = resolveSafe(ctx.cwd, str(i.path, 'path'))
  const shown = rel(ctx.cwd, abs)
  ctx.emit({ kind: 'edit', id, path: shown, added: 0, removed: 0, status: 'running' })
  if (!existsSync(abs)) throw new Error(`There is no file at ${shown}. Use write_file to create it.`)
  const buf = readFileSync(abs)
  if (looksBinary(buf)) throw new Error(`${shown} is a binary file and cannot be edited as text.`)
  const before = buf.toString('utf8')
  const eol = before.includes('\r\n') ? '\r\n' : '\n'
  const oldText = toEol(str(i.old_string, 'old_string'), eol)
  const newText = toEol(str(i.new_string, 'new_string'), eol)
  if (!oldText) throw new Error('old_string is empty. To create a file use write_file.')
  if (oldText === newText) throw new Error('old_string and new_string are the same, so nothing would change.')
  const count = before.split(oldText).length - 1
  if (count === 0) {
    const loose = looseReplace(before, oldText, newText)
    if (typeof loose === 'string') return applyWrite(ctx, id, abs, before, toEol(loose, eol))
    throw new Error(`That text was not found in ${shown}. Copy the exact lines from read_file, including spaces.${loose.hint ? `\n${loose.hint}` : ''}${failNote(ctx, abs)}`)
  }
  if (count > 1 && i.replace_all !== true) {
    throw new Error(`That text appears ${count} times in ${shown}. Add more surrounding lines to make it unique, or set replace_all.${failNote(ctx, abs)}`)
  }
  const after = i.replace_all === true ? before.split(oldText).join(newText) : before.replace(oldText, () => newText)
  return applyWrite(ctx, id, abs, before, after)
}

function writeNewFile(ctx: ToolContext, id: string, i: Input): ToolResult {
  const abs = resolveSafe(ctx.cwd, str(i.path, 'path'))
  const shown = rel(ctx.cwd, abs)
  ctx.emit({ kind: 'edit', id, path: shown, added: 0, removed: 0, status: 'running' })
  if (existsSync(abs) && statSync(abs).isDirectory()) throw new Error(`${shown} is a folder.`)
  const before = existsSync(abs) ? readFileSync(abs, 'utf8') : null
  return applyWrite(ctx, id, abs, before, str(i.content, 'content'))
}

const jobStatus = (job: Job): string =>
  !job.exited ? `running for ${seconds(job)}s` : job.stopped ? 'stopped' : `exited with code ${job.exitCode}`

async function runCommand(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const command = str(i.command, 'command').trim()
  if (!command) throw new Error('The command is empty.')
  const action = classifyCommand(command)
  const reason = typeof i.reason === 'string' ? i.reason : undefined

  const decision = await ctx.ask({ id: `perm-${id}`, action, title: TITLE[action], command, reason })
  if (decision === 'deny') {
    ctx.emit({ kind: 'command', id, label: command.slice(0, 60), command, status: 'error', output: 'Not allowed.' })
    return { content: 'The person did not allow this command. Do not try to run it another way; explain what you needed and ask how to proceed.', isError: true }
  }

  const timeout = Math.min(600, Math.max(5, Number(i.timeout_seconds) || 120))
  const label = reason?.slice(0, 60) || command.slice(0, 60)
  ctx.emit({ kind: 'command', id, label, command, status: 'running' })

  const job = startJob(command, ctx.cwd)
  const background = i.run_in_background === true

  // A command that has already ended: report it like a normal command.
  const finishExited = (): ToolResult => {
    const { text } = takeNew(job)
    const out = clip(text.trim() || '(no output)')
    const ok = job.exitCode === 0 && !job.stopped
    ctx.emit({ kind: 'command', id, label, command, status: ok ? 'done' : 'error', output: out })
    dropJob(job.id)
    const tail = job.stopped ? '\n[stopped]' : job.exitCode !== 0 ? `\n[exit code ${job.exitCode}]` : ''
    return { content: `${out}${tail}`, isError: !ok }
  }

  // Leave it running and hand the AI what it has printed so far.
  const detach = (why: string): ToolResult => {
    markDetached(job)
    const { text } = takeNew(job)
    const out = clip(text.trim() || '(no output yet)')
    const note = `[${why} It is job ${job.id}. Use command_output with id "${job.id}" to read new output or to wait for more (wait_seconds, until), and stop_command to end it.]`
    ctx.emit({ kind: 'command', id, label, command, status: 'done', output: `${out}\n${note}` })
    return { content: `${out}\n${note}` }
  }

  if (background) {
    markDetached(job)
    // Give it a moment, so a command that fails straight away is reported as a failure.
    await waitForJob(job, 3, undefined, ctx.signal)
    return job.exited ? finishExited() : detach('Started in the background and still running; it keeps going while you work.')
  }

  const result = await waitForJob(job, timeout, undefined, ctx.signal)
  if (result === 'aborted') {
    await stopJob(job)
    const { text } = takeNew(job)
    const out = clip(text.trim() || '(no output)')
    ctx.emit({ kind: 'command', id, label, command, status: 'error', output: out })
    dropJob(job.id)
    return { content: `${out}\n[stopped]`, isError: true }
  }
  if (result === 'timeout') return detach(`Still running after ${timeout}s. It was NOT stopped; it now runs in the background.`)
  return finishExited()
}

function pickJob(raw: unknown): Job {
  const all = listJobs()
  const list = all.length ? all.map((j) => `${j.id} (${jobStatus(j)}): ${j.command.slice(0, 60)}`).join('\n') : 'There are no background commands.'
  if (typeof raw === 'string' && raw.trim()) {
    const job = getJob(raw.trim())
    if (!job) throw new Error(`There is no background command “${raw}”.\n${list}`)
    return job
  }
  const running = all.filter((j) => !j.exited)
  const only = running.length === 1 ? running[0] : all.length === 1 ? all[0] : undefined
  if (!only) throw new Error(`Say which one with id.\n${list}`)
  return only
}

async function commandOutput(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const job = pickJob(i.id)
  const until = typeof i.until === 'string' && i.until ? i.until : undefined
  const wait = Math.min(300, Math.max(0, Number(i.wait_seconds) || 0))
  const label = `Output of ${job.id}`
  ctx.emit({ kind: 'command', id, label, command: job.command, status: 'running' })

  const result = wait > 0 || until ? await waitForJob(job, wait || 30, until, ctx.signal) : 'timeout'
  const { text, skipped } = takeNew(job)
  const out = clip(text.trim() || '(no new output)')
  const head = skipped ? `[${skipped} characters of older output were dropped]\n` : ''
  const extra = result === 'matched' ? `; the output contains “${until}”` : result === 'timeout' && (wait > 0 || until) ? `; waited ${wait || 30}s` : ''
  ctx.emit({ kind: 'command', id, label, command: job.command, status: 'done', output: out })
  return { content: `${head}${out}\n[${job.id}: ${jobStatus(job)}${extra}]` }
}

async function stopCommand(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const job = pickJob(i.id)
  const label = `Stop ${job.id}`
  ctx.emit({ kind: 'command', id, label, command: job.command, status: 'running' })
  await stopJob(job)
  const { text } = takeNew(job)
  const out = clip(text.trim() || '(no new output)')
  dropJob(job.id)
  ctx.emit({ kind: 'command', id, label, command: job.command, status: 'done', output: out })
  return { content: `${out}\n[${job.id}: ${jobStatus(job)}]` }
}

function todoWrite(ctx: ToolContext, i: Input): ToolResult {
  const raw = Array.isArray(i.todos) ? i.todos : []
  const items = raw
    .map((t) => t as { content?: unknown; status?: unknown })
    .filter((t) => typeof t.content === 'string' && t.content)
    .map((t) => ({
      text: t.content as string,
      status: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'pending'
    }))
  ctx.emit({ kind: 'todos', id: `todos-${ctx.runId}`, items })
  return { content: 'Task list updated.' }
}

function presentPlan(ctx: ToolContext, id: string, i: Input): ToolResult {
  const steps = (Array.isArray(i.steps) ? i.steps : [])
    .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.):-]\s*/i, '').trim())
  if (!steps.length) throw new Error('A plan needs at least one step.')
  ctx.emit({
    kind: 'plan',
    id: `plan-${id}`,
    title: str(i.title, 'title').slice(0, 90),
    summary: typeof i.summary === 'string' ? i.summary : '',
    steps,
    state: 'draft'
  })
  return { content: 'The plan is now shown to the person for approval. Stop here and wait; do not change any files.', stop: true }
}

/** A short listing of the project (two levels deep) so the AI knows what already exists. */
export function projectTree(cwd: string, limit = 80): string {
  const out: string[] = []
  const walk = (dir: string, depth: number, prefix: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries = entries
      .filter((e) => !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    for (const e of entries) {
      if (out.length >= limit) return
      out.push(`${prefix}${e.name}${e.isDirectory() ? '/' : ''}`)
      if (e.isDirectory() && depth < 2) walk(join(dir, e.name), depth + 1, `${prefix}  `)
    }
  }
  walk(cwd, 1, '')
  return out.length ? out.join('\n') + (out.length >= limit ? '\n…' : '') : '(empty folder)'
}

/* ---------- registry ---------- */

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_dir',
    description: 'List the files and folders in a directory. Use "." for the project root. Any folder on the computer can be listed; use a full path for folders outside the project.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Folder path, relative to the project root or a full path.' } } }
  },
  {
    name: 'read_file',
    description: 'Read a text file. Returns numbered lines. Always read a file before editing it.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'integer', description: 'First line to return (1-based).' },
        end_line: { type: 'integer', description: 'Last line to return.' }
      },
      required: ['path']
    }
  },
  {
    name: 'search',
    description: 'Search file contents in the project for a regular expression or plain text. Returns path:line: text.',
    input_schema: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string', description: 'Limit to this folder or file.' } },
      required: ['pattern']
    }
  },
  {
    name: 'delegate',
    description:
      'Hand a broad, read-only research job to a helper that works alone and reports back in a few lines. Use it ONLY when the answer needs reading many files, for example "find every place the billing code is used and summarise it". Never use it for edits, commands, or anything you can do in one or two tool calls, and never send the same job twice. At most 3 per request.',
    input_schema: {
      type: 'object',
      properties: { task: { type: 'string', description: 'What to find out, with enough detail to work alone.' } },
      required: ['task']
    }
  },
  {
    name: 'edit_file',
    description:
      'Change part of an existing file by replacing exact text. old_string must match the file exactly (including indentation) and be unique unless replace_all is true. Prefer this for small changes. If it fails twice on a file, read the file and use write_file with the full new content instead.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' }
      },
      required: ['path', 'old_string', 'new_string']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file, or replace a file completely with the given content. Missing folders are created. Use paths relative to the project root, with no leading slash.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'run_command',
    description:
      'Run a shell command, starting in the project folder (tests, type checks, builds, git, package managers, scaffolding new projects). Commands are not limited to the project: they can use any folder on the computer, which is also how to create or change files outside the project. The person is asked to approve it first. ' +
      'For anything that keeps running (a dev server, a watcher, a database) set run_in_background to true: it starts, you get what it printed in the first seconds and a job id, and you can keep working. ' +
      'A normal command that is still running when timeout_seconds ends is NOT stopped; it moves to the background and you get its output so far plus a job id. Check on any job with command_output and end it with stop_command.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        reason: { type: 'string', description: 'One short sentence, in plain language, on why this is needed.' },
        timeout_seconds: { type: 'integer', description: 'How long to wait for it to finish before it moves to the background. Default 120, at most 600.' },
        run_in_background: { type: 'boolean', description: 'Start it and return at once, leaving it running. Use for servers and watchers.' }
      },
      required: ['command', 'reason']
    }
  },
  {
    name: 'command_output',
    description:
      'Read what a background command has printed since you last looked, and whether it is still running. Use wait_seconds to wait (it returns early if the command exits), and until to return as soon as the output contains some text, for example "ready" or "Local:". With neither it returns straight away. If there is only one background command, id can be left out.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The job id, for example bg1.' },
        wait_seconds: { type: 'integer', description: 'How long to wait, at most 300.' },
        until: { type: 'string', description: 'Return early once the new output contains this text (not case sensitive).' }
      }
    }
  },
  {
    name: 'stop_command',
    description: 'Stop a background command and everything it started. Use it when you are finished with a server, or before restarting it. If there is only one background command, id can be left out.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'The job id, for example bg1.' } } }
  },
  {
    name: 'todo_write',
    description: 'Show the person a short checklist of your steps and keep it up to date as you work. Send the full list each time.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } },
            required: ['content', 'status']
          }
        }
      },
      required: ['todos']
    }
  },
  {
    name: 'present_plan',
    description:
      'Use this when the person asks for a plan, or before a large or risky change. Shows the plan for approval and ends your turn. Do not change files in the same turn.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string' }, summary: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } },
      required: ['title', 'steps']
    }
  }
]

/** One call to a connector's tool: asks first when the person asked it to, shows a row, returns text for the model. */
async function callConnector(ctx: ToolContext, id: string, name: string, input: Input): Promise<ToolResult> {
  const hit = ctx.mcp?.find(name)
  if (!hit) throw new Error('That connector is not connected right now.')
  const label = hit.config.name
  const row = { kind: 'mcp', id, connectorId: hit.config.id, connector: label, tool: hit.tool, input }
  const perm = hit.config.perms?.[hit.tool] ?? (hit.readOnly ? 'allow' : 'ask')
  if (perm === 'block') return { content: `The person has blocked ${hit.tool} in Customize.`, isError: true }
  let always = false
  if (perm === 'ask') {
    const shown = JSON.stringify(input)
    const d = await ctx.ask({ id: `${id}:ask`, action: 'network', title: `Use ${label}: ${hit.tool}`, command: shown.length > 400 ? `${shown.slice(0, 400)}…` : shown, reason: `Connector: ${label}` })
    if (d === 'deny') return { content: 'The person did not allow this call.', isError: true }
    always = d === 'always'
  }
  ctx.emit({ ...row, status: 'running', ...(always ? { always: true } : {}) })
  const started = Date.now()
  try {
    const r = await hit.client.call(hit.tool, input, AbortSignal.any([ctx.signal, AbortSignal.timeout(90_000)]))
    const text = resultText(r)
    ctx.emit({ ...row, status: r.isError ? 'error' : 'done', output: text.slice(0, 6000), ms: Date.now() - started })
    return { content: clip(text), isError: r.isError }
  } catch (err) {
    const message = (err as Error).message
    ctx.emit({ ...row, status: 'error', output: message, ms: Date.now() - started })
    return { content: message, isError: true }
  }
}

export async function executeTool(name: string, id: string, input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    if ((input as { __invalid?: boolean }).__invalid) {
      throw new Error('Your tool call arrived cut off or was not valid JSON, so nothing ran. Send it again. For a big file, write it in smaller pieces.')
    }
    if (name.startsWith('mcp__')) return await callConnector(ctx, id, name, input)
    switch (name) {
      case 'list_dir':
        return listDir(ctx, id, input)
      case 'read_file':
        return await readFile(ctx, id, input)
      case 'search':
        return search(ctx, id, input)
      case 'delegate': {
        if (!ctx.delegate) throw new Error('Helpers are not available here.')
        return { content: await ctx.delegate(id, str(input.task, 'task')) }
      }
      case 'edit_file':
        return editFile(ctx, id, input)
      case 'write_file':
        return writeNewFile(ctx, id, input)
      case 'run_command':
        return await runCommand(ctx, id, input)
      case 'command_output':
        return await commandOutput(ctx, id, input)
      case 'stop_command':
        return await stopCommand(ctx, id, input)
      case 'todo_write':
        return todoWrite(ctx, input)
      case 'present_plan':
        return presentPlan(ctx, id, input)
      default:
        return { content: `There is no tool called ${name}.`, isError: true }
    }
  } catch (err) {
    const message = (err as Error).message
    // close the row that was opened for this call, so nothing stays "running"
    if (name === 'edit_file' || name === 'write_file') ctx.emit({ kind: 'edit', id, path: String(input.path ?? ''), added: 0, removed: 0, status: 'error', error: message })
    else if (name === 'read_file' || name === 'list_dir' || name === 'search') ctx.emit({ kind: 'read', id, paths: [String(input.path ?? input.pattern ?? '')], status: 'error', error: message })
    return { content: message, isError: true }
  }
}
