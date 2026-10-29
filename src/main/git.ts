import { ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { readFileSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import { getWorkspaceRoot } from './workspace'

/**
 * Git for the Changes tab, using the git (and optionally gh) already on the person's computer.
 * Every call passes arguments as a list, never through a shell, so file names and messages
 * cannot turn into commands.
 */
export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface GitFile {
  path: string
  status: GitFileStatus
  added: number
  removed: number
}

export type GitState =
  | { ok: false; reason: 'no-git' | 'not-repo' }
  | {
      ok: true
      branch: string
      defaultBranch: string
      onDefault: boolean
      files: GitFile[]
      /** Commits not yet pushed to the remote. */
      ahead: number
      hasRemote: boolean
      remoteUrl: string | null
      lastMessage: string | null
      hasGh: boolean
      /** Files left out of `files` (build folders, or more than the list can show). */
      hidden: number
    }

export type GitResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

interface Run {
  code: number
  out: string
  err: string
  missing?: boolean
}

function run(cmd: string, args: string[], cwd: string, timeout = 30_000, maxBuffer = 8 * 1024 * 1024): Promise<Run> {
  return new Promise((done) => {
    execFile(
      cmd,
      args,
      { cwd, timeout, maxBuffer, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) => {
        if (!error) return done({ code: 0, out: String(stdout), err: String(stderr) })
        const e = error as Error & { code?: number | string }
        done({
          code: typeof e.code === 'number' ? e.code : 1,
          out: String(stdout ?? ''),
          err: String(stderr || e.message),
          missing: e.code === 'ENOENT'
        })
      }
    )
  })
}

const git = (args: string[], cwd = getWorkspaceRoot()): Promise<Run> => run('git', args, cwd)

/**
 * Folders full of generated files. A project that has not ignored them (a fresh Electron app with an
 * untracked node_modules, say) would list tens of thousands of files, and reading each one froze the
 * whole app. They are never offered for saving from here, and git is told not to walk into them.
 */
const HEAVY = ['node_modules', 'dist', 'out', 'build', '.next', '.cache', '.venv', 'venv', '__pycache__', 'target', 'vendor', '.turbo', 'coverage']
const HEAVY_SPEC = HEAVY.map((d) => `:(exclude,glob)**/${d}/**`)
const isHeavy = (path: string): boolean => path.split('/').some((part) => HEAVY.includes(part))

/** The most files the Changes list will hold, and how many new files get a line count (each is a disk read). */
const MAX_LISTED = 400
const MAX_COUNTED = 60

/** Turn git's raw complaints into one calm sentence. */
function friendly(raw: string): string {
  const text = raw.trim()
  if (/Authentication failed|could not read Username|Permission denied|403/i.test(text))
    return 'GitHub did not accept your sign-in. Sign in to GitHub on this computer, then try again.'
  if (/Could not resolve host|unable to access|Network is unreachable/i.test(text))
    return 'Could not reach GitHub. Check your internet connection and try again.'
  if (/non-fast-forward|fetch first|rejected/i.test(text))
    return 'The remote has newer changes than your copy. Pull them first, then try again.'
  if (/Please tell me who you are|user\.email|user\.name/i.test(text))
    return 'Git does not know who you are yet. Set your name and email in Git, then try again.'
  if (/nothing to commit/i.test(text)) return 'There is nothing new to save.'
  return text.split('\n').filter(Boolean).slice(-2).join(' ') || 'Something went wrong.'
}

/** A safe branch name: lowercase words joined by dashes, with / allowed between folders. */
const slug = (s: string): string =>
  s
    .split('/')
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
    )
    .filter(Boolean)
    .join('/')

/** Files in the list must stay inside the project. */
function insideRoot(root: string, rel: string): boolean {
  const full = resolve(root, rel)
  return full === root || full.startsWith(root + sep)
}

function countLines(root: string, rel: string): number {
  try {
    const full = join(root, rel)
    const st = statSync(full)
    if (!st.isFile() || st.size > 256 * 1024) return 0
    const text = readFileSync(full, 'utf8')
    return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return 0
  }
}

function parseRemote(url: string): { host: string; owner: string; repo: string } | null {
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)([^/:]+)[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(url.trim())
  return m ? { host: m[1], owner: m[2], repo: m[3] } : null
}

async function defaultBranchOf(cwd: string): Promise<string> {
  const head = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)
  if (head.code === 0 && head.out.trim()) return head.out.trim().replace(/^origin\//, '')
  for (const name of ['main', 'master']) {
    const r = await git(['rev-parse', '--verify', '--quiet', name], cwd)
    if (r.code === 0) return name
  }
  return 'main'
}

async function readState(): Promise<GitState> {
  const cwd = getWorkspaceRoot()
  const inside = await git(['rev-parse', '--is-inside-work-tree'], cwd)
  if (inside.missing) return { ok: false, reason: 'no-git' }
  if (inside.code !== 0) return { ok: false, reason: 'not-repo' }

  const [branchRes, statusRes, numRes, remoteRes, lastRes, gh] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.', ...HEAVY_SPEC], cwd, 20_000, 64 * 1024 * 1024),
    git(['diff', '--numstat', 'HEAD', '--'], cwd),
    git(['remote', 'get-url', 'origin'], cwd),
    git(['log', '-1', '--format=%s'], cwd),
    run('gh', ['--version'], cwd, 5000)
  ])

  const stats = new Map<string, { added: number; removed: number }>()
  for (const line of numRes.out.split('\n')) {
    const [a, r, ...rest] = line.split('\t')
    if (!rest.length) continue
    stats.set(rest.join('\t'), { added: Number(a) || 0, removed: Number(r) || 0 })
  }

  const files: GitFile[] = []
  let hidden = 0
  let counted = 0
  const parts = statusRes.out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    let status: GitFileStatus = 'modified'
    if (code === '??') status = 'untracked'
    else if (code.includes('R')) status = 'renamed'
    else if (code.includes('A')) status = 'added'
    else if (code.includes('D')) status = 'deleted'
    if (code.includes('R') || code.includes('C')) i++ // renames carry the old name next
    if (isHeavy(path) || files.length >= MAX_LISTED) {
      hidden++
      continue
    }
    const s = stats.get(path)
    let added = s?.added ?? 0
    if (!s && status === 'untracked' && counted < MAX_COUNTED) {
      counted++
      added = countLines(cwd, path)
    }
    files.push({ path, status, added, removed: s?.removed ?? 0 })
  }

  const branch = branchRes.code === 0 ? branchRes.out.trim() : 'main'
  const defaultBranch = await defaultBranchOf(cwd)
  const hasRemote = remoteRes.code === 0 && remoteRes.out.trim() !== ''
  let ahead = 0
  if (hasRemote) {
    const up = await git(['rev-list', '--count', '@{upstream}..HEAD'], cwd)
    if (up.code === 0) ahead = Number(up.out.trim()) || 0
    else {
      // never pushed: everything not on the default branch counts
      const base = await git(['rev-list', '--count', `origin/${defaultBranch}..HEAD`], cwd)
      ahead = base.code === 0 ? Number(base.out.trim()) || 0 : 0
    }
  }

  return {
    ok: true,
    branch: branch === 'HEAD' ? 'detached' : branch,
    defaultBranch,
    onDefault: branch === defaultBranch,
    files,
    ahead,
    hasRemote,
    remoteUrl: hasRemote ? remoteRes.out.trim() : null,
    lastMessage: lastRes.code === 0 ? lastRes.out.trim() || null : null,
    hasGh: gh.code === 0,
    hidden
  }
}

