import assert from 'node:assert/strict'
import { test, before, beforeEach } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join, sep } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'

let m
let root
before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  m = await import(pathToFileURL(join(process.cwd(), 'src/main/agent/skill-files.ts')).href)
})
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'mc-skills-')), 'skills')
})

const skill = {
  id: 'architect-drafting',
  bundle: {
    'SKILL.md': '# Architect',
    'scripts/build_set.py': 'print("hi")',
    'scripts/archkit/model.py': 'x = 1'
  }
}

test('unpacks the whole bundle, scripts included, under <root>/<id>', () => {
  const dir = m.materializeSkill(root, skill)
  assert.equal(dir, join(realpathSync(root), 'architect-drafting'))
  assert.equal(readFileSync(join(dir, 'scripts', 'build_set.py'), 'utf8'), 'print("hi")')
  assert.ok(existsSync(join(dir, 'scripts', 'archkit', 'model.py')))
})

test('paths that try to leave the skill folder are skipped', () => {
  const dir = m.materializeSkill(root, {
    id: 'evil',
    bundle: { 'ok.md': 'ok', '../escape.txt': 'x', '..\\escape2.txt': 'x', 'a/../../escape3.txt': 'x', 'C:/win.txt': 'x', '/abs.txt': 'abs' }
  })
  assert.deepEqual(readdirSync(dir).filter((f) => !f.startsWith('.')).sort(), ['abs.txt', 'ok.md'])
  assert.ok(!existsSync(join(dir, '..', 'escape.txt')))
  assert.ok(!existsSync(join(dir, '..', '..', 'escape3.txt')))
})

test('a hostile skill id cannot pick the folder', () => {
  assert.equal(m.safeSkillId('../../Windows'), 'windows')
  assert.equal(m.safeSkillId('..'), 'skill')
  const dir = m.materializeSkill(root, { id: '../../x', bundle: { 'a.md': 'a' } })
  assert.ok(dir.startsWith(realpathSync(root) + sep))
})

test('an unchanged skill is not rewritten; a changed one replaces stale files', () => {
  const dir = m.materializeSkill(root, skill)
  const marker = join(dir, 'scripts', 'build_set.py')
  writeFileSync(marker, 'tampered')
  m.materializeSkill(root, skill)
  assert.equal(readFileSync(marker, 'utf8'), 'tampered') // same hash: left alone
  const next = { ...skill, bundle: { 'SKILL.md': '# v2' } }
  m.materializeSkill(root, next)
  assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), '# v2')
  assert.ok(!existsSync(marker)) // stale file removed
})

test('locateInSkills tells skill folders apart from everything else', () => {
  const dir = m.materializeSkill(root, skill)
  assert.deepEqual(m.locateInSkills(root, join(dir, 'scripts', 'build_set.py')), { folder: 'architect-drafting', file: 'scripts/build_set.py' })
  assert.deepEqual(m.locateInSkills(root, dir), { folder: 'architect-drafting', file: '' })
  assert.equal(m.locateInSkills(root, join(tmpdir(), 'somewhere-else.txt')), null)
  assert.equal(m.locateInSkills(undefined, dir), null)
  assert.equal(m.locateInSkills(join(tmpdir(), 'does-not-exist-xyz'), dir), null)
})

test('the note gives the path and limits what it is for', () => {
  const note = m.skillDirNote('/x/skills/architect-drafting')
  assert.match(note, /^Skill directory: \/x\/skills\/architect-drafting/)
  assert.match(note, /read_skill/)
  assert.match(note, /Do not read, list or search/)
})
