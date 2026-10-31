import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Run the production translation code itself; only its type-only import is removed.
const source = readFileSync(new URL('../src/main/agent/openai-format.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText
const { toOpenAIMessages, toOpenAITools, readOpenAIStream, usesOpenAIFormat, StreamProblem } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

async function* lines(...items) {
  for (const i of items) yield typeof i === 'string' ? i : JSON.stringify(i)
}
const chunk = (delta, finish_reason = null, extra = {}) => ({ choices: [{ delta, finish_reason }], ...extra })

test('only ModelScope uses the chat completions format', () => {
  assert.equal(usesOpenAIFormat('https://api-inference.modelscope.cn'), true)
  assert.equal(usesOpenAIFormat('https://api-inference.modelscope.cn/'), true)
  assert.equal(usesOpenAIFormat('https://api-inference.modelscope.ai'), true)
  assert.equal(usesOpenAIFormat('https://openrouter.ai/api'), false)
  assert.equal(usesOpenAIFormat(undefined), false)
})

test('a tool round trip becomes assistant tool_calls followed by tool messages', () => {
  const out = toOpenAIMessages('sys', [
    { role: 'user', content: [{ type: 'text', text: 'list files' }] },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Looking.' },
        { type: 'tool_use', id: 't1', name: 'ls', input: { path: '.' } }
      ]
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'a.txt' },
        { type: 'text', text: 'thanks' }
      ]
    }
  ])
  assert.deepEqual(out[0], { role: 'system', content: 'sys' })
  assert.deepEqual(out[1], { role: 'user', content: 'list files' })
  assert.equal(out[2].role, 'assistant')
  assert.equal(out[2].tool_calls[0].function.arguments, '{"path":"."}')
  assert.deepEqual(out[3], { role: 'tool', tool_call_id: 't1', content: 'a.txt' })
  assert.deepEqual(out[4], { role: 'user', content: 'thanks' })
})

test('tool errors are labelled and images become image_url parts', () => {
  const out = toOpenAIMessages('s', [
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'boom', is_error: true }] },
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
        { type: 'text', text: 'what is this' }
      ]
    }
  ])
  assert.equal(out[1].content, 'Error: boom')
  assert.equal(out[2].content[0].image_url.url, 'data:image/png;base64,AAA')
})

test('tool definitions become functions', () => {
  const [t] = toOpenAITools([{ name: 'ls', description: 'list', input_schema: { type: 'object' } }])
  assert.deepEqual(t, { type: 'function', function: { name: 'ls', description: 'list', parameters: { type: 'object' } } })
})

test('streamed text is passed on and ends the turn', async () => {
  const seen = []
  const r = await readOpenAIStream(
    lines(chunk({ content: 'Hel' }), chunk({ content: 'lo' }), chunk({}, 'stop'), { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }, '[DONE]'),
    { text: (d) => seen.push(d) }
  )
  assert.deepEqual(seen, ['Hel', 'lo'])
  assert.deepEqual(r.content, [{ type: 'text', text: 'Hello' }])
  assert.equal(r.stopReason, 'end_turn')
  assert.equal(r.usage.input, 12)
  assert.equal(r.usage.output, 3)
})

test('tool calls arrive in pieces and are rebuilt, even when the model says "stop"', async () => {
  const r = await readOpenAIStream(
    lines(
      chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{"pa' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] }),
      chunk({ tool_calls: [{ index: 1, id: 'c2', function: { name: 'ls', arguments: '' } }] }),
      chunk({}, 'stop'),
      '[DONE]'
    ),
    {}
  )
  assert.equal(r.stopReason, 'tool_use')
  assert.deepEqual(r.content, [
    { type: 'tool_use', id: 'c1', name: 'read', input: { path: 'a.ts' } },
    { type: 'tool_use', id: 'c2', name: 'ls', input: {} }
  ])
})

test('cut-off tool arguments are marked invalid instead of run with nothing', async () => {
  const r = await readOpenAIStream(
    lines(chunk({ tool_calls: [{ index: 0, id: 'c', function: { name: 'write', arguments: '{"a":' } }] }), chunk({}, 'length'), '[DONE]'),
    {}
  )
  assert.deepEqual(r.content[0].input, { __invalid: true })
})

test('a stream that just stops is an interruption', async () => {
  await assert.rejects(readOpenAIStream(lines(chunk({ content: 'half' })), {}), (e) => e instanceof StreamProblem && e.kind === 'interrupted')
})

test('an error frame is reported, and quota wording counts as a rate limit', async () => {
  await assert.rejects(
    readOpenAIStream(lines({ error: { message: 'Daily quota exceeded' } }), {}),
    (e) => e instanceof StreamProblem && e.kind === 'rate_limit'
  )
})

test('malformed frames and reasoning-only deltas are skipped', async () => {
  const r = await readOpenAIStream(
    lines('not json', chunk({ reasoning_content: 'thinking' }), chunk({ content: 'ok' }), chunk({}, 'stop'), '[DONE]'),
    {}
  )
  assert.deepEqual(r.content, [{ type: 'text', text: 'ok' }])
})
