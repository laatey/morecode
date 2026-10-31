import { execFile } from 'child_process'
import { isAbsolute, relative, resolve, sep } from 'path'
import { readFileSync, statSync } from 'fs'
import { diffFiles, type FileDiff } from './diff'
import type { GitFileState, GitStatusFile, GitView } from '../../shared/git-view'

/**
 * Git for the AI, using the git (and gh) already on the computer, always inside the folder the chat
 * works in. Arguments go in as a list and never through a shell, so a file name or a message cannot
 * turn into a command. Each function returns the text the model reads and a small, plain `view`
 * the chat draws.
 */

export type { GitFileState, GitStatusFile, GitView }

export interface GitOutcome {
  text: string
  view: GitView
}

type Input = Record<string, unknown>

interface Run {
  code: number
  out: string
  err: string
  missing?: boolean
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeout = 30_000,
  maxBuffer = 16 * 1024 * 1024
): Promise<Run> {
  return new Promise((done) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        timeout,
        maxBuffer,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C' }
      },
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

const git = (args: string[], cwd: string, timeout?: number): Promise<Run> =>
  run('git', args, cwd, timeout)

/** Folders full of generated files: never listed, never staged by a blanket "save everything". */
const HEAVY = [
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  '.turbo',
  'coverage'
]
const HEAVY_SPEC = HEAVY.map((d) => `:(exclude,glob)**/${d}/**`)
const isHeavy = (path: string): boolean => path.split('/').some((p) => HEAVY.includes(p))

/** Files that usually hold secrets. A blanket commit leaves them out and says so. */
export const looksSecret = (path: string): boolean =>
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?$/i.test(path) ||
  /\.(pem|key|p12|pfx)$/i.test(path) ||
  /(^|\/)id_(rsa|ed25519|ecdsa)$/i.test(path)

/** One calm sentence for git's raw complaints. */
export function friendly(raw: string): string {
  const text = raw.trim()
  if (/Authentication failed|could not read Username|Permission denied|403/i.test(text))
    return 'GitHub did not accept the sign-in on this computer. The person needs to sign in to GitHub (for example with gh auth login), then try again.'
  if (/Could not resolve host|unable to access|Network is unreachable/i.test(text))
    return 'Could not reach the remote. Check the internet connection.'
  if (/non-fast-forward|fetch first|\[rejected\]/i.test(text))
    return 'The remote has newer commits than this copy. Pull them first (run_command with git pull), then push again.'
  if (/Please tell me who you are|user\.email|user\.name/i.test(text))
    return 'Git does not know who is committing yet. The person must set user.name and user.email in Git first.'
  if (/nothing to commit|no changes added/i.test(text)) return 'There is nothing to commit.'
  if (/no upstream|has no upstream/i.test(text)) return 'This branch is not on the remote yet.'
  if (/not a git repository/i.test(text)) return 'This folder is not a git repository.'
  if (/would be overwritten|Your local changes/i.test(text))
    return 'Switching would overwrite uncommitted changes. Commit or stash them first.'
  if (/already exists/i.test(text)) return text.split('\n').filter(Boolean).slice(-1)[0]
  return text.split('\n').filter(Boolean).slice(-3).join(' ') || 'Git reported an error.'
}

async function ensureRepo(cwd: string): Promise<void> {
  const r = await git(['rev-parse', '--is-inside-work-tree'], cwd, 10_000)
  if (r.missing) throw new Error('Git is not installed on this computer.')
  if (r.code !== 0)
    throw new Error(
      'This folder is not a git repository. If the person wants one, ask first, then run git init with run_command.'
    )
}

const hasHead = async (cwd: string): Promise<boolean> =>
  (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd, 10_000)).code === 0

async function currentBranch(cwd: string): Promise<string> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, 10_000)
  const name = r.out.trim()
  if (r.code === 0 && name) return name === 'HEAD' ? 'detached HEAD' : name
  const sym = await git(['symbolic-ref', '--short', 'HEAD'], cwd, 10_000) // a repo with no commits yet
  return sym.out.trim() || 'main'
}

/** Strip a password or token out of a remote address before it is shown. */
export const cleanRemote = (url: string): string => url.trim().replace(/\/\/[^/@]+@/, '//')

