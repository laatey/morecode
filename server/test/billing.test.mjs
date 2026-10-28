import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp } from '../src/app.mjs'
import { addPeriod, GRACE } from '../src/billing.mjs'
import { loadConfig } from '../src/config.mjs'
import { openRepo } from '../src/repo.sqlite.mjs'

let pass = 0
const fails = []
const ok = (name, cond, extra) => {
  if (cond) pass++
  else fails.push(`FAIL: ${name} ${extra === undefined ? '' : JSON.stringify(extra)}`)
}
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)))

/* ---- a fake Paystack ---- */
const seen = { initialize: [], createPlan: [], disable: [], manage: [] }
const charges = new Map() // reference -> the transaction Paystack would report
let plans = []
const paystack = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    const j = (o, status = 200) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)))
    if (req.headers.authorization !== 'Bearer sk_test_secret') return j({ status: false, message: 'Invalid key' }, 401)
    const body = data ? JSON.parse(data) : {}
    if (req.method === 'POST' && req.url === '/transaction/initialize') {
      seen.initialize.push(body)
      return j({ status: true, data: { authorization_url: `https://checkout.paystack.test/${body.reference}`, access_code: 'ac', reference: body.reference } })
    }
    const verify = /^\/transaction\/verify\/(.+)$/.exec(req.url)
    if (req.method === 'GET' && verify) {
      const c = charges.get(decodeURIComponent(verify[1]))
      return c ? j({ status: true, data: c }) : j({ status: false, message: 'Transaction reference not found' }, 404)
    }
    if (req.method === 'GET' && req.url.startsWith('/plan')) return j({ status: true, data: plans })
    if (req.method === 'POST' && req.url === '/plan') {
      seen.createPlan.push(body)
      const p = { ...body, plan_code: `PLN_${plans.length + 1}` }
      plans.push(p)
      return j({ status: true, data: p })
    }
    if (req.method === 'POST' && req.url === '/subscription/disable') {
      seen.disable.push(body)
      return body.code === 'SUB_gone' ? j({ status: false, message: 'Subscription is already disabled' }, 400) : j({ status: true, message: 'Subscription disabled successfully' })
    }
    const manage = /^\/subscription\/([^/]+)\/manage\/link$/.exec(req.url)
    if (req.method === 'GET' && manage) {
      seen.manage.push(manage[1])
      return j({ status: true, data: { link: `https://paystack.test/manage/${manage[1]}` } })
    }
    j({ status: false, message: 'nope' }, 404)
  })
})
const paystackUrl = await listen(paystack)

const SECRET = 'sk_test_secret'
const env = { TOKEN_SECRET: 'test-secret', SIGNUPS_PER_HOUR: '500', APP_URL: 'https://morecode.test', PAYSTACK_SECRET_KEY: SECRET, PAYSTACK_BASE_URL: paystackUrl }
const config = loadConfig(env)
const repo = openRepo(':memory:')
const app = createApp({ config, repo, mail: { send: async () => undefined } })
const api = createServer(app)
const base = await listen(api)

