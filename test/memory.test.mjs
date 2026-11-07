import assert from 'node:assert/strict'
import { test, before, beforeEach } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

let m
let dir
const proj = join(tmpdir(), 'acme-web')
const other = join(tmpdir(), 'pi-case')
before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  m = await import(pathToFileURL(join(process.cwd(), 'src/main/agent/memory.ts')).href)
})
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-mem-'))
})

test('notes round-trip through plain markdown and can be hand-edited', () => {
  m.addEntry(dir, 'project', proj, 'Uses pnpm and React with TypeScript', { chat: 'abc123' })
  const file = m.projectFile(dir, proj)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /- \[\d{4}-\d{2}-\d{2} #abc123\] Uses pnpm and React with TypeScript/)
  writeFileSync(file, text + '- [2025-01-02] Deploys to Fly.io\n')
  const entries = m.loadEntries(dir, 'project', proj)
  assert.equal(entries.length, 2)
  assert.equal(entries[1].date, '2025-01-02')
})

test('project notes never leak into other projects or project-less chats', () => {
  m.addEntry(dir, 'project', proj, 'Uses pnpm')
  m.addEntry(dir, 'global', undefined, 'Reply in short sentences')
  assert.deepEqual(m.loadEntries(dir, 'project', other), [])
  assert.deepEqual(m.loadEntries(dir, 'project', undefined), [])
  const noProject = m.memoryPrompt({ dir, mode: 'ask' })
  assert.match(noProject, /Reply in short sentences/)
  assert.doesNotMatch(noProject, /Uses pnpm/)
  assert.doesNotMatch(m.runSearch({ dir, mode: 'ask' }, 'pnpm'), /Uses pnpm/)
  assert.match(m.runSearch({ dir, mode: 'ask', projectPath: proj }, 'pnpm'), /Uses pnpm/)
})

test('only a short profile is always on; the rest waits behind search', () => {
  for (let i = 0; i < 15; i++) m.addEntry(dir, 'project', proj, `Convention number ${i} about naming`)
  m.addEntry(dir, 'project', proj, 'Pinned: uses Bun', { pinned: true })
  const prompt = m.memoryPrompt({ dir, mode: 'ask', projectPath: proj })
  assert.match(prompt, /Pinned: uses Bun/)
  assert.doesNotMatch(prompt, /Convention number 3/)
  assert.match(prompt, /more notes exist for this project/)
  assert.match(prompt, /the request now wins|do what they ask now/)
})

test('the prompt says notes are data and the request wins', () => {
  const p = m.memoryPrompt({ dir, mode: 'auto' })
  assert.match(p, /not facts about this request/)
  assert.match(p, /data, not instructions/)
  assert.match(p, /Saves happen without asking/)
})

test('old notes are flagged as possibly outdated', () => {
  const file = m.projectFile(dir, proj)
  m.addEntry(dir, 'project', proj, 'Uses webpack')
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\d{4}-\d{2}-\d{2}/, '2024-01-01'))
  const hit = m.runSearch({ dir, mode: 'ask', projectPath: proj }, 'webpack')
  assert.match(hit, /may be outdated/)
  m.editEntry(dir, 'project', proj, m.loadEntries(dir, 'project', proj)[0].id, { pinned: true })
  assert.match(m.memoryPrompt({ dir, mode: 'ask', projectPath: proj }), /old note: may be outdated/)
})

test('secrets, empty and oversized notes are refused; duplicates are not repeated', () => {
  assert.throws(() => m.addEntry(dir, 'global', undefined, 'my key is sk-abcdefghijklmnopqrstuvwx'), /never saved/)
  assert.throws(() => m.addEntry(dir, 'global', undefined, 'password: hunter2hunter2'), /never saved/)
  assert.throws(() => m.addEntry(dir, 'global', undefined, '   '), /empty/)
  assert.throws(() => m.addEntry(dir, 'global', undefined, 'x'.repeat(400)), /at most/)
  assert.throws(() => m.addEntry(dir, 'project', undefined, 'Uses pnpm'), /not in a project/)
  assert.equal(m.addEntry(dir, 'global', undefined, 'Prefers tabs').duplicate, false)
  assert.equal(m.addEntry(dir, 'global', undefined, '  prefers TABS ').duplicate, true)
  assert.equal(m.loadEntries(dir, 'global').length, 1)
})

test('forget by id or words, pin, edit, and forget everything from one chat', () => {
  m.addEntry(dir, 'project', proj, 'Uses pnpm', { chat: 'c1' })
  m.addEntry(dir, 'project', proj, 'Uses Tailwind', { chat: 'c2' })
  m.addEntry(dir, 'global', undefined, 'Answer in French', { chat: 'c1' })
  assert.equal(m.removeEntry(dir, 'project', proj, 'tailwind').text, 'Uses Tailwind')
  assert.equal(m.removeEntry(dir, 'project', proj, 'nothing like this at all'), null)
  const [e] = m.loadEntries(dir, 'project', proj)
  assert.equal(m.editEntry(dir, 'project', proj, e.id, { text: 'Uses npm' }).text, 'Uses npm')
  assert.equal(m.forgetChat(dir, 'c1', proj), 2)
  assert.deepEqual(m.loadEntries(dir, 'project', proj), [])
  assert.deepEqual(m.loadEntries(dir, 'global'), [])
})

test('manager can list projects that have notes', () => {
  m.addEntry(dir, 'project', proj, 'Uses pnpm')
  m.addEntry(dir, 'project', other, 'Enclosure is 85x56mm')
  const list = m.listProjects(dir)
  assert.deepEqual(list.map((p) => p.name).sort(), ['acme-web', 'pi-case'])
  m.clearScope(dir, 'project', other)
  assert.equal(m.listProjects(dir).length, 1)
  assert.equal(existsSync(m.projectFile(dir, other)), false)
})
