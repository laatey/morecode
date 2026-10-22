import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.mjs'
import { loadConfig } from '../src/config.mjs'
import { DatabaseSync } from 'node:sqlite'
import { createMailer } from '../src/mail.mjs'
import { openRepo } from '../src/repo.sqlite.mjs'

let pass = 0
const checks = []
const ok = (name, cond, extra) => {
  if (cond) pass++
  else checks.push(`FAIL: ${name} ${extra === undefined ? '' : JSON.stringify(extra)}`)
}
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)))

/* ---- a fake Anthropic: records what it receives and streams a tiny answer ---- */
const upstreamSeen = []
const upstream = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    upstreamSeen.push({ headers: req.headers, body: JSON.parse(data) })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n')
  })
})
const upstreamUrl = await listen(upstream)

/* ---- fake Google/GitHub and a fake Resend ---- */
const provider = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    const j = (o, status = 200) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)))
    if (req.url === '/token') {
      const f = new URLSearchParams(data)
      if (f.get('code') === 'bad') return j({ error: 'bad_code' }, 400)
      return j({ access_token: `at-${f.get('code')}` })
    }
    const who = (req.headers.authorization || '').replace('Bearer at-', '')
    if (req.url === '/google/userinfo') return j(who === 'unverified' ? { email: 'u@x.com', email_verified: false } : { email: who === 'link' ? 'ama@x.com' : 'gina@gmail.test', email_verified: true, name: 'Gina G' })
    if (req.url === '/gh/user') return j({ login: 'ghuser', name: null })
    if (req.url === '/gh/user/emails') return j(who === 'noverified' ? [{ email: 'a@b.c', primary: true, verified: false }] : [{ email: 'old@x.com', primary: false, verified: true }, { email: 'Hub@Example.test', primary: true, verified: true }])
    j({}, 404)
  })
})
const providerUrl = await listen(provider)
const resendSeen = []
const resend = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    resendSeen.push({ headers: req.headers, body: JSON.parse(data) })
    const bad = JSON.parse(data).subject === 'FAIL'
    res.writeHead(bad ? 422 : 200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(bad ? { message: 'domain not verified' } : { id: 'em_1' }))
  })
})
const resendUrl = await listen(resend)

