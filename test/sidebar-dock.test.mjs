import assert from 'node:assert/strict'
import { test, before } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

let m
before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  m = await import(pathToFileURL(join(process.cwd(), 'src/renderer/src/lib/sidebar-layout.ts')).href)
})

test('docking needs the left sidebar at the width it has, the right one at its minimum', () => {
  assert.equal(m.widthToDock(false, false, 260), m.CENTER_MIN_PX)
  assert.equal(m.widthToDock(true, false, 260), m.CENTER_MIN_PX + 260 + 1)
  assert.equal(m.widthToDock(false, true, 260), m.CENTER_MIN_PX + m.RIGHT_MIN_PX + 1)
  assert.equal(m.widthToDock(true, true, 260), m.CENTER_MIN_PX + 260 + 1 + m.RIGHT_MIN_PX + 1)
})

test('a left sidebar narrower than its minimum is counted at the minimum', () => {
  assert.equal(m.widthToDock(true, false, 100), m.CENTER_MIN_PX + m.LEFT_MIN_PX + 1)
})

test('with both open the full layout needs more than the bare minimums when the left one is wide', () => {
  assert.ok(m.widthToDock(true, true, 260) > m.minContentWidth(true, true))
})
