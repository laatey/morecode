import { spawn, execFile, type ChildProcess } from 'child_process'

/**
 * Commands the AI starts are "jobs". A job keeps running after the tool call that started it
 * returns, so the AI can start a dev server, carry on working, and come back later to read
 * what it printed (command_output) or stop it (stop_command).
 */

export interface Job {
  id: string
  command: string
  cwd: string
  pid: number | undefined
  startedAt: number
  exited: boolean
  exitCode: number | null
  /** Set when the job was ended on purpose (stop_command, abort, app quit). */
  stopped: boolean
  /** True once the job is detached to run in the background (so short foreground commands do not flash in the UI). */
  detached: boolean
  /** Text kept in memory (the end of the output when it is very long). */
  buf: string
  /** Characters dropped from the front of buf, so read positions stay valid. */
  dropped: number
  /** Absolute position up to which the AI has already been shown the output. */
  read: number
  child: ChildProcess
  waiters: Set<() => void>
}

export interface JobSnapshot {
  id: string
  command: string
  cwd: string
  startedAt: number
  exited: boolean
  exitCode: number | null
  stopped: boolean
  output: string
}

const MAX_BUF = 200_000
const KEEP_BUF = 100_000
const MAX_JOBS = 20

const jobs = new Map<string, Job>()
const listeners = new Set<(list: JobSnapshot[]) => void>()
let counter = 0
let broadcastTimer: ReturnType<typeof setTimeout> | null = null

export function listJobSnapshots(): JobSnapshot[] {
  return [...jobs.values()]
    .filter((j) => j.detached)
    .map((j) => ({
      id: j.id,
      command: j.command,
      cwd: j.cwd,
      startedAt: j.startedAt,
      exited: j.exited,
      exitCode: j.exitCode,
      stopped: j.stopped,
      output: j.buf.slice(-4000)
    }))
}

function broadcast(immediate = false): void {
  if (!listeners.size) return
  if (immediate) {
    if (broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = null
    }
    const snap = listJobSnapshots()
    for (const fn of listeners) fn(snap)
    return
  }
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    const snap = listJobSnapshots()
    for (const fn of listeners) fn(snap)
  }, 200)
  broadcastTimer.unref?.()
}

export function onJobsChange(fn: (list: JobSnapshot[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function markDetached(job: Job): void {
  if (job.detached) return
  job.detached = true
  broadcast(true)
}

export function killTree(child: ChildProcess): void {
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

function notify(job: Job): void {
  for (const w of [...job.waiters]) w()
}

function prune(): void {
  if (jobs.size <= MAX_JOBS) return
  for (const [id, j] of jobs) {
    if (jobs.size <= MAX_JOBS) break
    if (j.exited) jobs.delete(id)
  }
}

export function startJob(command: string, cwd: string): Job {
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: { ...process.env, CI: '1', NO_COLOR: '1', TERM: 'dumb' }
  })
  const job: Job = {
    id: `bg${++counter}`,
    command,
    cwd,
    pid: child.pid,
    startedAt: Date.now(),
    exited: false,
    exitCode: null,
    stopped: false,
    detached: false,
    buf: '',
    dropped: 0,
    read: 0,
    child,
    waiters: new Set()
  }
  const add = (d: Buffer): void => {
    job.buf += d.toString('utf8')
    if (job.buf.length > MAX_BUF) {
      const cut = job.buf.length - KEEP_BUF
      job.buf = job.buf.slice(cut)
      job.dropped += cut
    }
    notify(job)
    if (job.detached) broadcast(false)
  }
  child.stdout?.on('data', add)
  child.stderr?.on('data', add)
  child.on('error', (e) => {
    add(Buffer.from(`${e.message}\n`))
    job.exited = true
    job.exitCode = 1
    notify(job)
    if (job.detached) broadcast(true)
  })
  child.on('close', (code) => {
    job.exited = true
    job.exitCode = code
    notify(job)
    if (job.detached) broadcast(true)
  })
  jobs.set(job.id, job)
  prune()
  return job
}

export const getJob = (id: string): Job | undefined => jobs.get(id)
export const listJobs = (): Job[] => [...jobs.values()]
export const dropJob = (id: string): void => {
  const had = jobs.get(id)?.detached
  jobs.delete(id)
  if (had) broadcast(true)
}

/** Everything printed so far (the end of it, if it was very long), without moving the read position. */
export const allOutput = (job: Job): string => job.buf

/** Output the AI has not seen yet. Moves the read position forward. */
export function takeNew(job: Job): { text: string; skipped: number } {
  const total = job.dropped + job.buf.length
  const from = Math.max(job.read, job.dropped)
  const skipped = from - job.read
  const text = job.buf.slice(from - job.dropped)
  job.read = total
  return { text, skipped }
}

export type WaitResult = 'exited' | 'matched' | 'timeout' | 'aborted'

/**
 * Wait until the job exits, new output contains `until`, the time runs out, or the run is
 * stopped. The job itself is never touched: stopping a wait does not stop the job.
 */
export function waitForJob(job: Job, seconds: number, until: string | undefined, signal: AbortSignal): Promise<WaitResult> {
  const needle = until?.toLowerCase()
  const startAt = job.dropped + job.buf.length
  const matched = (): boolean => {
    if (!needle) return false
    const from = Math.max(job.read, job.dropped, startAt - needle.length)
    return job.buf.slice(from - job.dropped).toLowerCase().includes(needle)
  }
  return new Promise<WaitResult>((resolve) => {
    if (job.exited) return resolve('exited')
    if (matched()) return resolve('matched')
    if (signal.aborted) return resolve('aborted')
    let timer: ReturnType<typeof setTimeout> | undefined
    const end = (r: WaitResult): void => {
      if (timer) clearTimeout(timer)
      job.waiters.delete(check)
      signal.removeEventListener('abort', onAbort)
      resolve(r)
    }
    const check = (): void => {
      if (job.exited) end('exited')
      else if (matched()) end('matched')
    }
    const onAbort = (): void => end('aborted')
    job.waiters.add(check)
    signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => end('timeout'), Math.max(0, seconds) * 1000)
  })
}

/** End a job and its child processes. Resolves once it has exited (or after a short wait). */
export async function stopJob(job: Job): Promise<void> {
  if (job.exited) return
  job.stopped = true
  if (job.detached) broadcast(true)
  killTree(job.child)
  await waitForJob(job, 3, undefined, new AbortController().signal)
  if (!job.exited && process.platform !== 'win32' && job.child.pid) {
    try {
      process.kill(-job.child.pid, 'SIGKILL')
    } catch {
      job.child.kill('SIGKILL')
    }
    await waitForJob(job, 2, undefined, new AbortController().signal)
  }
  if (job.detached) broadcast(true)
}

/** The app is quitting: do not leave servers running behind it. */
export function stopAllJobs(): void {
  for (const j of jobs.values()) {
    if (!j.exited) {
      j.stopped = true
      killTree(j.child)
    }
  }
}

export const seconds = (job: Job): number => Math.round((Date.now() - job.startedAt) / 1000)