export interface CommitRequest {
  message: string
  paths: string[]
  /** Save on a fresh branch instead of the main one. */
  newBranch?: string
}

export interface PrRequest {
  title: string
  body: string
  base: string
}

export function registerGitIpc(): void {
  ipcMain.handle('git:state', () => readState())

  ipcMain.handle('git:init', async (): Promise<GitResult> => {
    const r = await git(['init'])
    return r.code === 0 ? { ok: true } : { ok: false, error: friendly(r.err) }
  })

  ipcMain.handle('git:commit', async (_event, req: CommitRequest): Promise<GitResult<{ branch: string }>> => {
    const cwd = getWorkspaceRoot()
    const message = typeof req?.message === 'string' ? req.message.trim() : ''
    const paths = Array.isArray(req?.paths) ? req.paths.filter((p) => typeof p === 'string' && insideRoot(cwd, p)) : []
    if (!message) return { ok: false, error: 'Add a short description first.' }
    if (!paths.length) return { ok: false, error: 'Choose at least one file to save.' }

    let branch = ''
    if (req.newBranch) {
      const name = slug(req.newBranch) || 'changes'
      const made = await git(['checkout', '-b', name], cwd)
      if (made.code !== 0) return { ok: false, error: friendly(made.err) }
      branch = name
    }

    const add = await git(['add', '-A', '--', ...paths], cwd)
    if (add.code !== 0) return { ok: false, error: friendly(add.err) }
    // only what was ticked: anything else that was already staged stays out of this save
    const hasHead = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd)).code === 0
    const commit = await git(
      hasHead ? ['commit', '-m', message, '--only', '--', ...paths] : ['commit', '-m', message],
      cwd
    )
    if (commit.code !== 0) return { ok: false, error: friendly(commit.err || commit.out) }
    if (!branch) {
      const b = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
      branch = b.out.trim()
    }
    return { ok: true, branch }
  })

  ipcMain.handle('git:create-pr', async (_event, req: PrRequest): Promise<GitResult<{ url: string; opened: boolean }>> => {
    const cwd = getWorkspaceRoot()
    const title = typeof req?.title === 'string' ? req.title.trim() : ''
    if (!title) return { ok: false, error: 'Give the pull request a title.' }
    const base = typeof req.base === 'string' && req.base.trim() ? req.base.trim() : 'main'

    const b = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    const branch = b.out.trim()
    if (!branch || branch === 'HEAD') return { ok: false, error: 'Switch to a branch first.' }
    if (branch === base) return { ok: false, error: `You are on ${base}. Save your changes on a new branch first.` }

    const remote = await git(['remote', 'get-url', 'origin'], cwd)
    const parsed = remote.code === 0 ? parseRemote(remote.out) : null
    if (!parsed) return { ok: false, error: 'This project is not connected to GitHub yet. Add a remote called origin, then try again.' }

    const push = await git(['push', '-u', 'origin', branch], cwd)
    if (push.code !== 0) return { ok: false, error: friendly(push.err) }

    const hasGh = (await run('gh', ['--version'], cwd, 5000)).code === 0
    if (hasGh) {
      const made = await run('gh', ['pr', 'create', '--title', title, '--body', req.body ?? '', '--base', base, '--head', branch], cwd, 60_000)
      const link = /https?:\/\/\S+/.exec(made.out)?.[0]
      if (made.code === 0 && link) return { ok: true, url: link, opened: false }
      // a pull request may already exist for this branch
      const view = await run('gh', ['pr', 'view', branch, '--json', 'url', '--jq', '.url'], cwd, 15_000)
      if (view.code === 0 && view.out.trim().startsWith('http')) return { ok: true, url: view.out.trim(), opened: false }
    }

    // no gh (or it is not signed in): hand the person a ready-filled page on GitHub
    const url =
      `https://${parsed.host}/${parsed.owner}/${parsed.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}` +
      `?expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(req.body ?? '')}`
    await shell.openExternal(url)
    return { ok: true, url, opened: true }
  })

  ipcMain.handle('git:open-url', async (_event, url: string) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) await shell.openExternal(url)
  })
}
