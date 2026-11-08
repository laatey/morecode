import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { changedDeliverables, snapshotDeliverables } from '../src/main/agent/deliverables.ts'

test('a file a command made shows up, code and untouched files do not', () => {
  const root = mkdtempSync(join(tmpdir(), 'mc-del-'))
  writeFileSync(join(root, 'old.pdf'), 'old')
  const before = snapshotDeliverables(root)
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'out', 'plans.PDF'), 'pdf bytes')
  writeFileSync(join(root, 'app.ts'), 'code')
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'node_modules', 'x.zip'), 'ignored')
  const found = changedDeliverables(root, before, snapshotDeliverables(root))
  assert.deepEqual(found.map((f) => f.path), ['out/plans.PDF'])
  assert.equal(found[0].name, 'plans.PDF')
  assert.equal(found[0].size, 9)
})

test('a file that is rewritten counts again', () => {
  const root = mkdtempSync(join(tmpdir(), 'mc-del-'))
  const f = join(root, 'a.xlsx')
  writeFileSync(f, 'one')
  utimesSync(f, new Date(2020, 0, 1), new Date(2020, 0, 1))
  const before = snapshotDeliverables(root)
  writeFileSync(f, 'two')
  assert.equal(changedDeliverables(root, before, snapshotDeliverables(root)).length, 1)
  assert.equal(changedDeliverables(root, snapshotDeliverables(root), snapshotDeliverables(root)).length, 0)
})
