import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { PLANS } from './config.mjs'
import { createBilling } from './billing.mjs'
import { HttpError } from './http-error.mjs'
import { createPaystack } from './paystack.mjs'
import { hashCode, hashPassword, newCode, newId, RateLimiter, readToken, signToken, verifyPassword } from './security.mjs'

const DAY = 24 * 3_600_000
const SESSION_TTL = 60 * DAY
const CODE_TTL = 10 * 60_000
const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Local calendar day for the person's time zone (offset is `Date#getTimezoneOffset`, minutes). */
const dayKey = (offset = 0, now = Date.now()) => new Date(now - offset * 60_000).toISOString().slice(0, 10)

export function createApp({ config, repo, mail, fetchImpl = fetch }) {
  const limiter = new RateLimiter()
  setInterval(() => limiter.sweep(), 10 * 60_000).unref()
  const billing = createBilling({ config, repo, paystack: createPaystack({ secret: config.paystack.secret, base: config.paystack.base, fetchImpl }) })

  const tzOf = (req) => {
    const n = Number(req.headers['x-tz-offset'])
    return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 0
  }
  const ipOf = (req) => {
    if (config.trustProxyHops > 0) {
      // every trusted proxy appends the address it saw, so the person is `hops` entries from the end
      const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((a) => a.trim()).filter(Boolean)
      const seen = chain[chain.length - config.trustProxyHops]
      if (seen) return seen
    }
    return req.socket.remoteAddress || 'unknown'
  }

  /* ---------- shape sent to the app ---------- */

  async function publicAccount(u, tz = 0) {
    const today = dayKey(tz)
    const usage = await repo.usageMap(u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      provider: u.provider ?? 'password',
      verified: u.verified,
      onboarded: u.onboarded,
      tourSeen: u.tourSeen,
      profile: u.profile,
      project: u.project,
      recents: u.recents,
      plan: u.plan,
      apiKey: null, // an API key you bring yourself never leaves your computer
      sentToday: usage[today] ?? 0,
      sentDate: today,
      usage,
      billing: u.billing
    }
  }

  const newUser = (name, email, passHash) => ({
    id: newId(6),
    name,
    email,
    passHash,
    verified: false,
    created: Date.now(),
    onboarded: false,
    tourSeen: false,
    profile: null,
    project: null,
    recents: [],
    plan: 'free',
    billing: { card: null, yearly: false, renews: null, invoices: [] },
    provider: 'password'
  })

  const byEmail = async (email) => repo.userByEmail(email)

  /* ---------- sessions and codes ---------- */

  async function startSession(u, req) {
    const id = newId(9)
    await repo.addSession({ id, userId: u.id, created: Date.now(), agent: clean(req.headers['user-agent'], 200) })
    return signToken(config.secret, { sid: id, sub: u.id }, SESSION_TTL)
  }

  async function authenticate(req) {
    const h = req.headers.authorization
    const raw = (h && h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key']) || ''
    const claims = readToken(config.secret, raw)
    const session = claims && await repo.getSession(claims.sid)
    const found = session && await repo.userById(session.userId)
    if (!found) throw new HttpError(401, 'unauthorized', 'Please sign in again.')
    const user = await billing.refresh(found) // a plan never outlives what was paid for
    return { user, session }
  }

  async function issueCode(email, purpose, name) {
    const code = newCode()
    await repo.putCode(email, hashCode(config.secret, email, code), Date.now() + CODE_TTL, purpose)
    await mail.send(
      email,
      purpose === 'verify' ? 'Your MoreCode verification code' : 'Reset your MoreCode password',
      `${name ? `Hi ${name},\n\n` : ''}Your code is ${code}. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore this email.`
    )
    return code
  }

  async function checkCode(email, code, purpose) {
    const rec = await repo.getCode(email)
    if (!rec || rec.purpose !== purpose || rec.exp < Date.now()) {
      throw new HttpError(400, 'bad-code', 'That code is not right or has expired. Ask for a new one.')
    }
    if (rec.tries >= 5) throw new HttpError(429, 'too-many', 'Too many wrong codes. Ask for a new one.')
    if (hashCode(config.secret, email, String(code)) !== rec.hash) {
      await repo.bumpCodeTries(email)
      throw new HttpError(400, 'bad-code', 'That code is not right. Check it and try again.')
    }
    await repo.deleteCode(email)
  }

  function guard(key, max, windowMs, what = 'attempts') {
    const wait = limiter.hit(key, max, windowMs)
    if (wait) throw new HttpError(429, 'too-many', `Too many ${what}. Try again in ${Math.ceil(wait / 60)} minute(s).`, { retryAfter: wait })
  }

  /* ---------- auth routes ---------- */

  async function signup(req, body) {
    guard(`signup:${ipOf(req)}`, config.signupsPerHour, 3_600_000, 'sign-up attempts')
    const name = clean(body.name, 80)
    const email = clean(body.email, 254).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    if (!name) throw new HttpError(400, 'invalid', 'Tell us what to call you.')
    if (!isEmail(email)) throw new HttpError(400, 'invalid-email', 'Enter a valid email address.')
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'weak-password', 'Use 8 to 200 characters.')
    let u = await byEmail(email)
    if (u?.verified) throw new HttpError(409, 'exists', 'An account with this email already exists. Try signing in instead.')
    const passHash = await hashPassword(password)
    if (u) {
      Object.assign(u, { name, passHash })
      await repo.saveUser(u)
    } else {
      u = newUser(name, email, passHash)
      await repo.insertUser(u)
    }
    const code = await issueCode(email, 'verify', name)
    return { ok: true, ...(config.production ? {} : { devCode: code }) }
  }

  async function verify(req, body) {
    const email = clean(body.email, 254).toLowerCase()
    guard(`verify:${email}`, 15, 600_000, 'attempts')
    const u = await byEmail(email)
    if (!u) throw new HttpError(400, 'bad-code', 'That code is not right or has expired. Ask for a new one.')
    await checkCode(email, body.code, 'verify')
    u.verified = true
    await repo.saveUser(u)
    return { token: await startSession(u, req), account: await publicAccount(u, tzOf(req)) }
  }

  async function resend(req, body) {
    const email = clean(body.email, 254).toLowerCase()
    guard(`resend:${email}`, 3, 600_000, 'requests')
    const u = await byEmail(email)
    if (u && !u.verified) await issueCode(email, 'verify', u.name)
    return { ok: true }
  }

  async function signin(req, body) {
    const email = clean(body.email, 254).toLowerCase()
    const key = `signin:${email}:${ipOf(req)}`
    guard(key, 8, 15 * 60_000, 'sign-in attempts')
    const u = await byEmail(email)
    const ok = u?.verified && (await verifyPassword(typeof body.password === 'string' ? body.password : '', u.passHash))
    // the same answer for "no such account" and "wrong password", so emails cannot be probed
    if (!ok) throw new HttpError(401, 'bad-password', 'The email or password is not right.')
    limiter.clear(key)
    return { token: await startSession(u, req), account: await publicAccount(u, tzOf(req)) }
  }

  async function resetRequest(req, body) {
    const email = clean(body.email, 254).toLowerCase()
    if (!isEmail(email)) throw new HttpError(400, 'invalid-email', 'Enter a valid email address.')
    guard(`reset:${email}`, 3, 3_600_000, 'requests')
    const u = await byEmail(email)
    if (u?.verified) await issueCode(email, 'reset', u.name)
    return { ok: true } // identical whether or not the account exists
  }

  async function resetConfirm(req, body) {
    const email = clean(body.email, 254).toLowerCase()
    guard(`resetc:${email}`, 10, 3_600_000, 'attempts')
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'weak-password', 'Use 8 to 200 characters.')
    const u = await byEmail(email)
    if (!u?.verified) throw new HttpError(400, 'bad-code', 'That code is not right or has expired. Ask for a new one.')
    await checkCode(email, body.code, 'reset')
    u.passHash = await hashPassword(password)
    await repo.saveUser(u)
    await repo.deleteUserSessions(u.id) // everyone is signed out
    return { ok: true }
  }

  /* ---------- the signed-in person ---------- */

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
  const cleanProject = (p) => (p && typeof p === 'object' ? { name: str(p.name, 200), path: str(p.path, 1000) } : null)

  async function patchMe(user, body, tz) {
    if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim().slice(0, 80)
    if (typeof body.onboarded === 'boolean') user.onboarded = body.onboarded
    if (typeof body.tourSeen === 'boolean') user.tourSeen = body.tourSeen
    if (body.profile === null) user.profile = null
    else if (body.profile && typeof body.profile === 'object') {
      const goals = Array.isArray(body.profile.goals) ? body.profile.goals.filter((g) => typeof g === 'string').slice(0, 10) : []
      const experience = ['new', 'some', 'pro'].includes(body.profile.experience) ? body.profile.experience : 'some'
      user.profile = { goals, experience }
    }
    if (body.project === null) user.project = null
    else if (body.project) user.project = cleanProject(body.project)
    if (Array.isArray(body.recents)) user.recents = body.recents.slice(0, 6).map(cleanProject).filter(Boolean)

    // with real payments, a plan changes only when a payment (or a cancellation) says so, never because the app asked
    if (config.billing !== 'paystack') {
      if (typeof body.plan === 'string' && body.plan !== user.plan) {
        if (!PLANS[body.plan]) throw new HttpError(400, 'invalid', 'Unknown plan.')
        if (config.billing !== 'demo') throw new HttpError(403, 'billing-off', 'Plan changes are not available on this server.')
        user.plan = body.plan
      }
      if (body.billing && typeof body.billing === 'object' && config.billing === 'demo') {
        const b = body.billing
        const card = b.card && typeof b.card === 'object' ? { brand: str(b.card.brand, 20), last4: str(b.card.last4, 4), exp: str(b.card.exp, 7) } : null
        user.billing = {
          card,
          yearly: Boolean(b.yearly),
          renews: Number.isFinite(b.renews) ? b.renews : null,
          invoices: (Array.isArray(b.invoices) ? b.invoices : []).slice(0, 50).map((i) => ({
            id: str(i.id, 40),
            date: Number(i.date) || Date.now(),
            description: str(i.description, 120),
            amount: Number(i.amount) || 0
          }))
        }
      }
    }
    await repo.saveUser(user)
    return await publicAccount(user, tz)
  }

  async function deleteMe(user, body) {
    if (body.confirm !== true) throw new HttpError(400, 'invalid', 'Confirm to delete your account.')
    await billing.stopCharging(user)
    await repo.deleteCode(user.email)
    await repo.deleteUser(user.id) // sessions, usage, share links and synced chats go with it
    return { ok: true }
  }

  /* ---------- AI for people without their own key ---------- */

  const aiError = (status, type, message, headers = {}) => ({
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ type: 'error', error: { type, message } })
  })

  /** Returns an error response to send, or null when the request may go ahead (and is counted). */
  async function admit(user, req, model, tz) {
    const plan = PLANS[user.plan] ?? PLANS.free
    if (!plan.models.includes(model)) {
      return aiError(403, 'permission_error', `Your ${user.plan[0].toUpperCase()}${user.plan.slice(1)} plan does not include this model. Choose another, or upgrade.`)
    }
    // one message = one run: the many steps the AI takes for a single request are counted once
    const runId = clean(req.headers['x-morecode-run'], 64)
    const r = await repo.admitMessage(user.id, dayKey(tz), plan.daily, runId)
    if (r.ok) return null
    const now = Date.now()
    const mins = Math.max(1, 1440 - Math.floor(((now - tz * 60_000) % DAY) / 60_000))
    return aiError(429, 'rate_limit_error', `You have used all ${plan.daily} messages on your plan today. They come back in about ${Math.ceil(mins / 60)} hours.`, { 'retry-after': String(mins * 60) })
  }

  async function proxyAi(req, res, rawBody) {
    let user
    try {
      user = (await authenticate(req)).user
    } catch {
      return send(res, aiError(401, 'authentication_error', 'Please sign in again.'))
    }
    if (!config.anthropicKey) return send(res, aiError(503, 'api_error', 'AI is not set up on this server yet.'))
    let body
    try {
      body = JSON.parse(rawBody.toString('utf8'))
    } catch {
      return send(res, aiError(400, 'invalid_request_error', 'The request was not valid JSON.'))
    }
    const refused = await admit(user, req, String(body.model || ''), tzOf(req))
    if (refused) return send(res, refused)
    body.max_tokens = Math.min(Number(body.max_tokens) || 4096, 16_000)

    const ac = new AbortController()
    res.on('close', () => !res.writableEnded && ac.abort()) // the app stopped waiting: stop paying
    let upstream
    try {
      upstream = await fetchImpl(`${config.anthropicBase}/v1/messages`, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicKey,
          'anthropic-version': String(req.headers['anthropic-version'] || '2023-06-01')
        },
        body: JSON.stringify(body)
      })
    } catch {
      return send(res, aiError(502, 'api_error', 'Could not reach the AI service.'))
    }
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...(upstream.headers.get('retry-after') ? { 'retry-after': upstream.headers.get('retry-after') } : {}) })
    if (!upstream.body) return res.end()
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res)
  }

  /* ---------- share links ---------- */

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  async function createShare(user, body) {
    const chatId = clean(body.chatId, 64)
    const title = clean(body.title, 120) || 'Chat'
    const access = body.access === 'comment' ? 'comment' : 'view'
    if (!chatId || !Array.isArray(body.messages)) throw new HttpError(400, 'invalid', 'Nothing to share.')
    const messages = body.messages
      .slice(-500)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: str(m.text, 20_000) }))
      .filter((m) => m.text.trim())
    const existing = await repo.shareByChat(user.id, chatId)
    const share = { token: existing?.token ?? newId(9), userId: user.id, chatId, title, access, author: user.name, messages, created: existing?.created ?? Date.now(), updated: Date.now() }
    await repo.upsertShare(share)
    return { token: share.token, url: `${config.appUrl}/s/${share.token}` }
  }

  function sharePage(share) {
    const rows = share.messages
      .map((m) => `<section class="${m.role}"><h2>${m.role === 'user' ? 'You' : 'MoreCode'}</h2><p>${esc(m.text).replace(/\n/g, '<br>')}</p></section>`)
      .join('')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(share.title)}</title><style>
