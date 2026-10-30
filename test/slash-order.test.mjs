import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Stub visual dependencies only; execute the production filtering function.
const source = readFileSync(new URL('../src/renderer/src/features/ai-assistant/slash-commands.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
const icons = 'BarChart3 CircleHelp ClipboardList Command Eraser FileText Gauge Minimize2 NotebookText Puzzle ShieldCheck'.split(' ')
const prelude = `const ${icons.map((name) => `${name} = () => null`).join(', ')}; const skillIcon = () => FileText;`
const compiled = ts.transpileModule(prelude + source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText
const { buildCommands, filterCommands } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const list = buildCommands([{ id: 'plan-ui', description: 'Plan work', icon: 'docs' }], [])

test('skills appear above conversation commands in the unfiltered slash menu', () => {
  const result = filterCommands(list, '')
  assert.equal(result[0].group, 'Skills')
  assert.ok(result.findIndex((c) => c.id === 'plan-ui') < result.findIndex((c) => c.id === 'plan'))
})
test('skills rank above other equally matching slash commands', () => {
  assert.deepEqual(filterCommands(list, 'plan').map((c) => c.id), ['plan-ui', 'plan'])
})
test('prefix matches still rank above description-only skill matches', () => {
  const commands = buildCommands([{ id: 'ui', description: 'Plan work', icon: 'docs' }], [])
  assert.equal(filterCommands(commands, 'plan')[0].id, 'plan')
})