const call = async (method, path, { body, token, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // not JSON (an HTML page)
  }
  return { status: res.status, json, text }
}
const sign = (raw) => createHmac('sha512', SECRET).update(raw).digest('hex')
const hook = (event, data, signature) => {
  const raw = JSON.stringify({ event, data })
  return fetch(base + '/v1/billing/paystack/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(signature === null ? {} : { 'x-paystack-signature': signature ?? sign(raw) }) }, body: raw })
}
let n = 0
const newUser = async () => {
  const email = `p${++n}@x.com`
  const su = await call('POST', '/v1/auth/signup', { body: { name: `Person ${n}`, email, password: 'password123' } })
  const v = await call('POST', '/v1/auth/verify', { body: { email, code: su.json.devCode } })
  return { email, token: v.json.token, id: v.json.account.id, customer: `CUS_${n}` }
}
const me = async (u) => (await call('GET', '/v1/me', { token: u.token })).json.account

/** What Paystack reports for a successful charge made through our checkout. */
const charge = (u, reference, { plan = 'pro', yearly = false, amount, currency = 'GHS', withMeta = true, planObj } = {}) => {
  const price = { pro: { monthly: 25000, yearly: 240000 }, max: { monthly: 125000, yearly: 1272000 } }[plan][yearly ? 'yearly' : 'monthly']
  return {
    id: 1000 + n,
    status: 'success',
    reference,
    amount: amount ?? price,
    currency,
    paid_at: new Date().toISOString(),
    metadata: withMeta ? { userId: u.id, plan, yearly } : '',
    customer: { customer_code: u.customer, email: u.email },
    authorization: { channel: 'card', brand: 'visa', card_type: 'visa ', last4: '4081', exp_month: '12', exp_year: '2030', authorization_code: 'AUTH_x' },
    plan: planObj ?? null
  }
}

try {
  /* ---- settings ---- */
  {
    const cfg = (await call('GET', '/v1/config')).json
    ok('config: paystack billing with currency and prices', cfg.billing === 'paystack' && cfg.currency === 'GHS' && cfg.prices.pro.monthly === 250 && cfg.prices.max.yearly === 1060, cfg)
    let threw = ''
    try {
      loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x', PAYSTACK_SECRET_KEY: 'sk' })
    } catch (e) {
      threw = e.message
    }
    ok('production without DATABASE_URL refuses to start', threw.includes('DATABASE_URL'), threw)
    threw = ''
    try {
      loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x', DATABASE_URL: 'postgres://x', BILLING_MODE: 'demo' })
    } catch (e) {
      threw = e.message
    }
    ok('demo billing is refused in production', threw.includes('demo'), threw)
    ok('production with a Paystack key defaults to paystack billing', loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x', DATABASE_URL: 'postgres://x', PAYSTACK_SECRET_KEY: 'sk' }).billing === 'paystack')
    ok('production without a key defaults to billing off, not demo', loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x', DATABASE_URL: 'postgres://x' }).billing === 'off')
  }

  /* ---- dates ---- */
  {
    const d = (s) => Date.parse(s)
    ok('31 Jan + 1 month stays in February', new Date(addPeriod(d('2027-01-31T10:00:00Z'), false)).toISOString() === '2027-02-28T10:00:00.000Z')
    ok('leap day + 1 year', new Date(addPeriod(d('2028-02-29T10:00:00Z'), true)).toISOString() === '2029-02-28T10:00:00.000Z')
    ok('normal month', new Date(addPeriod(d('2026-10-22T08:30:00Z'), false)).toISOString() === '2026-11-22T08:30:00.000Z')
  }

  /* ---- checkout ---- */
  const a = await newUser()
  {
    ok('checkout needs sign-in', (await call('POST', '/v1/billing/checkout', { body: { plan: 'pro' } })).status === 401)
    ok('checkout rejects free and unknown plans', (await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'free' } })).status === 400 && (await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'gold' } })).status === 400)
    const r = await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'pro', yearly: false } })
    const init = seen.initialize.at(-1)
    ok('checkout returns the Paystack page', r.status === 200 && r.json.url === `https://checkout.paystack.test/${r.json.reference}` && /^mc_/.test(r.json.reference), r.json)
    ok('checkout asks Paystack for the right amount, currency and email', init.amount === 25000 && init.currency === 'GHS' && init.email === a.email, init)
    ok('checkout creates the recurring plan once and uses it', seen.createPlan.length === 1 && seen.createPlan[0].name === 'morecode:pro:monthly:GHS:25000' && seen.createPlan[0].interval === 'monthly' && init.plan === 'PLN_1', seen.createPlan)
    ok('checkout remembers who and what in metadata, card only, and a return address', init.metadata.userId === a.id && init.metadata.plan === 'pro' && init.channels.join() === 'card' && init.callback_url === 'https://morecode.test/billing/return', init)
    await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'pro' } })
    ok('the same plan is not created twice', seen.createPlan.length === 1)
    await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'max', yearly: true } })
    const initY = seen.initialize.at(-1)
    ok('yearly charges twelve months at the yearly rate, as an annual plan', initY.amount === 1272000 && seen.createPlan.at(-1).interval === 'annually', initY)

    const patched = await call('PATCH', '/v1/me', { token: a.token, body: { plan: 'max', billing: { card: { brand: 'Visa', last4: '1111', exp: '01/30' }, invoices: [{ id: 'fake', amount: 1 }] } } })
    ok('the app cannot give itself a plan or an invoice', patched.status === 200 && patched.json.account.plan === 'free' && patched.json.account.billing.invoices.length === 0 && patched.json.account.billing.card === null, patched.json)
  }

  /* ---- paying: the app checks, then the webhook arrives ---- */
  let ref
  {
    ref = (await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'pro' } })).json.reference
    ok('before paying, status is pending', (await call('GET', `/v1/billing/status?reference=${ref}`, { token: a.token })).json.status === 'unknown')
    charges.set(ref, charge(a, ref))
    const st = await call('GET', `/v1/billing/status?reference=${ref}`, { token: a.token })
    const acc = st.json.account
    ok('a confirmed payment switches the plan on', st.json.status === 'success' && acc.plan === 'pro', st.json)
    ok('the plan renews a month after payment', Math.abs(acc.billing.renews - addPeriod(Date.now(), false)) < 60_000 && acc.billing.yearly === false, acc.billing)
    ok('the card kept is brand, last four and expiry only', JSON.stringify(acc.billing.card) === JSON.stringify({ brand: 'Visa', last4: '4081', exp: '12/30' }), acc.billing.card)
    ok('an invoice is written with the real amount', acc.billing.invoices.length === 1 && acc.billing.invoices[0].amount === 250 && acc.billing.invoices[0].currency === 'GHS' && acc.billing.invoices[0].description.startsWith('Pro plan'), acc.billing.invoices)
    ok('pro now allows a bigger model', (await call('PATCH', '/v1/me', { token: a.token, body: {} })).json.account.plan === 'pro')

    await call('GET', `/v1/billing/status?reference=${ref}`, { token: a.token })
    const raw = JSON.stringify({ event: 'charge.success', data: charges.get(ref) })
    const w = await fetch(base + '/v1/billing/paystack/webhook', { method: 'POST', headers: { 'x-paystack-signature': sign(raw) }, body: raw })
    const after = await me(a)
    ok('asking again, and the webhook for the same payment, change nothing', w.status === 200 && after.billing.invoices.length === 1 && after.billing.renews === acc.billing.renews, after.billing)
  }

  /* ---- webhook security ---- */
  {
    const evt = JSON.stringify({ event: 'charge.success', data: charge(a, 'mc_forged_1') })
    ok('webhook without a signature is refused', (await fetch(base + '/v1/billing/paystack/webhook', { method: 'POST', body: evt })).status === 401)
    ok('webhook with a wrong signature is refused', (await fetch(base + '/v1/billing/paystack/webhook', { method: 'POST', headers: { 'x-paystack-signature': createHmac('sha512', 'other').update(evt).digest('hex') }, body: evt })).status === 401)
    ok('webhook signed for a different body is refused', (await fetch(base + '/v1/billing/paystack/webhook', { method: 'POST', headers: { 'x-paystack-signature': sign('{}') }, body: evt })).status === 401)
    const b = await newUser()
    const forged = await hook('charge.success', charge(b, 'mc_forged_2'), 'abcd')
    ok('a forged payment does not give a plan', forged.status === 401 && (await me(b)).plan === 'free')
    ok('an unknown event is acknowledged', (await hook('transfer.success', {})).status === 200)
  }

  /* ---- things that must not switch a plan on ---- */
  {
    const b = await newUser()
    const r1 = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'max' } })).json.reference
    charges.set(r1, charge(b, r1, { plan: 'max', amount: 10000 }))
    const s1 = await call('GET', `/v1/billing/status?reference=${r1}`, { token: b.token })
    ok('paying less than the price does not give the plan', s1.json.status === 'rejected' && s1.json.account.plan === 'free', s1.json.status)
    const r2 = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'max' } })).json.reference
    charges.set(r2, charge(b, r2, { plan: 'max', currency: 'USD' }))
    ok('paying in another currency does not give the plan', (await call('GET', `/v1/billing/status?reference=${r2}`, { token: b.token })).json.account.plan === 'free')
    const r3 = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'max' } })).json.reference
    charges.set(r3, { ...charge(b, r3, { plan: 'max' }), status: 'failed' })
    const s3 = await call('GET', `/v1/billing/status?reference=${r3}`, { token: b.token })
    ok('a failed payment is reported and changes nothing', s3.json.status === 'failed' && s3.json.account.plan === 'free')
    // Paystack reports a payment the customer has not finished yet as "abandoned". The app polls while the
    // Paystack page is still open, so that must read as "keep waiting", not "failed" - and the same payment
    // must still go through once the customer completes it.
    const r4 = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'pro' } })).json.reference
    charges.set(r4, { ...charge(b, r4, { plan: 'pro' }), status: 'abandoned' })
    const s4 = await call('GET', `/v1/billing/status?reference=${r4}`, { token: b.token })
    ok('a payment still being made is pending, not failed', s4.json.status === 'pending' && s4.json.account.plan === 'free', s4.json.status)
    charges.set(r4, charge(b, r4, { plan: 'pro' }))
    const s5 = await call('GET', `/v1/billing/status?reference=${r4}`, { token: b.token })
    ok('the same payment switches the plan on once it is completed', s5.json.status === 'success' && s5.json.account.plan === 'pro', s5.json.status)
    ok('an unknown reference is just unknown', (await call('GET', '/v1/billing/status?reference=mc_doesnotexist', { token: b.token })).json.status === 'unknown')
    ok('a malformed reference is refused without calling Paystack', (await call('GET', '/v1/billing/status?reference=../../x', { token: b.token })).json.status === 'unknown')
    const c = await newUser()
    ok("someone else's payment is unknown to you", (await call('GET', `/v1/billing/status?reference=${ref}`, { token: c.token })).json.status === 'unknown' && (await me(c)).plan === 'free')
  }

  /* ---- subscription, renewal, card update ---- */
  {
    const before = await me(a)
    ok('before the subscription is set up, changing the card says wait', (await call('POST', '/v1/billing/portal', { token: a.token })).status === 409)
    await hook('subscription.create', { subscription_code: 'SUB_a1', email_token: 'tok_a1', customer: { customer_code: a.customer, email: a.email }, plan: { plan_code: 'PLN_1' }, status: 'active' })
    const portal = await call('POST', '/v1/billing/portal', { token: a.token })
    ok('the card page link comes from Paystack', portal.status === 200 && portal.json.url === 'https://paystack.test/manage/SUB_a1', portal.json)

    // a renewal: no metadata, the plan object says what it is
    const renewRef = 'ren_a_1'
    await hook('charge.success', charge(a, renewRef, { withMeta: false, planObj: { plan_code: 'PLN_1', name: 'morecode:pro:monthly:GHS:25000' } }))
    const after = await me(a)
    ok('a renewal extends the plan by another month', after.billing.renews === addPeriod(before.billing.renews, false) && after.billing.invoices.length === 2, after.billing)

    await hook('invoice.payment_failed', { subscription: { subscription_code: 'SUB_a1' }, customer: { customer_code: a.customer } })
    ok('a failed renewal is flagged but the plan stays', (await me(a)).billing.pastDue === true && (await me(a)).plan === 'pro')
    await hook('charge.success', charge(a, 'ren_a_2', { withMeta: false, planObj: { plan_code: 'PLN_1', name: 'morecode:pro:monthly:GHS:25000' } }))
    ok('the next good payment clears the flag', (await me(a)).billing.pastDue === false)

    // a renewal at an old price still pays what was agreed
    const old = charge(a, 'ren_a_3', { withMeta: false, amount: 20000, planObj: { plan_code: 'PLN_old', name: 'morecode:pro:monthly:GHS:20000' } })
    await hook('charge.success', old)
    ok('a renewal at the price the plan was bought at is accepted', (await me(a)).billing.invoices.length === 4)
    await hook('charge.success', charge(a, 'ren_a_4', { withMeta: false, amount: 5, planObj: { plan_code: 'PLN_1', name: 'morecode:pro:monthly:GHS:25000' } }))
    ok('a charge that does not match its plan is ignored', (await me(a)).billing.invoices.length === 4)
  }

  /* ---- changing plan ---- */
  {
    const ra = (await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'max' } })).json.reference
    charges.set(ra, charge(a, ra, { plan: 'max' }))
    const st = await call('GET', `/v1/billing/status?reference=${ra}`, { token: a.token })
    ok('paying for Max switches to Max at once', st.json.account.plan === 'max' && Math.abs(st.json.account.billing.renews - addPeriod(Date.now(), false)) < 60_000, st.json.account.billing)
    const disabledBefore = seen.disable.length
    await hook('subscription.create', { subscription_code: 'SUB_a2', email_token: 'tok_a2', customer: { customer_code: a.customer, email: a.email }, plan: { plan_code: 'PLN_3' }, status: 'active' })
    ok('the old Pro subscription is stopped so you are not charged twice', seen.disable.length === disabledBefore + 1 && seen.disable.at(-1).code === 'SUB_a1' && seen.disable.at(-1).token === 'tok_a1', seen.disable)
    await hook('subscription.not_renew', { subscription_code: 'SUB_a1', customer: { customer_code: a.customer } })
    ok('news about the old subscription does not cancel the new one', (await me(a)).billing.cancelling === false)
    const dup = (await call('POST', '/v1/billing/checkout', { token: a.token, body: { plan: 'max', yearly: false } }))
    ok('choosing the plan you already pay for is refused', dup.status === 409 && dup.json.error.code === 'already', dup.json)
  }

  /* ---- cancelling ---- */
  {
    const r = await call('POST', '/v1/billing/cancel', { token: a.token })
    ok('cancel stops the subscription at Paystack with its code and token', r.status === 200 && seen.disable.at(-1).code === 'SUB_a2' && seen.disable.at(-1).token === 'tok_a2', seen.disable.at(-1))
    ok('cancelling keeps the plan until the end of what was paid', r.json.account.plan === 'max' && r.json.account.billing.cancelling === true && r.json.account.billing.renews > Date.now())
    ok('someone on Free cannot cancel', (await call('POST', '/v1/billing/cancel', { token: (await newUser()).token })).status === 400)

    const b = await newUser()
    const rb = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'pro' } })).json.reference
    charges.set(rb, charge(b, rb))
    await call('GET', `/v1/billing/status?reference=${rb}`, { token: b.token })
    await hook('subscription.create', { subscription_code: 'SUB_gone', email_token: 'tok_gone', customer: { customer_code: b.customer, email: b.email } })
    const cb = await call('POST', '/v1/billing/cancel', { token: b.token })
    ok('cancelling something Paystack already stopped still works', cb.status === 200 && cb.json.account.billing.cancelling === true, cb.json)

    // cancelled before Paystack told us about the subscription
    const c = await newUser()
    const rc = (await call('POST', '/v1/billing/checkout', { token: c.token, body: { plan: 'pro' } })).json.reference
    charges.set(rc, charge(c, rc))
    await call('GET', `/v1/billing/status?reference=${rc}`, { token: c.token })
    const cc = await call('POST', '/v1/billing/cancel', { token: c.token })
    const disabledBefore = seen.disable.length
    await hook('subscription.create', { subscription_code: 'SUB_c1', email_token: 'tok_c1', customer: { customer_code: c.customer, email: c.email } })
    ok('a cancel that came first is applied once the subscription exists', cc.status === 200 && seen.disable.length === disabledBefore + 1 && seen.disable.at(-1).code === 'SUB_c1')

    // paying again after cancelling turns it back on
    const rc2 = (await call('POST', '/v1/billing/checkout', { token: c.token, body: { plan: 'pro' } })).json.reference
    charges.set(rc2, charge(c, rc2))
    const back = (await call('GET', `/v1/billing/status?reference=${rc2}`, { token: c.token })).json.account
    ok('paying again after cancelling resumes the plan', back.billing.cancelling === false && back.plan === 'pro')
  }

  /* ---- the end of a paid period ---- */
  {
    const dayAgo = Date.now() - 86_400_000
    const b = await newUser()
    const rb = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'pro' } })).json.reference
    charges.set(rb, charge(b, rb))
    await call('GET', `/v1/billing/status?reference=${rb}`, { token: b.token })

    let u = await repo.userById(b.id)
    u.planUntil = dayAgo
    await repo.saveUser(u)
    ok('a renewal that is a day late does not drop the plan (grace)', (await me(b)).plan === 'pro')

    u = await repo.userById(b.id)
    u.planUntil = Date.now() - GRACE - 60_000
    await repo.saveUser(u)
    const dropped = await me(b)
    ok('after the grace period the plan drops to Free; card and invoices stay', dropped.plan === 'free' && dropped.billing.renews === null && dropped.billing.invoices.length === 1 && dropped.billing.card?.last4 === '4081', dropped.billing)

    // cancelled: ends at once when the period is over
    const c = await newUser()
    const rc = (await call('POST', '/v1/billing/checkout', { token: c.token, body: { plan: 'pro' } })).json.reference
    charges.set(rc, charge(c, rc))
    await call('GET', `/v1/billing/status?reference=${rc}`, { token: c.token })
    await call('POST', '/v1/billing/cancel', { token: c.token })
    u = await repo.userById(c.id)
    u.planUntil = Date.now() - 60_000
    await repo.saveUser(u)
    ok('a cancelled plan ends when its period does', (await me(c)).plan === 'free')

    // the periodic sweep does the same without anyone signing in
    const d = await newUser()
    const rd = (await call('POST', '/v1/billing/checkout', { token: d.token, body: { plan: 'pro' } })).json.reference
    charges.set(rd, charge(d, rd))
    await call('GET', `/v1/billing/status?reference=${rd}`, { token: d.token })
    u = await repo.userById(d.id)
    u.planUntil = Date.now() - GRACE - 60_000
    await repo.saveUser(u)
    await app.sweep()
    ok('the sweep drops lapsed plans', (await repo.userById(d.id)).plan === 'free')
  }

  /* ---- the page Paystack sends the browser to ---- */
  {
    const b = await newUser()
    const rb = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'pro' } })).json.reference
    charges.set(rb, charge(b, rb))
    const page = await call('GET', `/billing/return?reference=${rb}`)
    ok('the return page confirms the payment and switches the plan on', page.status === 200 && page.text.includes('Payment received') && (await me(b)).plan === 'pro', page.text.slice(0, 200))
    ok('the return page copes with a reference it does not know', (await call('GET', '/billing/return?reference=mc_nothing_here')).text.includes('Still processing'))
  }

  /* ---- deleting an account ---- */
  {
    const b = await newUser()
    const rb = (await call('POST', '/v1/billing/checkout', { token: b.token, body: { plan: 'pro' } })).json.reference
    charges.set(rb, charge(b, rb))
    await call('GET', `/v1/billing/status?reference=${rb}`, { token: b.token })
    await hook('subscription.create', { subscription_code: 'SUB_del', email_token: 'tok_del', customer: { customer_code: b.customer, email: b.email } })
    const del = await call('DELETE', '/v1/me', { token: b.token, body: { confirm: true } })
    ok('deleting an account stops the charging', del.status === 200 && seen.disable.at(-1).code === 'SUB_del')
  }

  /* ---- other modes ---- */
  {
    const offRepo = openRepo(':memory:')
    const off = createApp({ config: loadConfig({ TOKEN_SECRET: 'x', BILLING_MODE: 'off', SIGNUPS_PER_HOUR: '50' }), repo: offRepo, mail: { send: async () => undefined } })
    const s = createServer(off)
    const url = await listen(s)
    const post = (path, body, token) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
    const su = await post('/v1/auth/signup', { name: 'Off', email: 'off@x.com', password: 'password123' })
    const v = await post('/v1/auth/verify', { email: 'off@x.com', code: su.json.devCode })
    ok('with billing off, checkout is refused', (await post('/v1/billing/checkout', { plan: 'pro' }, v.json.token)).status === 403)
    const wh = await post('/v1/billing/paystack/webhook', {})
    ok('with billing off, the webhook does not exist', wh.status === 404)
    s.close()
    offRepo.close()
  }
} finally {
  paystack.close()
  api.close()
  repo.close()
}

for (const f of fails) console.log(f)
console.log(`\n${pass} passed, ${fails.length} failed`)
process.exit(fails.length ? 1 : 0)