const clip = (s: string, max = 12_000): string =>
  s.length <= max ? s : `${s.slice(0, max)}\n… [${s.length - max} more characters left out]`

/** Keeps a path the model gave us inside the working folder. */
function inside(cwd: string, p: string): string {
  const abs = isAbsolute(p) ? resolve(p) : resolve(cwd, p)
  const root = resolve(cwd)
  if (abs !== root && !abs.startsWith(root + sep))
    throw new Error(`“${p}” is outside the project folder.`)
  return relative(root, abs).split(sep).join('/') || '.'
}

/* ---------- status ---------- */

const LETTER: Record<GitFileState, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?'
}

export async function gitStatus(cwd: string): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const [st, num] = await Promise.all([
    git(
      ['status', '--porcelain=v1', '-z', '-b', '--untracked-files=all', '--', '.', ...HEAVY_SPEC],
      cwd
    ),
    git(['diff', '--numstat', 'HEAD', '--'], cwd)
  ])
  if (st.code !== 0) throw new Error(friendly(st.err))

  const stats = new Map<string, { a: number; r: number }>()
  for (const line of num.out.split('\n')) {
    const [a, r, ...rest] = line.split('\t')
    if (rest.length) stats.set(rest.join('\t'), { a: Number(a) || 0, r: Number(r) || 0 })
  }

  const parts = st.out.split('\0')
  let branch = 'main'
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const files: GitStatusFile[] = []
  let hidden = 0
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.startsWith('## ')) {
      const head = entry.slice(3)
      const track = /\[(.*)\]\s*$/.exec(head)?.[1] ?? ''
      ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0)
      behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0)
      const names = head.replace(/\s*\[.*\]\s*$/, '')
      const [local, remote] = names.split('...')
      branch = /^No commits yet on /.test(local)
        ? local.replace(/^No commits yet on /, '')
        : /^HEAD \(no branch\)/.test(local)
          ? 'detached HEAD'
          : local
      upstream = remote || undefined
      continue
    }
    if (entry.length < 4) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++ // a rename carries its old name next
    if (isHeavy(path)) {
      hidden++
      continue
    }
    const code = `${x}${y}`
    const state: GitFileState =
      code === '??'
        ? 'untracked'
        : code.includes('R')
          ? 'renamed'
          : code.includes('D')
            ? 'deleted'
            : code.includes('A')
              ? 'added'
              : 'modified'
    if (files.length >= 200) {
      hidden++
      continue
    }
    const s = stats.get(path)
    files.push({
      path,
      state,
      staged: x !== ' ' && x !== '?',
      added: s?.a ?? 0,
      removed: s?.r ?? 0
    })
  }

  const lines = [
    `Branch: ${branch}${upstream ? ` (tracks ${upstream}${ahead ? `, ${ahead} ahead` : ''}${behind ? `, ${behind} behind` : ''})` : ' (no upstream)'}`,
    files.length
      ? `${files.length} changed file${files.length === 1 ? '' : 's'}:`
      : 'Working tree clean.',
    ...files
      .slice(0, 80)
      .map(
        (f) =>
          `${LETTER[f.state]}${f.staged ? '*' : ' '} ${f.path}${f.added || f.removed ? `  (+${f.added} -${f.removed})` : ''}`
      )
  ]
  if (files.length > 80 || hidden)
    lines.push(`… and ${Math.max(0, files.length - 80) + hidden} more not listed`)
  if (files.length) lines.push('(* = already staged)')
  return {
    text: lines.join('\n'),
    view: { op: 'status', branch, upstream, ahead, behind, files, hidden }
  }
}

/* ---------- diff ---------- */

