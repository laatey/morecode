import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
const visibility = source.match(/const rightVisible = [^\n]+/)?.[0]
const callback = source.match(/const onReveal = \(\): void => \{[\s\S]*?\n    \}/)?.[0]
assert.ok(visibility)
assert.ok(callback)
const compiled = ts.transpileModule(`${visibility}; const reveal = { current: { collapsed: !rightVisible, toggle } }; ${callback}; onReveal();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText
const runReveal = new Function('rightCollapsed', 'overlay', 'toggle', compiled)

test('opening a tab leaves an already-visible right overlay open', () => {
  let toggles = 0
  runReveal(true, 'right', () => toggles++)
  assert.equal(toggles, 0)
})
test('opening a tab reveals a closed right sidebar', () => {
  let toggles = 0
  runReveal(true, null, () => toggles++)
  assert.equal(toggles, 1)
})
test('opening a tab does not toggle a docked right sidebar', () => {
  let toggles = 0
  runReveal(false, null, () => toggles++)
  assert.equal(toggles, 0)
})
test('a left overlay does not prevent revealing the right sidebar', () => {
  let toggles = 0
  runReveal(true, 'left', () => toggles++)
  assert.equal(toggles, 1)
})

