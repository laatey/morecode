import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looksLikeUiTask, designSection, designGuide, REPLICA_GUIDE } from '../src/main/agent/design.ts'

test('UI requests get the design rules', () => {
  assert.equal(looksLikeUiTask({ prompt: 'build me a landing page for a coffee shop' }), true)
  assert.equal(looksLikeUiTask({ prompt: 'restyle the dashboard sidebar' }), true)
  assert.ok(designSection({ prompt: 'make the navbar look better' }).length > 0)
})

test('non-UI requests keep a clean prompt', () => {
  assert.equal(looksLikeUiTask({ prompt: 'fix the failing test in billing' }), false)
  assert.equal(looksLikeUiTask({ prompt: 'write a sql migration adding an orders table' }), false)
  assert.equal(looksLikeUiTask({ prompt: 'why does this script crash with ENOENT?' }), false)
  assert.equal(designSection({ prompt: 'add a cron job that emails invoices' }), '')
})

test('an attached image brings the copy-it process', () => {
  const s = designSection({ prompt: 'copy this', images: ['data:image/png;base64,AA=='] })
  assert.ok(s.includes(REPLICA_GUIDE))
  assert.equal(designSection({ prompt: 'landing page' }).includes(REPLICA_GUIDE), false)
})

test('short follow-ups to a UI request stay UI', () => {
  const history = [{ role: 'user', text: 'design a pricing page' }, { role: 'assistant', text: 'done' }]
  assert.equal(looksLikeUiTask({ prompt: 'make it darker', history }), true)
  assert.equal(looksLikeUiTask({ prompt: 'make it faster', history: [{ role: 'user', text: 'optimise the api' }] }), false)
})

test('design_guide tool topics', () => {
  assert.equal(designGuide({ topic: 'replicate' }), REPLICA_GUIDE)
  assert.ok(designGuide({ topic: 'all' }).includes(REPLICA_GUIDE))
})

test('the guide says to use a component library instead of hand-rolling', () => {
  assert.ok(designGuide().includes('shadcn/ui'))
  assert.ok(designGuide().includes('Do not reinvent the wheel'))
})