body{margin:0;background:#272726;color:#ececea;font:15px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}main{max-width:720px;margin:0 auto;padding:40px 20px}
h1{font-size:22px;margin:0 0 4px}.by{color:#8d8d8a;font-size:13px;margin:0 0 28px}h2{font-size:12px;letter-spacing:.05em;color:#8d8d8a;margin:0 0 4px;font-weight:600}
section{margin:0 0 22px}p{margin:0}.user p{background:#323231;padding:10px 14px;border-radius:12px}footer{color:#77776f;font-size:12px;margin-top:40px}</style></head>
<body><main><h1>${esc(share.title)}</h1><p class="by">Shared by ${esc(share.author)} · read only</p>${rows}<footer>Made with MoreCode</footer></main></body></html>`
  }

  /* ---------- sign in with Google / GitHub ---------- */

  const page = (title, body) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#272726;color:#ececea;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}main{max-width:380px;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#8d8d8a;margin:0}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`
  const htmlHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }
  const redirectUri = (provider) => `${config.appUrl}/v1/auth/oauth/${provider}/callback`

  /** Where Paystack sends the browser after paying. The app itself finds out through its own check; this page is for the person. */
  async function billingReturn(res, query) {
    const ref = query.get('reference') || query.get('trxref') || ''
    const finish = (status, title, body) => send(res, { status, headers: htmlHeaders, body: page(title, body) })
    if (!billing.live) return finish(404, 'Not available', 'Payments are not set up on this server.')
    try {
      const r = await billing.settle(ref)
      if (r.status === 'success') return finish(200, 'Payment received', 'Your plan is active. You can close this tab and return to MoreCode.')
      if (r.status === 'failed') return finish(200, 'The payment did not go through', 'You have not been charged. Go back to MoreCode and try again.')
      return finish(200, 'Still processing', 'This can take a minute. Return to MoreCode: your plan switches on as soon as the payment is confirmed.')
    } catch {
      return finish(200, 'Still processing', 'Return to MoreCode: your plan switches on as soon as the payment is confirmed.')
    }
  }

  async function oauthStart(res, provider, client) {
    const p = config.oauth[provider]
    if (!p) throw new HttpError(404, 'not-configured', `Sign in with ${provider} is not set up on this server.`)
    if (!/^[\w-]{20,80}$/.test(client)) throw new HttpError(400, 'invalid', 'Start sign-in from the app.')
    const state = newId(18)
    await repo.addOauthState(state, provider, client, Date.now() + 10 * 60_000)
    const q = new URLSearchParams({ client_id: p.id, redirect_uri: redirectUri(provider), response_type: 'code', state, scope: provider === 'google' ? 'openid email profile' : 'read:user user:email' })
    if (provider === 'google') q.set('prompt', 'select_account')
    return send(res, { status: 302, headers: { location: `${p.authUrl}?${q}`, 'cache-control': 'no-store' } })
  }

  /** Ask the provider who this is. Only an email the provider has verified is accepted. */
  async function providerProfile(provider, code) {
    const p = config.oauth[provider]
    const tokenRes = await fetchImpl(p.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: p.id, client_secret: p.secret, code, redirect_uri: redirectUri(provider), grant_type: 'authorization_code' })
    })
    const tok = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok || !tok.access_token) throw new Error('token exchange failed')
    const auth = { authorization: `Bearer ${tok.access_token}`, accept: 'application/json', 'user-agent': 'MoreCode' }
    if (provider === 'google') {
      const info = await (await fetchImpl(p.apiUrl, { headers: auth })).json()
      if (!info.email || info.email_verified !== true) throw new Error('unverified email')
      return { email: String(info.email).toLowerCase(), name: info.name || String(info.email).split('@')[0] }
    }
    const me = await (await fetchImpl(`${p.apiUrl}/user`, { headers: auth })).json()
    const emails = await (await fetchImpl(`${p.apiUrl}/user/emails`, { headers: auth })).json()
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) : null
    if (!primary) throw new Error('unverified email')
    return { email: String(primary.email).toLowerCase(), name: me.name || me.login || String(primary.email).split('@')[0] }
  }

  async function oauthCallback(res, provider, query) {
    const finish = (status, title, body) => send(res, { status, headers: htmlHeaders, body: page(title, body) })
    if (!config.oauth[provider]) return finish(404, 'Not available', 'Sign in with this provider is not set up.')
    const st = query.get('state') ? await repo.takeOauthState(query.get('state')) : null
    if (!st || st.provider !== provider || st.exp < Date.now()) return finish(400, 'That link expired', 'Go back to MoreCode and try signing in again.')
    if (query.get('error') || !query.get('code')) return finish(400, 'Sign-in was cancelled', 'You can close this tab and try again in MoreCode.')
    try {
      const prof = await providerProfile(provider, query.get('code'))
      let u = await byEmail(prof.email)
      if (u) {
        if (!u.verified) {
          u.verified = true // the provider has proved they own this email
          await repo.saveUser(u)
        }
      } else {
        u = { ...newUser(prof.name.slice(0, 80), prof.email, null), verified: true, provider }
        await repo.insertUser(u)
      }
      await repo.putTicket(st.client, u.id, Date.now() + 5 * 60_000)
      return finish(200, 'You’re signed in', 'You can close this tab and return to MoreCode.')
    } catch {
      return finish(400, 'Could not sign you in', 'The provider did not confirm a verified email. Try another way to sign in.')
    }
  }

  async function oauthPoll(req, body) {
    const client = clean(body.client, 80)
    if (!/^[\w-]{20,80}$/.test(client)) throw new HttpError(400, 'invalid', 'Start sign-in from the app.')
    guard(`poll:${client}`, 200, 10 * 60_000, 'requests')
    const t = await repo.takeTicket(client)
    if (!t || t.exp < Date.now()) return { pending: true }
    const u = await repo.userById(t.user_id)
    if (!u) return { pending: true }
    return { token: await startSession(u, req), account: await publicAccount(u, tzOf(req)) }
  }

  /* ---------- chats that follow you between computers ---------- */

  async function listChats(user, query) {
    const since = Math.max(0, Number(query.get('since')) || 0)
    return { chats: await repo.chatsSince(user.id, since), now: Date.now() }
  }

  async function putChat(user, id, body) {
    if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, 'invalid', 'Bad chat id.')
    if (!body.data || typeof body.data !== 'object') throw new HttpError(400, 'invalid', 'Nothing to save.')
    const raw = JSON.stringify(body.data)
    if (raw.length > 2_000_000) throw new HttpError(413, 'too-large', 'This chat is too large to sync.')
    const updated = Math.min(Number(body.updated) || Date.now(), Date.now() + 5 * 60_000) // never trust a far-future clock
    return { applied: await repo.putChat(user.id, id, body.data, updated), updated }
  }

  /* ---------- feedback and updates ---------- */

  async function addFeedback(req, body, user) {
    guard(`feedback:${user?.id ?? ipOf(req)}`, 10, 3_600_000, 'reports')
    const message = clean(body.message, 4000)
    if (!message) throw new HttpError(400, 'invalid', 'Write a few words about what happened.')
    const kind = ['bug', 'idea', 'other'].includes(body.kind) ? body.kind : 'other'
    const details = body.details && typeof body.details === 'object' ? JSON.stringify(body.details).slice(0, 4000) : null
    const id = newId(8)
    await repo.addFeedback({ id, userId: user?.id, kind, message, details, created: Date.now() })
    return { ok: true, id }
  }

  const newer = (a, b) => {
    const pa = String(a).split('.').map(Number)
    const pb = String(b).split('.').map(Number)
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
    return false
  }
  function latestRelease(version) {
    let rel = { latest: version || '0.0.0', notes: [], url: '' }
    if (config.releasesFile) {
      try {
        rel = { ...rel, ...JSON.parse(readFileSync(config.releasesFile, 'utf8')) }
      } catch {
        // a missing or unreadable file means "nothing newer is published"
      }
    }
    return { ...rel, upToDate: !newer(rel.latest, version || '0.0.0') }
  }

  /* ---------- plumbing ---------- */

  const cors = (req, res) => {
    const origin = req.headers.origin
    const allowed = config.origins.includes('*') ? '*' : config.origins.includes(origin) ? origin : ''
    if (allowed) {
      res.setHeader('access-control-allow-origin', allowed)
      res.setHeader('access-control-allow-headers', 'content-type, authorization, x-api-key, x-morecode-run, x-tz-offset, anthropic-version')
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      res.setHeader('access-control-max-age', '600')
    }
  }

  const send = (res, { status = 200, headers = {}, body = '' }) => {
    res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers })
    res.end(body)
  }
  const json = (res, status, data) => send(res, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(data) })

  async function readBody(req, limit) {
    const chunks = []
    let size = 0
    let tooLarge = false
    for await (const c of req) {
      size += c.length
      if (size > limit) tooLarge = true
      else if (!tooLarge) chunks.push(c)
    }
    if (tooLarge) throw new HttpError(413, 'too-large', 'That request is too large.')
    return Buffer.concat(chunks)
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const m = req.method

    if (m === 'GET' && path === '/health') {
      let up = false
      try {
        up = await repo.ping()
      } catch {
        // the database is not answering
      }
      return json(res, up ? 200 : 503, { ok: up })
    }
    if (m === 'GET' && path === '/v1/config') {
      return json(res, 200, { social: { google: Boolean(config.oauth.google), github: Boolean(config.oauth.github) }, billing: config.billing, ai: Boolean(config.anthropicKey), plans: PLANS, ...(billing.live ? { currency: config.paystack.currency, prices: config.paystack.prices } : {}) })
    }
    const oauth = /^\/v1\/auth\/oauth\/(google|github)\/(start|callback)$/.exec(path)
    if (m === 'GET' && oauth) return oauth[2] === 'start' ? await oauthStart(res, oauth[1], url.searchParams.get('client') || '') : oauthCallback(res, oauth[1], url.searchParams)
    if (m === 'GET' && path === '/v1/updates/latest') return json(res, 200, latestRelease(url.searchParams.get('version')))
    if (m === 'POST' && path === '/v1/ai/v1/messages') return proxyAi(req, res, await readBody(req, 30_000_000))

    const share = /^\/s\/([\w-]{6,40})$/.exec(path) || /^\/v1\/shares\/([\w-]{6,40})$/.exec(path)
    if (m === 'GET' && share) {
      const s = await repo.shareByToken(share[1])
      if (!s) throw new HttpError(404, 'not-found', 'This link is no longer shared.')
      if (path.startsWith('/s/')) return send(res, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }, body: sharePage(s) })
      return json(res, 200, { title: s.title, author: s.author, access: s.access, messages: s.messages })
    }

    if (m === 'POST' && path === '/v1/billing/paystack/webhook') {
      const raw = await readBody(req, 1_000_000)
      return json(res, 200, await billing.webhook(raw, req.headers['x-paystack-signature']))
    }
    if (m === 'GET' && path === '/billing/return') return billingReturn(res, url.searchParams)

    const readJson = async () => {
      const raw = await readBody(req, 2_000_000)
      if (!raw.length) return {}
      try {
        const v = JSON.parse(raw.toString('utf8'))
        return v && typeof v === 'object' ? v : {}
      } catch {
        throw new HttpError(400, 'invalid', 'The request was not valid JSON.')
      }
    }

    if (m === 'POST' && path === '/v1/auth/signup') return json(res, 200, await signup(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/verify') return json(res, 200, await verify(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/resend') return json(res, 200, await resend(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/signin') return json(res, 200, await signin(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/reset/request') return json(res, 200, await resetRequest(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/reset/confirm') return json(res, 200, await resetConfirm(req, await readJson()))
    if (m === 'POST' && path === '/v1/auth/oauth/poll') return json(res, 200, await oauthPoll(req, await readJson()))
    if (m === 'POST' && path === '/v1/feedback') {
      let who = null
      try {
        who = (await authenticate(req)).user // a signed-in report is linked to the account; an anonymous one still works
      } catch {
        // not signed in
      }
      return json(res, 200, await addFeedback(req, await readJson(), who))
    }

    // everything below needs a signed-in person
    const { user, session } = await authenticate(req)
    const tz = tzOf(req)
    if (m === 'POST' && path === '/v1/auth/signout') {
      await repo.deleteSession(session.id)
      return json(res, 200, { ok: true })
    }
    if (m === 'GET' && path === '/v1/me') return json(res, 200, { account: await publicAccount(user, tz) })
    if (m === 'PATCH' && path === '/v1/me') return json(res, 200, { account: await patchMe(user, await readJson(), tz) })
    if (m === 'DELETE' && path === '/v1/me') return json(res, 200, await deleteMe(user, await readJson()))
    if (m === 'POST' && path === '/v1/billing/checkout') {
      guard(`checkout:${user.id}`, 10, 3_600_000, 'checkout attempts')
      return json(res, 200, await billing.checkout(user, await readJson()))
    }
    if (m === 'GET' && path === '/v1/billing/status') {
      const r = await billing.settle(url.searchParams.get('reference') || '')
      const mine = r.status !== 'success' || r.userId === user.id // a payment that is not yours is "unknown" to you
      return json(res, 200, { status: mine ? r.status : 'unknown', account: await publicAccount((await repo.userById(user.id)) ?? user, tz) })
    }
    if (m === 'POST' && path === '/v1/billing/cancel') return json(res, 200, { account: await publicAccount(await billing.cancel(user), tz) })
    if (m === 'POST' && path === '/v1/billing/portal') return json(res, 200, await billing.updateCardLink(user))
    if (m === 'POST' && path === '/v1/shares') return json(res, 200, await createShare(user, await readJson()))
    const del = /^\/v1\/shares\/([\w-]{6,40})$/.exec(path)
    if (m === 'DELETE' && del) {
      await repo.deleteShare(del[1], user.id)
      return json(res, 200, { ok: true })
    }
    if (m === 'GET' && path === '/v1/chats') return json(res, 200, await listChats(user, url.searchParams))
    const chat = /^\/v1\/chats\/([\w-]{1,64})$/.exec(path)
    if (m === 'PUT' && chat) return json(res, 200, await putChat(user, chat[1], await readJson()))
    if (m === 'DELETE' && chat) {
      await repo.tombstoneChat(user.id, chat[1], Date.now())
      return json(res, 200, { ok: true })
    }
    throw new HttpError(404, 'not-found', 'There is nothing at that address.')
  }

  async function handler(req, res) {
    cors(req, res)
    if (req.method === 'OPTIONS') return send(res, { status: 204 })
    try {
      await route(req, res)
    } catch (err) {
      if (res.headersSent) return res.end()
      if (err instanceof HttpError) {
        return json(res, err.status, { error: { code: err.code, message: err.message, ...err.extra } })
      }
      console.error('Unhandled error:', err)
      json(res, 500, { error: { code: 'server', message: 'Something went wrong on our side. Please try again.' } })
    }
  }
  /** Housekeeping the server runs every few minutes: expired codes and tickets, and plans whose paid period is over. */
  handler.sweep = async () => {
    await repo.sweep()
    await billing.sweep()
  }
  return handler
}