/** Reads `git diff` output into the shape the chat draws. */
export function parseUnifiedDiff(
  text: string,
  maxFiles = 25,
  maxLines = 500
): { files: FileDiff[]; omitted: number } {
  const files: FileDiff[] = []
  let omitted = 0
  let cur = null as FileDiff | null
  let hunk = null as FileDiff['hunks'][number] | null
  let oldNo = 0
  let newNo = 0
  let kept = 0
  const start = (path: string): void => {
    if (files.length >= maxFiles) {
      omitted++
      cur = null
      hunk = null
      return
    }
    cur = { path, action: 'update', additions: 0, deletions: 0, hunks: [] }
    files.push(cur)
    hunk = null
    kept = 0
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
      start(m ? m[2] : line.slice(11))
      continue
    }
    if (!cur) continue
    if (line.startsWith('new file mode')) cur.action = 'create'
    else if (line.startsWith('deleted file mode')) cur.action = 'delete'
    else if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (!m) continue
      oldNo = Number(m[1])
      newNo = Number(m[2])
      hunk = { oldStart: oldNo, newStart: newNo, lines: [] }
      cur.hunks.push(hunk)
    } else if (hunk && (line[0] === '+' || line[0] === '-' || line[0] === ' ')) {
      const type = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'ctx'
      if (type === 'add') cur.additions++
      else if (type === 'del') cur.deletions++
      if (kept < maxLines) {
        hunk.lines.push({
          type,
          text: line.slice(1),
          oldNo: type === 'add' ? null : oldNo,
          newNo: type === 'del' ? null : newNo
        })
        kept++
      }
      if (type !== 'add') oldNo++
      if (type !== 'del') newNo++
    }
  }
  return { files, omitted }
}

export async function gitDiff(cwd: string, i: Input): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const staged = i.staged === true
  const path = typeof i.path === 'string' && i.path.trim() ? inside(cwd, i.path.trim()) : null
  const base = typeof i.base === 'string' && i.base.trim() ? i.base.trim() : ''
  if (base && !/^[\w./~^@{}-]{1,100}$/.test(base))
    throw new Error('That is not a branch or commit name.')
  if (base.startsWith('-')) throw new Error('That is not a branch or commit name.')
  const args = [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '-U3',
    ...(staged ? ['--cached'] : []),
    ...(base ? [base] : []),
    '--',
    ...(path ? [path] : ['.', ...HEAVY_SPEC])
  ]
  const r = await git(args, cwd)
  if (r.code !== 0) throw new Error(friendly(r.err))

  const parsed = parseUnifiedDiff(r.out)
  let files = parsed.files
  let omitted = parsed.omitted

  // new files are not in `git diff`: show them as additions (small ones only)
  if (!staged && !base) {
    const un = await git(
      [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        path ?? '.',
        ...(path ? [] : HEAVY_SPEC)
      ],
      cwd
    )
    for (const rel of un.out.split('\0').filter(Boolean)) {
      if (isHeavy(rel) || looksSecret(rel)) continue
      if (files.length >= 25) {
        omitted++
        continue
      }
      try {
        const abs = resolve(cwd, rel)
        const st = statSync(abs)
        if (!st.isFile() || st.size > 100 * 1024) {
          omitted++
          continue
        }
        const body = readFileSync(abs, 'utf8')
        if (body.includes('\0')) continue
        files.push(diffFiles(rel, null, body))
      } catch {
        /* unreadable: leave it out */
      }
    }
  }

  const added = files.reduce((n, f) => n + f.additions, 0)
  const removed = files.reduce((n, f) => n + f.deletions, 0)
  const scope = base ? `against ${base}` : staged ? 'staged changes' : 'unstaged changes'
  const raw = r.out.trim()
  const text = !files.length
    ? `No ${scope}${path ? ` in ${path}` : ''}.`
    : `${files.length} file${files.length === 1 ? '' : 's'} changed (+${added} -${removed}), ${scope}:\n\n${clip(raw || files.map((f) => `new file ${f.path} (+${f.additions})`).join('\n'))}`
  files = files.map((f) => ({ ...f }))
  return { text, view: { op: 'diff', scope, files, added, removed, omitted } }
}

/* ---------- log ---------- */

export async function gitLog(cwd: string, i: Input): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const limit = Math.min(50, Math.max(1, Math.floor(Number(i.limit) || 15)))
  const path = typeof i.path === 'string' && i.path.trim() ? inside(cwd, i.path.trim()) : undefined
  if (!(await hasHead(cwd)))
    return { text: 'There are no commits yet.', view: { op: 'log', commits: [], path } }
  const r = await git(
    [
      'log',
      `-n${limit}`,
      '--no-color',
      '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e',
      ...(path ? ['--', path] : [])
    ],
    cwd
  )
  if (r.code !== 0) throw new Error(friendly(r.err))
  const commits = r.out
    .split('\x1e')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [hash, short, author, at, subject] = c.split('\x1f')
      return { hash, short, author, at, subject }
    })
  const text = commits.length
    ? commits.map((c) => `${c.short} ${c.at.slice(0, 10)} ${c.author}: ${c.subject}`).join('\n')
    : 'No commits found.'
  return { text, view: { op: 'log', commits, path } }
}

