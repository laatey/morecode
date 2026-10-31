import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, before } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

let g
let dir
const sh = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })

before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  g = await import(pathToFileURL(join(process.cwd(), 'src/main/agent/git-tools.ts')).href)
  dir = mkdtempSync(join(tmpdir(), 'mc-git-'))
  sh('init', '-q', '-b', 'main')
  sh('config', 'user.email', 'a@b.c')
  sh('config', 'user.name', 'Tester')
  sh('config', 'commit.gpgsign', 'false')
})

test('a folder that is not a repository is explained', async () => {
  const bare = mkdtempSync(join(tmpdir(), 'mc-none-'))
  await assert.rejects(() => g.gitStatus(bare), /not a git repository/)
})

test('status, diff, commit and log work end to end', async () => {
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n')
  mkdirSync(join(dir, 'node_modules'))
  writeFileSync(join(dir, 'node_modules', 'x.js'), 'x')
  writeFileSync(join(dir, '.env'), 'SECRET=1\n')

  let st = await g.gitStatus(dir)
  assert.equal(st.view.branch, 'main')
  const names = st.view.files.map((f) => f.path).sort()
  assert.deepEqual(names, ['.env', 'a.txt'])
  assert.ok(!names.includes('node_modules/x.js'))

  const d = await g.gitDiff(dir, {})
  assert.equal(
    d.view.files.some((f) => f.path === 'a.txt' && f.action === 'create'),
    true
  )
  assert.ok(
    !d.view.files.some((f) => f.path === '.env'),
    'secret-looking files are not shown as diffs'
  )

  const c = await g.gitCommit(dir, { message: 'Add a.txt' })
  assert.equal(c.view.subject, 'Add a.txt')
  assert.deepEqual(c.view.paths, ['a.txt'])
  assert.deepEqual(c.view.skipped, ['.env'])
  assert.equal(c.view.files, 1)
  assert.equal(c.view.added, 2)
  assert.match(sh('log', '--format=%s'), /Add a.txt/)
  assert.doesNotMatch(sh('ls-files'), /\.env/)

  writeFileSync(join(dir, 'a.txt'), 'one\nTWO\nthree\n')
  st = await g.gitStatus(dir)
  assert.deepEqual(
    st.view.files.map((f) => [f.path, f.state, f.added, f.removed]).filter((r) => r[0] === 'a.txt'),
    [['a.txt', 'modified', 2, 1]]
  )
  const d2 = await g.gitDiff(dir, { path: 'a.txt' })
  assert.equal(d2.view.files.length, 1)
  assert.equal(d2.view.added, 2)
  assert.equal(d2.view.removed, 1)
  assert.match(d2.text, /\+TWO/)

  await g.gitCommit(dir, { message: 'Change a.txt\n\nMore detail.', paths: ['a.txt'] })
  const log = await g.gitLog(dir, { limit: 5 })
  assert.deepEqual(
    log.view.commits.map((x) => x.subject),
    ['Change a.txt', 'Add a.txt']
  )
  const one = await g.gitLog(dir, { path: 'a.txt', limit: 1 })
  assert.equal(one.view.commits.length, 1)
})

test('committing with nothing to commit, or a bad path, is refused', async () => {
  await assert.rejects(
    () => g.gitCommit(dir, { message: 'x' }),
    /only files that may hold secrets|nothing to commit/i
  )
  await assert.rejects(() => g.gitCommit(dir, { message: '' }), /message/)
  writeFileSync(join(dir, 'b.txt'), 'b')
  await assert.rejects(
    () => g.gitCommit(dir, { message: 'x', paths: ['../outside.txt'] }),
    /outside the project/
  )
})

test('branches are listed, created and switched', async () => {
  const made = await g.gitBranch(dir, { name: 'feature/login' })
  assert.equal(made.view.action, 'created')
  assert.equal(made.view.current, 'feature/login')
  const back = await g.gitBranch(dir, { name: 'main', create: false })
  assert.equal(back.view.action, 'switched')
  const list = await g.gitBranch(dir, {})
  assert.deepEqual(list.view.branches.sort(), ['feature/login', 'main'])
  await assert.rejects(() => g.gitBranch(dir, { name: '--force' }), /usable branch name/)
  await assert.rejects(() => g.gitBranch(dir, { name: 'a..b' }), /usable branch name/)
})

test('push and pull request explain what is missing', async () => {
  await assert.rejects(() => g.gitPush(dir), /no remote called origin/)
  await g.gitBranch(dir, { name: 'main', create: false })
  await assert.rejects(
    () => g.gitPullRequest(dir, { title: 'x' }),
    /no remote called origin|itself/
  )
})

test('the diff parser reads renames, deletions and truncates long files', () => {
  const text = [
    'diff --git a/old.txt b/old.txt',
    'deleted file mode 100644',
    'index 1..0',
    '--- a/old.txt',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-a',
    '-b',
    'diff --git a/big.txt b/big.txt',
    '--- a/big.txt',
    '+++ b/big.txt',
    '@@ -1,1 +1,4 @@',
    ' keep',
    '+1',
    '+2',
    '+3'
  ].join('\n')
  const { files, omitted } = g.parseUnifiedDiff(text, 25, 3)
  assert.equal(omitted, 0)
  assert.equal(files[0].action, 'delete')
  assert.equal(files[0].deletions, 2)
  assert.equal(files[1].additions, 3)
  assert.equal(
    files[1].hunks[0].lines.length,
    3,
    'long hunks are cut for the screen but still counted'
  )
  assert.equal(g.parseUnifiedDiff(text, 1).omitted, 1)
})

test('secret-looking files and remotes are recognised', () => {
  for (const p of ['.env', 'app/.env.local', 'cert.pem', 'id_rsa', 'keys/server.key'])
    assert.ok(g.looksSecret(p), p)
  for (const p of ['.env.example', 'src/environment.ts', 'README.md'])
    assert.ok(!g.looksSecret(p), p)
  assert.equal(g.cleanRemote('https://user:tok@github.com/o/r.git\n'), 'https://github.com/o/r.git')
  assert.match(g.friendly('fatal: Authentication failed for x'), /sign-in/)
})

test('what the permission card shows for each git action', () => {
  assert.deepEqual(g.gitCommandText('git_push', {}), {
    title: 'Push to GitHub',
    command: 'git push -u origin HEAD'
  })
  assert.match(
    g.gitCommandText('git_commit', { message: 'Fix bug\n\nlong', paths: ['a'] }).command,
    /git commit -m "Fix bug"  \(1 file\)/
  )
  assert.match(g.gitCommandText('git_branch', { name: 'x' }).command, /checkout -b x/)
})
