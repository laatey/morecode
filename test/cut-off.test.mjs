import test from 'node:test'
import assert from 'node:assert/strict'
import { dropCutOffCalls, pushUser, saveUnfinished, takeUnfinished, resumeWith, CUT_OFF_NOTICE } from '../src/main/agent/history.ts'

const read = (id) => ({ type: 'tool_use', id, name: 'read_file', input: { path: 'a.md' } })

test('a tool call cut off half way is dropped, complete ones are kept', () => {
  const out = dropCutOffCalls([read('ok'), { type: 'tool_use', id: 'cut', name: 'write_file', input: { __invalid: true } }])
  assert.deepEqual(out.map((b) => b.id), ['ok'])
})

test('the nudge joins the tool results instead of making two person turns in a row', () => {
  const m = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'file' }] }]
  pushUser(m, [{ type: 'text', text: 'carry on' }])
  assert.equal(m.length, 1)
  assert.equal(m[0].content.length, 2)
})

test('continue gets back the files read before the cut-off', () => {
  const work = [
    { role: 'user', content: [{ type: 'text', text: 'design a house' }] },
    { role: 'assistant', content: [read('r1')] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'SKILL CONTENTS' }] }
  ]
  saveUnfinished('chat1', work)
  const history = [{ role: 'user', text: 'design a house' }, { role: 'assistant', text: `Reading. ${CUT_OFF_NOTICE}` }]
  const saved = takeUnfinished('chat1', history)
  const msgs = resumeWith(saved, [{ type: 'text', text: 'continue' }])
  assert.equal(msgs[2].content[0].content, 'SKILL CONTENTS')
  assert.equal(msgs.at(-1).content.at(-1).text, 'continue')
  assert.equal(takeUnfinished('chat1', history), null, 'used once')
})

test('saved work is ignored when the chat moved on since the cut-off', () => {
  saveUnfinished('chat2', [{ role: 'user', content: 'x' }])
  assert.equal(takeUnfinished('chat2', [{ role: 'assistant', text: 'All done.' }]), null)
})

test('a trailing tool call with no result is not resent', () => {
  const msgs = resumeWith([{ role: 'user', content: 'go' }, { role: 'assistant', content: [{ type: 'text', text: 'hi' }, read('r')] }], [{ type: 'text', text: 'continue' }])
  assert.deepEqual(msgs[1].content, [{ type: 'text', text: 'hi' }])
  assert.equal(msgs[2].role, 'user')
})

import { cutOffInfo, cutOffNudgeFor } from '../src/main/agent/history.ts'

test('a cut-off file write names the file and asks for smaller pieces with append', () => {
  const info = cutOffInfo([{ type: 'tool_use', id: 'c', name: 'write_file', input: { __invalid: true, __path: 'plan/house.json' } }])
  const note = cutOffNudgeFor(info)
  assert.match(note, /plan\/house\.json/)
  assert.match(note, /append/)
})

test('a reply that was only hidden thinking is told to stop planning and act', () => {
  assert.match(cutOffNudgeFor(cutOffInfo([])), /Stop planning/)
})
