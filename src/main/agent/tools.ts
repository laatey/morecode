import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { setWorkspaceRoot } from '../workspace'
import type { ToolDef } from './anthropic'
import { diffFiles } from './diff'

/**
 * The things the AI is allowed to do, all confined to the project folder.
 * Every function returns text for the model; what the person sees goes out through `ctx.emit`.
 */

export type Decision = 'once' | 'always' | 'deny'
export type PermissionAction = 'command' | 'install' | 'remove' | 'network'

export interface ToolContext {
  cwd: string
  /** Documents-based parent for new standalone projects. */
  newProjectRoot?: string
  signal: AbortSignal
  emit: (tool: Record<string, unknown>) => void
  ask: (req: { id: string; action: PermissionAction; title: string; command: string; reason?: string }) => Promise<Decision>
  runId: string
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
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.next', '.cache', 'coverage', '.venv', 'venv', 'target', '__pycache__'])

/* ---------- keeping the AI inside the project folder ---------- */

/** Resolve a path the model gave us; refuse anything outside the project (including via symlinks). */
export function resolveSafe(cwd: string, p: string): string {
  const root = realpathSync(cwd)
  const abs = isAbsolute(p) ? resolve(p) : resolve(root, p)
  // follow symlinks on the part that already exists
  let probe = abs
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
  const real = existsSync(probe) ? realpathSync(probe) : probe
  const tail = relative(probe, abs)
  const finalPath = resolve(real, tail)
  if (finalPath !== root && !finalPath.startsWith(root + sep)) {
    throw new Error(`“${p}” is outside the project folder, so it is off limits.`)
  }
  if (relative(root, finalPath).split(sep)[0] === '.git') {
    throw new Error('The .git folder is managed by git and cannot be changed here.')
  }
  return finalPath
}

const rel = (cwd: string, abs: string): string => relative(realpathSync(cwd), abs).split(sep).join('/') || '.'

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
  return true
}

/** The person kept an edit; the undo copy is no longer needed. */
export function keepEdit(id: string): void {
  snapshots.delete(id)
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

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => undefined)
  else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

/* ---------- the tools ---------- */

type Input = Record<string, unknown>
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`“${name}” must be text.`)
  return v
}

const PROJECT_TEMPLATES = new Set(['vanilla', 'vanilla-ts', 'vue', 'vue-ts', 'react', 'react-ts', 'svelte', 'svelte-ts'])
const projectSlug = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Create a standalone Vite project under Documents, then move the agent into it. */
async function createProject(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const name = projectSlug(str(i.name, 'name'))
  const template = typeof i.template === 'string' ? i.template : 'react-ts'
  if (!name) throw new Error('Use a short project name made from letters or numbers.')
  if (!PROJECT_TEMPLATES.has(template)) throw new Error(`“${template}” is not a supported Vite template.`)
  if (!ctx.newProjectRoot) throw new Error('The Documents project folder is not available in this version of MoreCode.')
  const parent = resolve(ctx.newProjectRoot)
  const target = join(parent, name)
  if (existsSync(target)) throw new Error(`${target} already exists. Choose another name or open that folder.`)

  const command = `npm create vite@latest ${JSON.stringify(target)} -- --template ${template}`
  const decision = await ctx.ask({
    id: `perm-${id}`,
    action: 'install',
    title: 'Create a new project',
    command,
    reason: `Create ${name} in Documents\\MoreCode Projects with the ${template} template.`
  })
  if (decision === 'deny') return { content: 'The person did not allow the project to be created.', isError: true }

  ctx.emit({ kind: 'command', id, label: `Create ${name}`, command, status: 'running' })
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const output = await new Promise<{ code: number | null; text: string }>((done) => {
    let text = ''
    const child = spawn(npm, ['create', 'vite@latest', target, '--', '--template', template], {
      cwd: parent,
      windowsHide: true,
      env: { ...process.env, CI: '1', NO_COLOR: '1', TERM: 'dumb' }
    })
    const add = (chunk: Buffer): void => {
      text += chunk.toString('utf8')
      if (text.length > 200_000) text = text.slice(-100_000)
    }
    child.stdout?.on('data', add)
    child.stderr?.on('data', add)
    child.on('error', (error) => done({ code: 1, text: error.message }))
    child.on('close', (code) => done({ code, text }))
  })
  const shown = clip(output.text.trim() || '(no output)')
  if (output.code !== 0 || !existsSync(target)) {
    ctx.emit({ kind: 'command', id, label: `Create ${name}`, command, status: 'error', output: shown })
    return { content: `${shown}\n[exit code ${output.code}]`, isError: true }
  }
  ctx.cwd = target
  setWorkspaceRoot(target)
  ctx.emit({ kind: 'project', name: basename(target), path: target })
  ctx.emit({ kind: 'command', id, label: `Create ${name}`, command, status: 'done', output: shown })
  return { content: `Created ${basename(target)} in ${target}. This is now the active project folder. Install dependencies before starting the dev server.` }
}

