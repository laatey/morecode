import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.mjs'
import { loadConfig } from '../src/config.mjs'
import { openRepo } from '../src/repo.sqlite.mjs'

let pass = 0
const checks = []
const ok = (name, cond, extra) =>
  cond ? pass++ : checks.push(`FAIL: ${name} ${extra === undefined ? '' : JSON.stringify(extra)}`)

/** A server that allows only 2 sign-ups an hour per address, so the address it sees is easy to observe. */
async function serve(env) {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-'))
  const file = join(dir, 'd.db')
  const config = loadConfig({
    SIGNUPS_PER_HOUR: '2',
    DATABASE_FILE: file,
    BILLING_MODE: 'demo',
    ...env
  })
  const app = createApp({ config, repo: openRepo(file), mail: { send: async () => {} } })
  const server = createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  let n = 0
  const signup = async (forwarded) =>
    (
      await fetch(base + '/v1/auth/signup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(forwarded ? { 'x-forwarded-for': forwarded } : {})
        },
        body: JSON.stringify({ name: 'A', email: `a${++n}@x.com`, password: 'longenough1' })
      })
    ).status
  return { signup, close: () => server.close() }
}

try {
  // Not behind a proxy: the header is ignored, so claiming a new address does not reset the limit.
  const direct = await serve({})
  await direct.signup('9.9.9.1')
  await direct.signup('9.9.9.2')
  ok('without a proxy, X-Forwarded-For is ignored', (await direct.signup('9.9.9.3')) === 429)
  direct.close()

  // Behind one proxy: people are told apart by the address the proxy saw, not all lumped together as the proxy.
  const behind = await serve({ TRUST_PROXY_HOPS: '1' })
  await behind.signup('10.0.0.1')
  await behind.signup('10.0.0.1')
  ok('behind a proxy, one person is limited', (await behind.signup('10.0.0.1')) === 429)
  ok('behind a proxy, a different person is not', (await behind.signup('10.0.0.2')) === 200)
  // the person typed their own header; the proxy appended the real address after it
  ok(
    'behind a proxy, a made-up address in front changes nothing',
    (await behind.signup('1.2.3.4, 10.0.0.1')) === 429
  )
  behind.close()

  let threw = ''
  try {
    loadConfig({ TRUST_PROXY_HOPS: 'lots' })
  } catch (e) {
    threw = e.message
  }
  ok('a nonsense proxy count is refused at startup', threw.includes('TRUST_PROXY_HOPS'), threw)

  // production allows no browser origin unless one is listed
  const prod = {
    NODE_ENV: 'production',
    TOKEN_SECRET: 'x',
    DATABASE_URL: 'postgres://x',
    BILLING_MODE: 'off'
  }
  ok('production allows no web origin by default', loadConfig(prod).origins.length === 0)
  ok(
    'production allows the origins that are listed',
    loadConfig({ ...prod, ALLOWED_ORIGINS: 'https://a.test, https://b.test' }).origins.join() ===
      'https://a.test,https://b.test'
  )
  ok(
    'development still allows any origin',
    loadConfig({ DATABASE_FILE: join(tmpdir(), 'mcp-cfg.db') }).origins.join() === '*'
  )
} catch (e) {
  checks.push(`FAIL: crashed ${e.stack}`)
}
console.log(checks.length ? checks.join('\n') : '')
console.log(`${pass} passed, ${checks.length} failed`)
process.exit(checks.length ? 1 : 0)
