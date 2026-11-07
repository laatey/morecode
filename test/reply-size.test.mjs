import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./ts-resolve-hooks.mjs', import.meta.url)
const { streamOpenAI } = await import('../src/main/agent/openai-compat.ts')

const sse = (frames) => new Response(frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })

test('a service that refuses the big reply size is asked again with a smaller one, and thinking is counted', async () => {
  const asked = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    asked.push(body.max_tokens)
    if (body.max_tokens > 8192) return new Response(JSON.stringify({ error: { message: 'max_tokens must be less than or equal to 8192' } }), { status: 400 })
    return sse([
      { choices: [{ delta: { reasoning_content: 'x'.repeat(700) } }] },
      { choices: [{ delta: { content: 'hello' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      '[DONE]'
    ])
  }
  let chars = 0
  const r = await streamOpenAI(
    { apiKey: 'k', baseUrl: 'https://api-inference.modelscope.cn', model: 'deepseek-ai/DeepSeek-V3.2', system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], maxTokens: 32768, fetchImpl },
    { progress: (n) => (chars += n) }
  )
  assert.equal(r.stopReason, 'end_turn')
  assert.ok(asked[0] === 32768 && asked.at(-1) === 8192, `asked ${asked}`)
  assert.equal(chars, 705)
})