async function readFile(ctx: ToolContext, id: string, i: Input): Promise<ToolResult> {
  const abs = resolveSafe(ctx.cwd, str(i.path, 'path'))
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
  const abs = resolveSafe(ctx.cwd, typeof i.path === 'string' && i.path ? i.path : '.')
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
  const base = resolveSafe(ctx.cwd, typeof i.path === 'string' && i.path ? i.path : '.')
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
  ctx.emit({ kind: 'edit', id, path: shown, added: diff.additions, removed: diff.deletions, status: 'done', diff })
  return { content: `${before === null ? 'Created' : 'Updated'} ${shown} (+${diff.additions} −${diff.deletions}).` }
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
  if (count === 0) throw new Error(`That text was not found in ${shown}. Read the file again and copy the exact lines, including spaces.`)
  if (count > 1 && i.replace_all !== true) {
    throw new Error(`That text appears ${count} times in ${shown}. Add more surrounding lines to make it unique, or set replace_all.`)
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

  const timeout = Math.min(600, Math.max(5, Number(i.timeout_seconds) || 120)) * 1000
  ctx.emit({ kind: 'command', id, label: reason?.slice(0, 60) || command.slice(0, 60), command, status: 'running' })

  return new Promise<ToolResult>((done) => {
    let output = ''
    let timedOut = false
    const child = spawn(command, {
      cwd: ctx.cwd,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, CI: '1', NO_COLOR: '1', TERM: 'dumb' }
    })
    const add = (d: Buffer): void => {
      output += d.toString('utf8')
      if (output.length > 200_000) output = output.slice(-100_000) // keep memory bounded on noisy commands
    }
    child.stdout?.on('data', add)
    child.stderr?.on('data', add)
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeout)
    const onAbort = (): void => killTree(child)
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    const finish = (code: number | null, error?: string): void => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      const text = clip(output.trim() || error || '(no output)')
      const ok = code === 0 && !timedOut
      ctx.emit({ kind: 'command', id, label: reason?.slice(0, 60) || command.slice(0, 60), command, status: ok ? 'done' : 'error', output: text })
      const tail = timedOut ? `\n[stopped after ${timeout / 1000}s]` : code !== 0 ? `\n[exit code ${code}]` : ''
      done({ content: `${text}${tail}`, isError: !ok })
    }
    child.on('error', (e) => finish(1, e.message))
    child.on('close', (code) => finish(code))
  })
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
  const steps = (Array.isArray(i.steps) ? i.steps : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '')
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

/* ---------- registry ---------- */

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'create_project',
    description: 'Create a new standalone Vite project in the person’s Documents\\MoreCode Projects folder and make it the active project. Use this instead of scaffolding inside the current project when the person asks for a new project without a location.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short project name.' },
        template: { type: 'string', enum: [...PROJECT_TEMPLATES], description: 'Vite template.' }
      },
      required: ['name', 'template']
    }
  },
  {
    name: 'list_dir',
    description: 'List the files and folders in a directory of the project. Use "." for the project root.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Folder path relative to the project root.' } } }
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
    name: 'edit_file',
    description:
      'Change part of an existing file by replacing exact text. old_string must match the file exactly (including indentation) and be unique unless replace_all is true. Prefer this over rewriting a whole file.',
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
    description: 'Create a new file, or replace a file completely with the given content. Missing folders are created.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'run_command',
    description:
      'Run a shell command in the project folder (tests, type checks, builds, git, package managers). The person is asked to approve it first. Do not run long-lived servers; they will be stopped after the timeout.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        reason: { type: 'string', description: 'One short sentence, in plain language, on why this is needed.' },
        timeout_seconds: { type: 'integer' }
      },
      required: ['command', 'reason']
    }
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

export async function executeTool(name: string, id: string, input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    switch (name) {
      case 'create_project':
        return await createProject(ctx, id, input)
      case 'list_dir':
        return listDir(ctx, id, input)
      case 'read_file':
        return await readFile(ctx, id, input)
      case 'search':
        return search(ctx, id, input)
      case 'edit_file':
        return editFile(ctx, id, input)
      case 'write_file':
        return writeNewFile(ctx, id, input)
      case 'run_command':
        return await runCommand(ctx, id, input)
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
    if (name === 'edit_file' || name === 'write_file') ctx.emit({ kind: 'edit', id, path: String(input.path ?? ''), added: 0, removed: 0, status: 'error' })
    else if (name === 'read_file' || name === 'list_dir' || name === 'search') ctx.emit({ kind: 'read', id, paths: [String(input.path ?? input.pattern ?? '')], status: 'error' })
    return { content: message, isError: true }
  }
}
