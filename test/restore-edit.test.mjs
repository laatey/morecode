import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { snapshots, revertEdit, restoreEdit } from '../src/main/agent/undo-store.ts'

// what the write tool does: remember the old content, then write the new
const edit = (id, abs, original, next) => {
  snapshots.set(id, { abs, original })
  writeFileSync(abs, next)
}

test('an undone edit can be restored, but not over a file changed in between', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  const file = join(dir, 'a.txt')
  writeFileSync(file, 'one')
  edit('e1', file, 'one', 'two')
  assert.equal(revertEdit('e1'), true)
  assert.equal(readFileSync(file, 'utf8'), 'one')
  assert.equal(restoreEdit('e1'), 'restored')
  assert.equal(readFileSync(file, 'utf8'), 'two')

  assert.equal(revertEdit('e1'), true)
  writeFileSync(file, 'mine')
  assert.equal(restoreEdit('e1'), 'changed')
  assert.equal(readFileSync(file, 'utf8'), 'mine')
})

test('a file the AI created is deleted by the undo and comes back on restore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  const file = join(dir, 'new.txt')
  edit('e2', file, null, 'hello')
  assert.equal(revertEdit('e2'), true)
  assert.equal(existsSync(file), false)
  assert.equal(restoreEdit('e2'), 'restored')
  assert.equal(readFileSync(file, 'utf8'), 'hello')
})

test('two edits to one file unwind newest first and restore oldest first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-'))
  const file = join(dir, 'b.txt')
  writeFileSync(file, 'A')
  edit('x1', file, 'A', 'B')
  edit('x2', file, 'B', 'C')
  revertEdit('x2'); revertEdit('x1')
  assert.equal(readFileSync(file, 'utf8'), 'A')
  assert.equal(restoreEdit('x1'), 'restored')
  assert.equal(restoreEdit('x2'), 'restored')
  assert.equal(readFileSync(file, 'utf8'), 'C')
})
