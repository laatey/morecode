import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sidebarLayout, sidebarNeedsOverlay } from '../src/renderer/src/lib/sidebar-layout.ts'
import { validateSkillDraft, skillDraftCollision } from '../src/shared/skill-draft.ts'

const widths = { left: 260, right: 360 }
test('a requested right sidebar makes the left yield when both cannot fit', () => {
  const layout = sidebarLayout(800, { left: false, right: false }, widths, 'right')
  assert.equal(layout.left, 0)
  assert.equal(layout.right, 348)
})
test('tight windows open requested sidebars as overlays rather than silently failing', () => {
  assert.equal(sidebarNeedsOverlay(600, 'right'), true)
  assert.equal(sidebarNeedsOverlay(700, 'right'), false)
})
test('window expansion restores both preferred widths without mutating preferences', () => {
  sidebarLayout(800, { left: false, right: false }, widths, 'right')
  assert.deepEqual(sidebarLayout(1400, { left: false, right: false }, widths, 'right'), widths)
  assert.deepEqual(widths, { left: 260, right: 360 })
})
test('a user-closed sidebar stays closed after resizing', () => {
  assert.equal(sidebarLayout(1600, { left: true, right: false }, widths, 'right').left, 0)
})
const draft = { id: 'release-notes', name: 'Release notes', description: 'Summarize releases', instructions: 'Read changes and group customer-facing notes.' }
test('skill drafts contain plain instructions with optional example', () => {
  assert.deepEqual(validateSkillDraft(draft), { ...draft, example: '' })
})
test('skill drafts reject invalid and reserved command identifiers', () => {
  for (const id of ['../skill', '/skill', 'skills', 'UPPER', 'x'.repeat(65)]) assert.throws(() => validateSkillDraft({ ...draft, id }))
})
test('skill drafts reject oversized or missing instructions', () => {
  assert.throws(() => validateSkillDraft({ ...draft, instructions: '' }))
  assert.throws(() => validateSkillDraft({ ...draft, instructions: 'x'.repeat(30001) }))
})
test('saving drafts cannot silently overwrite skills or custom commands', () => {
  assert.equal(skillDraftCollision(draft.id, [{ id: draft.id }], []), true)
  assert.equal(skillDraftCollision(draft.id, [], [{ id: draft.id }]), true)
  assert.equal(skillDraftCollision(draft.id, [], []), false)
})