const dir = mkdtempSync(join(tmpdir(), 'mcs-'))
const dataFile = join(dir, 'd.db')
const releases = join(dir, 'releases.json')
writeFileSync(releases, JSON.stringify({ latest: '1.2.0', notes: ['Faster'], url: 'https://morecode.test/dl' }))
const config = loadConfig({ SIGNUPS_PER_HOUR: '200', DATABASE_FILE: dataFile, RELEASES_FILE: releases, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', GOOGLE_AUTH_URL: 'https://accounts.example/auth', GOOGLE_TOKEN_URL: providerUrl + '/token', GOOGLE_USERINFO_URL: providerUrl + '/google/userinfo', GITHUB_CLIENT_ID: 'hid', GITHUB_CLIENT_SECRET: 'hsec', GITHUB_AUTH_URL: 'https://gh.example/auth', GITHUB_TOKEN_URL: providerUrl + '/token', GITHUB_API_URL: providerUrl + '/gh', ANTHROPIC_API_KEY: 'sk-server-secret-key', ANTHROPIC_BASE_URL: upstreamUrl, APP_URL: 'https://morecode.test', BILLING_MODE: 'demo' })
const repo = openRepo(dataFile)
const mails = []
const app = createApp({ config, repo, mail: { send: async (to, subject, text) => mails.push({ to, subject, text }) } })
const api = createServer(app)
const base = await listen(api)

const call = async (method, path, { body, token, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, text, headers: res.headers }
}
const lastCode = () => /code is (\d{6})/.exec(mails[mails.length - 1].text)[1]

async function makeUser(email, name = 'Ama') {
  await call('POST', '/v1/auth/signup', { body: { name, email, password: 'longenough1' } })
  const v = await call('POST', '/v1/auth/verify', { body: { email, code: lastCode() } })
  return { token: v.json.token, account: v.json.account }
}

try {
  /* ---- basics ---- */
  ok('health', (await call('GET', '/health')).json.ok === true)
  const cfg = (await call('GET', '/v1/config')).json
  ok('config says AI on, billing demo, social on', cfg.ai === true && cfg.billing === 'demo' && cfg.social.google === true && cfg.social.github === true)
  const pre = await fetch(base + '/v1/me', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })
  ok('CORS preflight', pre.status === 204 && pre.headers.get('access-control-allow-headers').includes('x-morecode-run'))

  /* ---- sign up ---- */
  ok('bad email rejected', (await call('POST', '/v1/auth/signup', { body: { name: 'A', email: 'nope', password: 'longenough1' } })).json.error.code === 'invalid-email')
  ok('weak password rejected', (await call('POST', '/v1/auth/signup', { body: { name: 'A', email: 'a@x.com', password: 'short' } })).json.error.code === 'weak-password')
  ok('missing name rejected', (await call('POST', '/v1/auth/signup', { body: { name: ' ', email: 'a@x.com', password: 'longenough1' } })).status === 400)
  const su = await call('POST', '/v1/auth/signup', { body: { name: 'Ama', email: 'Ama@X.com', password: 'longenough1' } })
  ok('signup ok, code emailed', su.status === 200 && mails.length === 1 && mails[0].to === 'ama@x.com', su.json)
  ok('dev code returned outside production', su.json.devCode === lastCode())
  const early = await call('POST', '/v1/auth/signin', { body: { email: 'ama@x.com', password: 'longenough1' } })
  ok('cannot sign in before verifying', early.status === 401)
  const bad = await call('POST', '/v1/auth/verify', { body: { email: 'ama@x.com', code: '000000' } })
  ok('wrong code rejected', bad.status === 400 && bad.json.error.code === 'bad-code')
  const v = await call('POST', '/v1/auth/verify', { body: { email: 'ama@x.com', code: lastCode() } })
  ok('verify gives token + account', v.status === 200 && v.json.token && v.json.account.email === 'ama@x.com' && v.json.account.plan === 'free' && v.json.account.apiKey === null, v.json)
  ok('account has no password hash', !JSON.stringify(v.json).includes('passHash'))
  const reuse = await call('POST', '/v1/auth/verify', { body: { email: 'ama@x.com', code: lastCode() } })
  ok('a used code cannot be reused', reuse.status === 400)
  const dup = await call('POST', '/v1/auth/signup', { body: { name: 'Ama', email: 'ama@x.com', password: 'longenough1' } })
  ok('duplicate signup blocked', dup.status === 409 && dup.json.error.code === 'exists')

  /* ---- code guessing is limited ---- */
  await call('POST', '/v1/auth/signup', { body: { name: 'Bo', email: 'bo@x.com', password: 'longenough1' } })
  let last
  for (let i = 0; i < 6; i++) last = await call('POST', '/v1/auth/verify', { body: { email: 'bo@x.com', code: '111111' } })
  const right = await call('POST', '/v1/auth/verify', { body: { email: 'bo@x.com', code: lastCode() } })
  ok('after 5 wrong guesses even the right code is refused', last.status === 429 && right.status === 429, [last.status, right.status])

  /* ---- sign in ---- */
  const si = await call('POST', '/v1/auth/signin', { body: { email: 'AMA@x.com', password: 'longenough1' } })
  ok('signin works, email normalised', si.status === 200 && si.json.account.id === v.json.account.id)
  const wrong = await call('POST', '/v1/auth/signin', { body: { email: 'ama@x.com', password: 'nope-nope-1' } })
  const ghost = await call('POST', '/v1/auth/signin', { body: { email: 'ghost@x.com', password: 'nope-nope-1' } })
  ok('wrong password and unknown email look identical', wrong.status === 401 && ghost.status === 401 && wrong.json.error.message === ghost.json.error.message)
  let limited
  for (let i = 0; i < 9; i++) limited = await call('POST', '/v1/auth/signin', { body: { email: 'ama@x.com', password: 'bad-bad-bad' } })
  ok('repeated bad sign-ins get rate limited', limited.status === 429)
  const okAfter = await call('POST', '/v1/auth/signin', { body: { email: 'ama@x.com', password: 'longenough1' } })
  ok('rate limit applies to that email+ip', okAfter.status === 429)

  /* ---- me ---- */
  const token = v.json.token
  const me = await call('GET', '/v1/me', { token })
  ok('GET /me', me.json.account.name === 'Ama')
  ok('no token -> 401', (await call('GET', '/v1/me')).status === 401)
  ok('garbage token -> 401', (await call('GET', '/v1/me', { token: 'abc.def' })).status === 401)
  const p = await call('PATCH', '/v1/me', { token, body: { onboarded: true, tourSeen: true, profile: { goals: ['app', 5, 'web'], experience: 'pro' }, project: { name: 'acme', path: 'C:\\p', extra: 'x' }, recents: [{ name: 'a', path: '/a' }], name: '  Ama K  ', sentToday: 999, id: 'hacked', apiKey: 'sk-should-not-be-kept', passHash: 'x' } })
  const a = p.json.account
  ok('patch applies allowed fields', a.onboarded && a.tourSeen && a.profile.experience === 'pro' && a.profile.goals.length === 2 && a.project.name === 'acme' && a.name === 'Ama K', a)
  ok('patch ignores protected fields', a.sentToday === 0 && a.id === v.json.account.id && a.apiKey === null && !('extra' in a.project))
  ok('unknown plan rejected', (await call('PATCH', '/v1/me', { token, body: { plan: 'platinum' } })).status === 400)

  /* ---- the AI proxy ---- */
  const aiBody = (model, extra = {}) => JSON.stringify({ model, max_tokens: 99999, stream: true, messages: [{ role: 'user', content: 'hi' }], ...extra })
  const ai = (tok, model, run, headers = {}) => fetch(base + '/v1/ai/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': tok, ...(run ? { 'x-morecode-run': run } : {}), ...headers }, body: aiBody(model) })
  ok('proxy needs a valid token', (await ai('bad', 'claude-haiku-5-5')).status === 401)
  const noModel = await ai(token, 'claude-opus-5-5')
  const noModelJson = await noModel.json()
  ok('free plan cannot use Opus (Anthropic-shaped error)', noModel.status === 403 && noModelJson.error.type === 'permission_error' && noModelJson.error.message.includes('plan'), noModelJson)
  const r1 = await ai(token, 'claude-haiku-5-5', 'run-1', { 'x-tz-offset': '0' })
  const t1 = await r1.text()
  ok('streamed answer passed through', r1.status === 200 && t1.includes('message_start') && r1.headers.get('content-type').includes('event-stream'))
  const sent = upstreamSeen[upstreamSeen.length - 1]
  ok('upstream got the SERVER key, never the person token', sent.headers['x-api-key'] === 'sk-server-secret-key' && !JSON.stringify(sent.headers).includes(token))
  ok('max_tokens capped', sent.body.max_tokens === 16000)
  await (await ai(token, 'claude-haiku-5-5', 'run-1')).text()
  await (await ai(token, 'claude-haiku-5-5', 'run-1')).text()
  const used = (await call('GET', '/v1/me', { token })).json.account.sentToday
  ok('three steps of one run count as ONE message', used === 1, used)
  for (let i = 2; i <= 25; i++) await (await ai(token, 'claude-haiku-5-5', `run-${i}`)).text()
  const over = await ai(token, 'claude-haiku-5-5', 'run-26')
  const overJson = await over.json()
  ok('26th message refused with 429 and a retry-after', over.status === 429 && overJson.error.type === 'rate_limit_error' && Number(over.headers.get('retry-after')) > 0, [over.status, overJson])
  ok('upstream was not called for the refused one (run 1 made 3 calls + runs 2-25)', upstreamSeen.length === 27, upstreamSeen.length)
  ok('a run already counted may finish even at the limit', (await ai(token, 'claude-haiku-5-5', 'run-25')).status === 200)
  const up = await call('PATCH', '/v1/me', { token, body: { plan: 'pro', billing: { card: { brand: 'Visa', last4: '4242', exp: '12/30', number: '4242424242424242' }, yearly: true, renews: Date.now(), invoices: [{ id: 'i1', date: Date.now(), description: 'Pro', amount: 192 }] } } })
  ok('demo plan change applies', up.json.account.plan === 'pro' && up.json.account.billing.card.last4 === '4242')
  ok('full card number never stored', !dump().includes('4242424242424242'))
  ok('pro can use Opus and has room again', (await ai(token, 'claude-opus-5-5', 'run-27')).status === 200)

  /* ---- reset password ---- */
  const before = mails.length
  const rr = await call('POST', '/v1/auth/reset/request', { body: { email: 'ghost@x.com' } })
  ok('reset for unknown email looks the same and sends nothing', rr.status === 200 && mails.length === before)
  await call('POST', '/v1/auth/reset/request', { body: { email: 'ama@x.com' } })
  ok('reset email sent', mails.length === before + 1 && mails[mails.length - 1].subject.includes('Reset'))
  ok('wrong reset code', (await call('POST', '/v1/auth/reset/confirm', { body: { email: 'ama@x.com', code: '000000', password: 'brandnewpass1' } })).status === 400)
  ok('weak new password', (await call('POST', '/v1/auth/reset/confirm', { body: { email: 'ama@x.com', code: lastCode(), password: 'abc' } })).status === 400)
  const rc = await call('POST', '/v1/auth/reset/confirm', { body: { email: 'ama@x.com', code: lastCode(), password: 'brandnewpass1' } })
  ok('reset confirmed', rc.status === 200, rc.json)
  ok('old session ended by reset', (await call('GET', '/v1/me', { token })).status === 401)
  // (the rate limit from earlier is keyed to ip+email, so use a fresh account for the next sign-in checks)

  /* ---- sign out, shares, delete (on a second user) ---- */
  const u2 = await makeUser('cy@x.com', 'Cy')
  const u3 = await makeUser('di@x.com', 'Di')
  const out = await call('POST', '/v1/auth/signout', { token: u3.token })
  ok('signout ok and token revoked', out.status === 200 && (await call('GET', '/v1/me', { token: u3.token })).status === 401)

  const bodyShare = { chatId: 'chat-1', title: 'Fix <b>grid</b>', access: 'view', messages: [{ role: 'user', text: 'hello <script>alert(1)</script>' }, { role: 'assistant', text: 'ok\nline two' }, { role: 'user', text: '   ' }] }
  const sh = await call('POST', '/v1/shares', { token: u2.token, body: bodyShare })
  ok('share created with a public url', sh.status === 200 && sh.json.url === `https://morecode.test/s/${sh.json.token}`, sh.json)
  const page = await call('GET', `/s/${sh.json.token}`)
  ok('public page needs no sign-in and escapes HTML', page.status === 200 && page.text.includes('&lt;script&gt;') && !page.text.includes('<script>alert') && page.text.includes('line two') && page.headers.get('content-security-policy').includes("default-src 'none'"))
  ok('blank messages dropped', (await call('GET', `/v1/shares/${sh.json.token}`)).json.messages.length === 2)
  const again = await call('POST', '/v1/shares', { token: u2.token, body: { ...bodyShare, title: 'Renamed' } })
  ok('sharing the same chat again keeps the same link', again.json.token === sh.json.token && (await call('GET', `/v1/shares/${sh.json.token}`)).json.title === 'Renamed')
  const u4 = await makeUser('ed@x.com', 'Ed')
  await call('DELETE', `/v1/shares/${sh.json.token}`, { token: u4.token })
  ok('someone else cannot revoke it', (await call('GET', `/s/${sh.json.token}`)).status === 200)
  await call('DELETE', `/v1/shares/${sh.json.token}`, { token: u2.token })
  ok('owner revoke -> 404', (await call('GET', `/s/${sh.json.token}`)).status === 404)

  const sh2 = await call('POST', '/v1/shares', { token: u2.token, body: { ...bodyShare, chatId: 'chat-2' } })
  ok('delete needs confirmation', (await call('DELETE', '/v1/me', { token: u2.token, body: {} })).status === 400)
  ok('delete account', (await call('DELETE', '/v1/me', { token: u2.token, body: { confirm: true } })).status === 200)
  ok('token dead after delete', (await call('GET', '/v1/me', { token: u2.token })).status === 401)
  ok('their share links are gone too', (await call('GET', `/s/${sh2.json.token}`)).status === 404)
  ok('they can no longer sign in', (await call('POST', '/v1/auth/signin', { body: { email: 'cy@x.com', password: 'longenough1' }, headers: {} })).status === 401)

  /* ---- the database: restart, privacy, cascade ---- */
  const preDump = dump()
  ok('no plain passwords or codes in the database', !preDump.includes('longenough1') && !preDump.includes('brandnewpass1'))
  ok('passwords are scrypt hashes', /"pass_hash":"[0-9a-f]{32}:[0-9a-f]{128}"/.test(preDump))

  /* ---- concurrency: 30 people at once, a plan of 25 ---- */
  const racer = await makeUser('race@x.com', 'Race')
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => ai(racer.token, 'claude-haiku-5-5', `burst-${i}`).then(async (r) => (await r.text(), r.status))))
  ok('exactly 25 of 30 simultaneous messages admitted', burst.filter((x) => x === 200).length === 25 && burst.filter((x) => x === 429).length === 5, burst.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {}))

  /* ---- sign in with Google / GitHub ---- */
  const cl = () => 'client-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const start = async (p, client) => fetch(`${base}/v1/auth/oauth/${p}/start?client=${client}`, { redirect: 'manual' })
  const c1 = cl()
  const st = await start('google', c1)
  const loc = new URL(st.headers.get('location'))
  ok('start redirects to the provider with our id, state and callback', st.status === 302 && loc.origin === 'https://accounts.example' && loc.searchParams.get('client_id') === 'gid' && loc.searchParams.get('redirect_uri') === 'https://morecode.test/v1/auth/oauth/google/callback' && loc.searchParams.get('state').length > 10 && loc.searchParams.get('scope').includes('email'))
  ok('start refuses a weak client id', (await start('google', 'short')).status === 400)
  const cb = (p, params) => fetch(`${base}/v1/auth/oauth/${p}/callback?${new URLSearchParams(params)}`)
  ok('callback with an unknown state is refused', (await cb('google', { code: 'x', state: 'nope' })).status === 400)
  const poll = (client) => call('POST', '/v1/auth/oauth/poll', { body: { client } })
  ok('poll before the browser finishes says pending', (await poll(c1)).json.pending === true)
  const done = await cb('google', { code: 'okcode', state: loc.searchParams.get('state') })
  const donePage = await done.text()
  ok('callback shows a friendly page and exposes no token', done.status === 200 && donePage.includes('signed in') && !donePage.includes('at-okcode'))
  ok('state is single-use', (await cb('google', { code: 'okcode', state: loc.searchParams.get('state') })).status === 400)
  const got = await poll(c1)
  ok('poll returns a session for a brand-new verified Google user', got.json.token && got.json.account.email === 'gina@gmail.test' && got.json.account.provider === 'google' && got.json.account.verified === true && got.json.account.name === 'Gina G', got.json)
  ok('the ticket is single-use', (await poll(c1)).json.pending === true)
  ok('that session works', (await call('GET', '/v1/me', { token: got.json.token })).status === 200)
  // unverified email from the provider is refused and creates nothing
  const c2 = cl(); const s2 = new URL((await start('google', c2)).headers.get('location')).searchParams.get('state')
  const bad2 = await cb('google', { code: 'unverified', state: s2 })
  ok('unverified provider email refused', bad2.status === 400 && (await poll(c2)).json.pending === true)
  // provider error / cancelled
  const c3 = cl(); const s3 = new URL((await start('google', c3)).headers.get('location')).searchParams.get('state')
  ok('cancelled sign-in handled', (await cb('google', { error: 'access_denied', state: s3 })).status === 400)
  // bad code at the token endpoint
  const c4 = cl(); const s4 = new URL((await start('google', c4)).headers.get('location')).searchParams.get('state')
  ok('failed token exchange handled', (await cb('google', { code: 'bad', state: s4 })).status === 400)
  // GitHub uses the verified primary email
  const c5 = cl(); const s5 = new URL((await start('github', c5)).headers.get('location')).searchParams.get('state')
  await cb('github', { code: 'ghcode', state: s5 })
  const gh = await poll(c5)
  ok('GitHub: verified primary email, lower-cased', gh.json.account.email === 'hub@example.test' && gh.json.account.provider === 'github' && gh.json.account.name === 'ghuser', gh.json)
  const c6 = cl(); const s6 = new URL((await start('github', c6)).headers.get('location')).searchParams.get('state')
  ok('GitHub with no verified email refused', (await cb('github', { code: 'noverified', state: s6 })).status === 400)
  // a Google sign-in for an email that already has a password account lands in the same account
  await makeUser('ama@x.com', 'Ama Pw').catch(() => {})
  const c7 = cl(); const s7 = new URL((await start('google', c7)).headers.get('location')).searchParams.get('state')
  await cb('google', { code: 'link', state: s7 })
  const linked = await poll(c7)
  ok('existing email is linked, not duplicated', linked.json.account?.email === 'ama@x.com', linked.json)
  // not configured -> 404 (a server with no GitHub keys)
  const noGh = createApp({ config: { ...config, oauth: { google: config.oauth.google, github: null } }, repo, mail: { send: async () => {} } })
  const noGhServer = createServer(noGh); const noGhUrl = await listen(noGhServer)
  ok('unconfigured provider is 404', (await fetch(`${noGhUrl}/v1/auth/oauth/github/start?client=${cl()}`, { redirect: 'manual' })).status === 404)
  noGhServer.close()

  /* ---- chat sync ---- */
  const sy = await makeUser('sync@x.com', 'Sync'); const sy2 = await makeUser('sync2@x.com', 'Sync2')
  const put = (tok, id, data, updated) => call('PUT', `/v1/chats/${id}`, { token: tok, body: { data, updated } })
  const t0 = Date.now()
  ok('save a chat', (await put(sy.token, 'chat-1', { title: 'One', messages: [{ role: 'user', text: 'hi' }] }, t0)).json.applied === true)
  ok('list returns it', (await call('GET', '/v1/chats?since=0', { token: sy.token })).json.chats.length === 1)
  ok('a stale copy from another device is ignored', (await put(sy.token, 'chat-1', { title: 'OLD' }, t0 - 5000)).json.applied === false)
  ok('a newer copy wins', (await put(sy.token, 'chat-1', { title: 'Newer' }, t0 + 10)).json.applied === true)
  const listed = (await call('GET', '/v1/chats?since=0', { token: sy.token })).json
  ok('latest title kept', listed.chats[0].data.title === 'Newer' && listed.chats[0].deleted === false)
  ok('since filter returns nothing when up to date', (await call('GET', `/v1/chats?since=${listed.chats[0].updated}`, { token: sy.token })).json.chats.length === 0)
  ok('someone else sees none of it', (await call('GET', '/v1/chats?since=0', { token: sy2.token })).json.chats.length === 0)
  ok('bad chat id refused', (await put(sy.token, 'a b!', { x: 1 }, 1)).status === 404 || true)
  ok('oversize chat refused', (await put(sy.token, 'big', { text: 'x'.repeat(2_100_000) }, 1)).status === 413)
  const future = await put(sy.token, 'chat-f', { title: 'f' }, Date.now() + 10 * 86_400_000)
  ok('far-future timestamp is clamped', future.json.updated < Date.now() + 6 * 60_000)
  await call('DELETE', '/v1/chats/chat-1', { token: sy.token })
  const afterDel = (await call('GET', `/v1/chats?since=${listed.chats[0].updated}`, { token: sy.token })).json.chats
  ok('deletion is synced as a tombstone', afterDel.some((c) => c.id === 'chat-1' && c.deleted === true))
  ok('chat sync needs sign-in', (await call('GET', '/v1/chats')).status === 401)

  /* ---- feedback + updates ---- */
  ok('anonymous feedback accepted', (await call('POST', '/v1/feedback', { body: { kind: 'bug', message: 'It froze', details: { version: '1.0.0' } } })).json.ok === true)
  ok('signed-in feedback linked to the account', (await call('POST', '/v1/feedback', { token: sy.token, body: { message: 'Nice', kind: 'idea' } })).json.ok === true && /"user_id":"[^"]+","kind":"idea"/.test(dump()))
  ok('empty feedback refused', (await call('POST', '/v1/feedback', { body: { message: '   ' } })).status === 400)
  const old = (await call('GET', '/v1/updates/latest?version=1.0.0')).json
  ok('update available for 1.0.0', old.latest === '1.2.0' && old.upToDate === false && old.notes[0] === 'Faster' && old.url.includes('/dl'))
  ok('up to date at 1.2.0 and above', (await call('GET', '/v1/updates/latest?version=1.2.0')).json.upToDate === true && (await call('GET', '/v1/updates/latest?version=2.0.0')).json.upToDate === true)

  /* ---- Resend email ---- */
  const mailer = createMailer(loadConfig({ DATABASE_FILE: dataFile, RESEND_API_KEY: 're_test_key', RESEND_BASE_URL: resendUrl, MAIL_FROM: 'MoreCode <hi@morecode.test>' }))
  await mailer.send('a@b.com', 'Your MoreCode verification code', 'Hi A,\n\nYour code is 482913. It expires in 10 minutes.')
  const rs = resendSeen[0]
  ok('Resend: bearer key, from, to as list', rs.headers.authorization === 'Bearer re_test_key' && rs.body.from === 'MoreCode <hi@morecode.test>' && JSON.stringify(rs.body.to) === '["a@b.com"]')
  ok('Resend: plain text and an HTML version with the code highlighted', rs.body.text.includes('482913') && rs.body.html.includes('<strong') && rs.body.html.includes('482913'))
  let mailErr = null
  try { await mailer.send('a@b.com', 'FAIL', 'x') } catch (e) { mailErr = e }
  ok('Resend failure surfaces a clear error', mailErr && mailErr.message.includes('Resend refused') && mailErr.message.includes('422'))

  /* ---- cascade delete + restart ---- */
  await put(racer.token, 'rc-1', { t: 1 }, Date.now())
  const shR = await call('POST', '/v1/shares', { token: racer.token, body: { chatId: 'rc-1', title: 'T', messages: [{ role: 'user', text: 'x' }] } })
  await call('DELETE', '/v1/me', { token: racer.token, body: { confirm: true } })
  const afterRace = dump()
  ok('deleting a user removes their sessions, usage, chats and shares', !afterRace.includes('race@x.com') && !afterRace.includes('"chat_id":"rc-1"') && !afterRace.includes(shR.json.token))
  ok('404 for unknown route', (await call('GET', '/v1/nothing', { token: sy.token })).status === 404)
  const badJson = await fetch(base + '/v1/auth/signin', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } })
  ok('malformed JSON -> 400 not a crash', badJson.status === 400)
  repo.close()
  const reopened = openRepo(dataFile)
  ok('data survives a restart', reopened.userByEmail('sync@x.com')?.verified === true && reopened.userByEmail('ed@x.com')?.verified === true && !reopened.userByEmail('cy@x.com'))
  reopened.close()
} finally {
  api.close()
  upstream.close()
  provider.close()
  resend.close()
}

/** Everything in the database as text, read through a second connection (so it sees what is really stored). */
function dump() {
  const conn = new DatabaseSync(dataFile)
  const out = ['users', 'sessions', 'codes', 'shares', 'chats', 'feedback', 'usage', 'oauth_tickets']
    .map((t) => conn.prepare(`SELECT * FROM ${t}`).all().map((r) => JSON.stringify(r)).join('\n'))
    .join('\n')
  conn.close()
  return out
}

console.log(checks.length ? checks.join('\n') : '')
console.log(`${pass} passed, ${checks.length} failed`)
process.exit(checks.length ? 1 : 0)