/* ---------- commit ---------- */

export async function gitCommit(cwd: string, i: Input): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const message = typeof i.message === 'string' ? i.message.trim() : ''
  if (!message) throw new Error('A commit needs a message.')
  if (message.length > 5000 || message.includes('\0'))
    throw new Error('That commit message is too long.')

  const status = await gitStatus(cwd)
  const all = (status.view as Extract<GitView, { op: 'status' }>).files
  if (!all.length) throw new Error('There is nothing to commit.')

  let paths: string[]
  const skipped: string[] = []
  if (Array.isArray(i.paths) && i.paths.length) {
    paths = i.paths.filter((p): p is string => typeof p === 'string').map((p) => inside(cwd, p))
    if (!paths.length) throw new Error('“paths” must be a list of file paths.')
  } else {
    paths = []
    for (const f of all) (looksSecret(f.path) ? skipped : paths).push(f.path)
    if (!paths.length)
      throw new Error(
        `Only files that may hold secrets are changed (${skipped.join(', ')}), so nothing was committed.`
      )
  }

  const add = await git(['add', '-A', '--', ...paths], cwd)
  if (add.code !== 0) throw new Error(friendly(add.err))
  const head = await hasHead(cwd)
  // only what was chosen: anything else that was already staged stays out of this commit
  const commit = await git(
    head ? ['commit', '-m', message, '--only', '--', ...paths] : ['commit', '-m', message],
    cwd,
    60_000
  )
  if (commit.code !== 0) throw new Error(friendly(`${commit.err}\n${commit.out}`))

  const [hash, short, branch, stat] = await Promise.all([
    git(['rev-parse', 'HEAD'], cwd),
    git(['rev-parse', '--short', 'HEAD'], cwd),
    currentBranch(cwd),
    git(['show', '--numstat', '--format=', 'HEAD'], cwd)
  ])
  let files = 0
  let added = 0
  let removed = 0
  for (const line of stat.out.split('\n')) {
    const [a, r, ...rest] = line.split('\t')
    if (!rest.length) continue
    files++
    added += Number(a) || 0
    removed += Number(r) || 0
  }
  const subject = message.split('\n')[0]
  const text = `Committed ${short.out.trim()} on ${branch}: ${subject} (${files} file${files === 1 ? '' : 's'}, +${added} -${removed}).${skipped.length ? ` Left out because they may hold secrets: ${skipped.join(', ')}.` : ''} It is not pushed yet.`
  return {
    text,
    view: {
      op: 'commit',
      hash: hash.out.trim(),
      short: short.out.trim(),
      branch,
      subject,
      files,
      added,
      removed,
      paths,
      skipped
    }
  }
}

/* ---------- branches ---------- */

const BRANCH_NAME = /^(?!-)[A-Za-z0-9._/-]{1,100}$/

async function listBranches(cwd: string): Promise<string[]> {
  const r = await git(['branch', '--list', '--format=%(refname:short)'], cwd, 10_000)
  return r.out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function gitBranch(cwd: string, i: Input): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const name = typeof i.name === 'string' ? i.name.trim() : ''
  if (!name) {
    const [branches, current] = await Promise.all([listBranches(cwd), currentBranch(cwd)])
    return {
      text: `Current branch: ${current}\nBranches: ${branches.join(', ') || '(none yet)'}`,
      view: { op: 'branch', action: 'listed', current, branches }
    }
  }
  if (
    !BRANCH_NAME.test(name) ||
    name.includes('..') ||
    name.endsWith('/') ||
    name.endsWith('.lock')
  )
    throw new Error('That is not a usable branch name. Use letters, numbers, dashes and slashes.')
  const create = i.create !== false && !(await listBranches(cwd)).includes(name)
  const from = typeof i.from === 'string' && i.from.trim() ? i.from.trim() : ''
  if (from && !BRANCH_NAME.test(from)) throw new Error('That is not a branch to start from.')
  const r = await git(
    create ? ['checkout', '-b', name, ...(from ? [from] : [])] : ['checkout', name],
    cwd
  )
  if (r.code !== 0) throw new Error(friendly(r.err))
  const branches = await listBranches(cwd)
  return {
    text: create ? `Created and switched to ${name}.` : `Switched to ${name}.`,
    view: { op: 'branch', action: create ? 'created' : 'switched', current: name, name, branches }
  }
}

