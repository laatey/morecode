import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.mjs'
import { loadConfig } from '../src/config.mjs'
import { openRepo } from '../src/repo.sqlite.mjs'
import { SESSION_MS, WEEK_MS, addTokens, blocked, costOf, roll, start, usageReader, view } from '../src/limits.mjs'

let pass = 0
const checks = []
const ok = (name, cond, extra) => (cond ? pass++ : checks.push(`FAIL: ${name} ${extra === undefined ? '' : JSON.stringify(extra)}`))

try {
  const caps = { session: 1000, week: 5000 }
  const t0 = 1_000_000

  /* ---- the windows ---- */
  ok('nothing is blocked before anything is used', blocked(null, t0, caps) === null)
  let row = addTokens(start(null, t0), 1000, t0)
  const hit = blocked(row, t0 + 60_000, caps)
  ok('a full session blocks and says when it resets', hit?.which === 'session' && hit.resetsAt === t0 + SESSION_MS, hit)
  ok('the session resets after 5 hours', blocked(row, t0 + SESSION_MS, caps) === null && roll(row, t0 + SESSION_MS).sessionTokens === 0)
  ok('but the week keeps counting through a session reset', roll(row, t0 + SESSION_MS).weekTokens === 1000)
  row = { sessionStart: t0, sessionTokens: 10, weekStart: t0, weekTokens: 5000 }
  const wk = blocked(row, t0 + 1000, caps)
  ok('a full week blocks, and is reported even if the session has room', wk?.which === 'week' && wk.resetsAt === t0 + WEEK_MS, wk)
  ok('the week resets after 7 days', blocked(row, t0 + WEEK_MS, caps) === null)
  ok('a window starts with the first message after the last one ended', start(roll(row, t0 + SESSION_MS), t0 + SESSION_MS).sessionStart === t0 + SESSION_MS)

  const v = view({ sessionStart: t0, sessionTokens: 250, weekStart: t0, weekTokens: 1, }, t0 + 1000, caps)
  ok('the app view shows percent and reset time', v.session.percent === 25 && v.week.percent === 1 && v.session.resetsAt === t0 + SESSION_MS, v)
  ok('a window that has not started has no reset time', view(null, t0, caps).session.resetsAt === null)

  /* ---- what a response costs ---- */
  ok('cached input counts a tenth, and a pricier model counts more', costOf({ input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 1000 }, 'claude-sonnet-5-5') === 300 && costOf({ input_tokens: 100, output_tokens: 100 }, 'claude-opus-5-5') === 400 && costOf({ input_tokens: 400 }, 'claude-haiku-5-5') === 100)
  ok('junk usage costs nothing', costOf({ input_tokens: -5, output_tokens: 'x' }, 'claude-sonnet-5-5') === 0 && costOf(undefined, 'x') === 0)

  /* ---- reading the numbers out of a stream, even when chunks split a line ---- */
  const r = usageReader(true)
  const body = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":70,"cache_read_input_tokens":5}}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":12}}\n\n'
  r.feed(Buffer.from(body.slice(0, 55)))
  r.feed(Buffer.from(body.slice(55)))
  const u = r.done()
  ok('stream usage is read across chunk boundaries', u.input_tokens === 70 && u.output_tokens === 12 && u.cache_read_input_tokens === 5, u)
  const j = usageReader(false)
  j.feed(Buffer.from('{"id":"m","usage":{"input_tokens":9,"output_tokens":3}}'))
  ok('a plain JSON answer is read too', j.done().output_tokens === 3)

  /* ---- limits are settings: adjustable and checked ---- */
  const cfg = loadConfig({ DATABASE_FILE: join(tmpdir(), 'mcp-lim.db'), LIMIT_PRO_WEEK: '123' })
  ok('limits can be set from the environment', cfg.plans.pro.week === 123 && cfg.plans.pro.session === 1_500_000 && cfg.plans.max.session === 5 * cfg.plans.pro.session)
  let threw = ''
  try { loadConfig({ DATABASE_FILE: join(tmpdir(), 'mcp-lim.db'), LIMIT_FREE_SESSION: '-1' }) } catch (e) { threw = e.message }
  ok('a nonsense limit is refused at startup', threw.includes('LIMIT_FREE_SESSION'), threw)

  /* ---- plans cannot be bought unless the AI they pay for is on ---- */
  ok('forgetting BILLING_MODE never gives plans away', loadConfig({ DATABASE_FILE: join(tmpdir(), 'mcp-lim.db') }).billing === 'off')
  const serve = async (env) => {
    const dir = mkdtempSync(join(tmpdir(), 'mcl-'))
    const file = join(dir, 'd.db')
    const config = loadConfig({ DATABASE_FILE: file, SIGNUPS_PER_HOUR: '50', BILLING_MODE: 'demo', ...env })
    const server = createServer(createApp({ config, repo: openRepo(file), mail: { send: async () => {} } }))
    await new Promise((res) => server.listen(0, '127.0.0.1', res))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (m, path, token, body) => {
      const x = await fetch(base + path, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: x.status, json: await x.json().catch(() => ({})) }
    }
    return { call, close: () => server.close() }
  }
  const noAi = await serve({})
  const cfgNoAi = await noAi.call('GET', '/v1/config')
  ok('with no AI key the app is told billing is off', cfgNoAi.json.billing === 'off' && cfgNoAi.json.ai === false, cfgNoAi.json)
  noAi.close()
  const withAi = await serve({ ANTHROPIC_API_KEY: 'sk-test' })
  const cfgAi = await withAi.call('GET', '/v1/config')
  ok('with an AI key, demo billing is on', cfgAi.json.billing === 'demo' && cfgAi.json.ai === true, cfgAi.json)
  withAi.close()
} catch (e) {
  checks.push(`FAIL: crashed ${e.stack}`)
}
console.log(checks.length ? checks.join('\n') : '')
console.log(`${pass} passed, ${checks.length} failed`)
process.exit(checks.length ? 1 : 0)
