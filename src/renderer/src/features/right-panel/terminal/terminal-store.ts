import { useSyncExternalStore } from 'react'
import { platform } from '@/lib/platform'
import { promptGlyph } from './prompt'

/**
 * Terminal sessions live here, not in the component, so a command keeps running and its output
 * keeps arriving while you look at another tab.
 */
export interface TermEntry {
  id: number
  kind: 'cmd' | 'out' | 'err' | 'info'
  text: string
  /** Folder the command ran in (cmd entries only). */
  cwd?: string
  /** Set on the note added when a command ends with an error. */
  failed?: boolean
}

export interface TermSession {
  entries: TermEntry[]
  cwd: string | null
  /** The project folder this terminal was started for. Opening another project moves the terminal there. */
  base: string | null
  /** Id of the running command, if any. */
  running: string | null
  history: string[]
}

const MAX_CHARS = 300_000
const sessions = new Map<string, TermSession>()
const listeners = new Set<() => void>()
let nextEntry = 1
let wired = false

const empty = (): TermSession => ({ entries: [], cwd: null, base: null, running: null, history: [] })
const emit = (): void => listeners.forEach((l) => l())
const term = (): Window['api']['terminal'] | undefined => window.api?.terminal

function session(tabId: string): TermSession {
  let s = sessions.get(tabId)
  if (!s) {
    s = empty()
    sessions.set(tabId, s)
  }
  return s
}

/** Sessions are replaced, never mutated, so React sees every change. */
function update(tabId: string, fn: (s: TermSession) => TermSession): void {
  sessions.set(tabId, fn(session(tabId)))
  emit()
}

const add = (tabId: string, kind: TermEntry['kind'], text: string, cwd?: string): void =>
  update(tabId, (s) => ({ ...s, entries: [...s.entries, { id: nextEntry++, kind, text, cwd }] }))

/** Normalize carriage-return (\r) progress updates so spinners update in place instead of flooding lines. */
function normalizeChunk(prev: string, chunk: string): string {
  const combined = prev + chunk.replace(/\r\n/g, '\n')
  if (!combined.includes('\r')) return combined
  return combined
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line
      const parts = line.split('\r')
      return parts[parts.length - 1]
    })
    .join('\n')
}

/** Output arrives in pieces: glue pieces of the same stream onto the last entry. */
function appendOutput(tabId: string, kind: 'out' | 'err', chunk: string): void {
  update(tabId, (s) => {
    const entries = [...s.entries]
    const last = entries[entries.length - 1]
    if (last && last.kind === kind) {
      entries[entries.length - 1] = { ...last, text: normalizeChunk(last.text, chunk) }
    } else {
      entries.push({ id: nextEntry++, kind, text: normalizeChunk('', chunk) })
    }
    // keep memory bounded: drop the oldest output first
    let total = entries.reduce((n, e) => n + e.text.length, 0)
    while (total > MAX_CHARS && entries.length > 1) total -= entries.shift()?.text.length ?? 0
    return { ...s, entries }
  })
}

function wire(): void {
  if (wired || !term()) return
  wired = true
  term()?.onData(({ id, stream, chunk }) => {
    const tabId = id.split('::')[0]
    appendOutput(tabId, stream, chunk)
  })
  term()?.onExit(({ id, code }) => {
    const tabId = id.split('::')[0]
    update(tabId, (s) => ({ ...s, running: null }))
    if (code && code !== 0) {
      update(tabId, (s) => ({
        ...s,
        entries: [...s.entries, { id: nextEntry++, kind: 'info', text: `Exited with code ${code}`, failed: true }]
      }))
    }
  })
}

export const terminalAvailable = (): boolean => Boolean(term())

/**
 * Start a terminal in a project's folder. The same project keeps wherever the person has `cd`-ed to;
 * a different project moves the terminal to that project's folder.
 */
export async function ensureStarted(tabId: string, folder: string | null): Promise<void> {
  wire()
  const s = session(tabId)
  const base = folder ?? ''
  if (!term() || s.running) return
  if (s.cwd && s.base === base) return
  const cwd = await term()!.startDir(folder)
  const switching = s.cwd !== null
  update(tabId, (cur) => ({ ...cur, cwd, base }))
  if (switching) add(tabId, 'info', `Moved to ${cwd}`)
}

export async function runCommand(tabId: string, raw: string): Promise<void> {
  const command = raw.trim()
  const t = term()
  const s = session(tabId)
  if (!command || !t || !s.cwd || s.running) return
  update(tabId, (cur) => ({
    ...cur,
    history: cur.history[cur.history.length - 1] === command ? cur.history : [...cur.history, command]
  }))
  add(tabId, 'cmd', command, s.cwd)

  // built-ins that change the shell itself rather than run a program
  if (/^cls$|^clear$/i.test(command)) return clearTerminal(tabId)
  // a plain "cd x" (or a bare drive like "D:") moves this terminal; "cd x && npm i" runs as a normal command
  const chained = /&&|\|\||[;|&]/.test(command)
  const cd = chained ? null : /^cd(?:\s+(.*))?$/i.exec(command) ?? (/^[a-z]:$/i.test(command) ? ['', command] : null)
  if (cd) {
    const res = await t.cd(s.cwd, cd[1] ?? '')
    if (res.ok) update(tabId, (cur) => ({ ...cur, cwd: res.cwd }))
    else add(tabId, 'err', `${res.error}\n`)
    return
  }

  const id = `${tabId}::${crypto.randomUUID().slice(0, 6)}`
  update(tabId, (cur) => ({ ...cur, running: id }))
  t.run(id, command, s.cwd)
}

export function sendTerminalInput(tabId: string, raw: string): void {
  const id = session(tabId).running
  if (!id) return
  appendOutput(tabId, 'out', `${raw}\n`)
  term()?.input(id, `${raw}\n`)
}

export function stopCommand(tabId: string): void {
  const id = session(tabId).running
  if (id) {
    term()?.kill(id)
    add(tabId, 'info', 'Stopped')
  }
}

export function clearTerminal(tabId: string): void {
  update(tabId, (s) => ({ ...s, entries: [] }))
}

/** Stop whatever is running and forget the session. Called when its tab closes. */
export function disposeTerminal(tabId: string): void {
  const running = sessions.get(tabId)?.running
  if (running) term()?.kill(running)
  sessions.delete(tabId)
  emit()
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g')
const MAX_SHARED = 6000

/**
 * The last command and everything it printed, as plain text, ready to hand to the AI.
 * Colour codes are removed and very long output keeps its end, where errors usually are.
 */
export function recentOutput(tabId: string): { text: string; failed: boolean } | null {
  const entries = session(tabId).entries
  let start = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].kind === 'cmd') {
      start = i
      break
    }
  }
  if (start < 0) return null
  const block = entries.slice(start)
  const text = block
    .map((e) => (e.kind === 'cmd' ? `${promptGlyph(platform)} ${e.text}` : e.text.replace(ANSI, '')))
    .join('\n')
    .trim()
  return {
    text: text.length > MAX_SHARED ? `…\n${text.slice(-MAX_SHARED)}` : text,
    failed: block.some((e) => e.failed || e.kind === 'err')
  }
}

export function useTerminalSession(tabId: string): TermSession {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => session(tabId),
    () => session(tabId)
  )
}