/* ---------- push and pull request ---------- */

async function remoteOf(cwd: string): Promise<string> {
  const r = await git(['remote', 'get-url', 'origin'], cwd, 10_000)
  if (r.code !== 0 || !r.out.trim())
    throw new Error(
      'This project has no remote called origin yet. Ask the person to connect it to GitHub first.'
    )
  return cleanRemote(r.out)
}

export async function gitPush(cwd: string): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const branch = await currentBranch(cwd)
  if (branch === 'detached HEAD')
    throw new Error(
      'HEAD is not on a branch, so there is nothing to push. Switch to a branch first.'
    )
  const remote = await remoteOf(cwd)
  const r = await git(['push', '-u', 'origin', 'HEAD'], cwd, 90_000)
  if (r.code !== 0) throw new Error(friendly(r.err))
  return { text: `Pushed ${branch} to origin (${remote}).`, view: { op: 'push', branch, remote } }
}

const parseRemote = (url: string): { host: string; owner: string; repo: string } | null => {
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)([^/:]+)[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(
      url.trim()
    )
  return m ? { host: m[1], owner: m[2], repo: m[3] } : null
}

export async function gitPullRequest(cwd: string, i: Input): Promise<GitOutcome> {
  await ensureRepo(cwd)
  const title = typeof i.title === 'string' ? i.title.trim() : ''
  if (!title) throw new Error('A pull request needs a title.')
  const body = typeof i.body === 'string' ? i.body : ''
  const branch = await currentBranch(cwd)
  const rawBase = typeof i.base === 'string' && i.base.trim() ? i.base.trim() : ''
  if (rawBase && !BRANCH_NAME.test(rawBase)) throw new Error('That is not a branch to merge into.')
  let base = rawBase
  if (!base) {
    const head = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd, 10_000)
    base = head.code === 0 && head.out.trim() ? head.out.trim().replace(/^origin\//, '') : 'main'
  }
  if (branch === base)
    throw new Error(
      `The branch is ${base} itself. Create a branch for these changes first (git_branch), commit there, then open the pull request.`
    )
  if (branch === 'detached HEAD')
    throw new Error('HEAD is not on a branch. Switch to a branch first.')

  const remote = await remoteOf(cwd)
  const parsed = parseRemote(remote)
  if (!parsed) throw new Error('The remote does not look like a GitHub address.')
  const push = await git(['push', '-u', 'origin', 'HEAD'], cwd, 90_000)
  if (push.code !== 0) throw new Error(friendly(push.err))

  const hasGh = (await run('gh', ['--version'], cwd, 5000)).code === 0
  if (hasGh) {
    const args = [
      'pr',
      'create',
      '--title',
      title,
      '--body',
      body,
      '--base',
      base,
      '--head',
      branch,
      ...(i.draft === true ? ['--draft'] : [])
    ]
    const made = await run('gh', args, cwd, 60_000)
    const link = /https?:\/\/\S+/.exec(made.out)?.[0]
    if (made.code === 0 && link)
      return {
        text: `Opened pull request: ${link}`,
        view: { op: 'pr', url: link, title, branch, base, created: true }
      }
    const view = await run(
      'gh',
      ['pr', 'view', branch, '--json', 'url', '--jq', '.url'],
      cwd,
      15_000
    )
    if (view.code === 0 && view.out.trim().startsWith('http')) {
      const url = view.out.trim()
      return {
        text: `A pull request for ${branch} already exists: ${url}`,
        view: { op: 'pr', url, title, branch, base, created: false }
      }
    }
  }
  const url = `https://${parsed.host}/${parsed.owner}/${parsed.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  return {
    text: `The branch is pushed. The GitHub CLI is not available (or not signed in), so the pull request was not created. Give the person this link to finish it on GitHub: ${url}`,
    view: { op: 'pr', url, title, branch, base, created: false }
  }
}

/* ---------- registry ---------- */

export const GIT_TOOLS = [
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_branch',
  'git_push',
  'git_pull_request'
] as const
export type GitToolName = (typeof GIT_TOOLS)[number]

/** Tools that change something and so ask first. */
export const GIT_WRITES = new Set<string>([
  'git_commit',
  'git_branch',
  'git_push',
  'git_pull_request'
])

export async function runGit(name: GitToolName, cwd: string, input: Input): Promise<GitOutcome> {
  switch (name) {
    case 'git_status':
      return gitStatus(cwd)
    case 'git_diff':
      return gitDiff(cwd, input)
    case 'git_log':
      return gitLog(cwd, input)
    case 'git_commit':
      return gitCommit(cwd, input)
    case 'git_branch':
      return gitBranch(cwd, input)
    case 'git_push':
      return gitPush(cwd)
    case 'git_pull_request':
      return gitPullRequest(cwd, input)
  }
}

/** What the permission card shows for a git action: the command it stands for, plain and short. */
export function gitCommandText(name: string, input: Input): { title: string; command: string } {
  const s = (v: unknown, n = 80): string =>
    typeof v === 'string' ? v.split('\n')[0].slice(0, n) : ''
  switch (name) {
    case 'git_commit': {
      const n = Array.isArray(input.paths) ? input.paths.length : 0
      return {
        title: 'Save a commit',
        command: `git commit -m ${JSON.stringify(s(input.message))}${n ? `  (${n} file${n === 1 ? '' : 's'})` : '  (all changes)'}`
      }
    }
    case 'git_branch': {
      const name = s(input.name, 100)
      return {
        title: input.create === false ? 'Switch branch' : 'Create a branch',
        command: `git checkout ${input.create === false ? '' : '-b '}${name}`
      }
    }
    case 'git_push':
      return { title: 'Push to GitHub', command: 'git push -u origin HEAD' }
    default:
      return {
        title: 'Open a pull request',
        command: `gh pr create --title ${JSON.stringify(s(input.title))}${typeof input.base === 'string' && input.base ? ` --base ${input.base}` : ''}`
      }
  }
}

export const GIT_TOOL_DEFS = [
  {
    name: 'git_status',
    description:
      'Show the current branch, whether it is ahead of or behind the remote, and every changed file (M modified, A added, D deleted, R renamed, ? new) with line counts. Use it before committing and when asked what changed.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'git_diff',
    description:
      'Show the actual changes in the project as a diff. By default unstaged changes (new files included); set staged for what is staged, or base for a comparison with a branch or commit (for example main). Pass path to look at one file or folder.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Limit to this file or folder.' },
        staged: { type: 'boolean' },
        base: {
          type: 'string',
          description: 'Compare the working tree with this branch or commit.'
        }
      }
    }
  },
  {
    name: 'git_log',
    description:
      'List recent commits (newest first): short hash, date, author, message. Pass path for the history of one file.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'How many, default 15, at most 50.' },
        path: { type: 'string' }
      }
    }
  },
  {
    name: 'git_commit',
    description:
      'Save changes as a commit. The person is asked first. Only use it when they asked you to commit or save, or it is plainly part of the task. Write the message in the imperative, a short first line (under 72 characters), then an optional blank line and details. With no paths, every changed file is committed except build folders and files that look like secrets (.env, keys). Check git_status first. This does not push.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only commit these files. Leave out for everything that changed.'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'git_branch',
    description:
      'With no name: list the branches. With a name: create that branch and switch to it, or switch to it when it already exists (set create to false to only switch). The person is asked first when it changes anything.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'For example feature/login-form.' },
        create: { type: 'boolean', description: 'Default true. False means switch only.' },
        from: { type: 'string', description: 'Branch or commit to start the new branch from.' }
      }
    }
  },
  {
    name: 'git_push',
    description:
      'Push the current branch to origin and set it to track the remote. The person is asked first. Never forced. Use only when they asked to push or publish.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'git_pull_request',
    description:
      'Push the current branch and open a GitHub pull request into base (the default branch when left out). The person is asked first. Needs commits on a branch other than base. Write a clear title and a short body saying what changed and why.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        base: { type: 'string' },
        draft: { type: 'boolean' }
      },
      required: ['title']
    }
  }
]
