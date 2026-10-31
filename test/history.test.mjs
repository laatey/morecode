import test from 'node:test'
import assert from 'node:assert/strict'
import { slimBrowserResults } from '../src/main/agent/history.ts'

const use = (id, name) => ({ role: 'assistant', content: [{ type: 'tool_use', id, name, input: {} }] })
const res = (id, content, is_error) => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...(is_error ? { is_error } : {}) }] })

test('only the newest browser results are kept in full', () => {
  const m = [{ role: 'user', content: 'go' }]
  for (let n = 1; n <= 5; n++) m.push(use(`b${n}`, 'browser_click'), res(`b${n}`, `page ${n}`))
  const out = slimBrowserResults(m)
  const texts = out.filter((x) => x.role === 'user' && Array.isArray(x.content)).map((x) => x.content[0].content)
  assert.equal(texts[4], 'page 5')
  assert.equal(texts[3], 'page 4')
  assert.match(texts[0], /older page snapshot/)
  assert.match(texts[2], /older page snapshot/)
  assert.equal(m[2].content[0].content, 'page 1', 'the original history is not changed')
})

test('other tools and errors are left alone', () => {
  const m = [use('r', 'read_file'), res('r', 'file text')]
  for (let n = 1; n <= 4; n++) m.push(use(`b${n}`, 'browser_snapshot'), res(`b${n}`, `page ${n}`, n === 1))
  const out = slimBrowserResults(m)
  assert.equal(out[1].content[0].content, 'file text')
  assert.equal(out[3].content[0].content, 'page 1')
})
