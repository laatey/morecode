import assert from 'node:assert/strict'
import { test, before, beforeEach } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

let imp
let mem
let dir
before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  imp = await import(pathToFileURL(join(process.cwd(), 'src/shared/memory-import.ts')).href)
  mem = await import(pathToFileURL(join(process.cwd(), 'src/main/agent/memory.ts')).href)
})
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-imp-'))
})

test('parses the format the prompt asks for, with sections deciding the scope', () => {
  const items = imp.parseImport('```\n## Preferences\n- Replies in short sentences\n- Uses pnpm, not npm\n\n## Projects\n- Acme web: React and TypeScript\n```')
  assert.deepEqual(items, [
    { text: 'Replies in short sentences', scope: 'global' },
    { text: 'Uses pnpm, not npm', scope: 'global' },
    { text: 'Acme web: React and TypeScript', scope: 'project' }
  ])
})

test('copes with other layouts: bold headings, numbering, dates, plain lines, "None"', () => {
  const items = imp.parseImport('Here is what I know:\n**Preferences**\n1. [2025-03-01] Likes dark mode\n• Writes tests first\n\n**Projects**\nNone\nShop API: Node and Postgres')
  assert.deepEqual(items.map((i) => [i.text, i.scope]), [
    ['Likes dark mode', 'global'],
    ['Writes tests first', 'global'],
    ['Shop API: Node and Postgres', 'project']
  ])
})

test('drops duplicates and splits an over-long line into notes that fit', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} says something fairly long here.`).join(' ')
  const items = imp.parseImport(`- Same note\n- same NOTE\n- ${long}`)
  assert.equal(items.filter((i) => /same note/i.test(i.text)).length, 1)
  assert.ok(items.length > 2)
  assert.ok(items.every((i) => i.text.length <= 300))
})

test('empty or chatty-only text finds nothing', () => {
  assert.deepEqual(imp.parseImport(''), [])
  assert.deepEqual(imp.parseImport('Sure! Here you go:\n\n## Preferences\n- None'), [])
})

test('addMany saves what it can, skips duplicates, and reports secrets and missing projects', () => {
  mem.addEntry(dir, 'global', undefined, 'Uses pnpm')
  const out = mem.addMany(dir, [
    { scope: 'global', text: 'Uses pnpm' },
    { scope: 'global', text: 'Prefers short answers' },
    { scope: 'global', text: 'api_key: abcdef123456' },
    { scope: 'project', text: 'Acme: React', projectPath: join(tmpdir(), 'acme') }
  ])
  assert.equal(out.added, 2)
  assert.equal(out.duplicates, 1)
  assert.equal(out.rejected.length, 1)
  assert.match(out.rejected[0].reason, /password, key or token/)
  assert.equal(mem.loadEntries(dir, 'global').length, 2)
})

test('project summaries carry the newest date and the pinned-or-newest note for the overview', () => {
  const proj = join(tmpdir(), 'overview-proj')
  mem.addEntry(dir, 'project', proj, 'Older note', { now: new Date('2026-10-01T12:00:00Z') })
  mem.addEntry(dir, 'project', proj, 'Newest note', { now: new Date('2026-11-04T12:00:00Z') })
  let [p] = mem.listProjects(dir)
  assert.equal(p.count, 2)
  assert.equal(p.updated, '2026-11-04')
  assert.equal(p.preview, 'Newest note')
  const old = mem.loadEntries(dir, 'project', proj).find((e) => e.text === 'Older note')
  mem.editEntry(dir, 'project', proj, old.id, { pinned: true })
  ;[p] = mem.listProjects(dir)
  assert.equal(p.preview, 'Older note')
})
