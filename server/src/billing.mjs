import { HttpError } from './http-error.mjs'
import { PaystackError, validSignature } from './paystack.mjs'
import { newId } from './security.mjs'

/**
 * Paying for a plan with Paystack.
 *
 *   app -> POST /v1/billing/checkout        we ask Paystack for a payment page and give its address to the app
 *   person pays on Paystack's page          (card, and mobile money if you allow it: see PAYSTACK_CHANNELS)
 *   Paystack -> POST /v1/billing/paystack/webhook   charge.success: the plan is switched on (also every renewal)
 *   app -> GET /v1/billing/status           the app checks, and we confirm with Paystack ourselves if the webhook is late
 *
 * A plan is only ever switched on from a payment Paystack itself confirms (a signed webhook or our own
 * verify call) for the right currency and the right amount. Every payment is recorded once by its
 * reference, so a repeated webhook or a double check changes nothing.
 */

const DAY = 86_400_000
/** Renewals can arrive a little late; a plan keeps working this long past its end before dropping to Free. */
export const GRACE = 3 * DAY
const PAID = ['pro', 'max']
const NAME = /^morecode:(pro|max):(monthly|yearly):([A-Z]{3}):(\d+)$/
const cap = (s) => s[0].toUpperCase() + s.slice(1)

/** One month or one year after `from`, staying on the same day (31 Jan + 1 month = 28/29 Feb, not 3 March). */
export function addPeriod(from, yearly) {
  const d = new Date(from)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  if (yearly) d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.getTime()
}

export function createBilling({ config, repo, paystack, log = console }) {
  const cfg = config.paystack
  const live = config.billing === 'paystack'
  const planCache = new Map()

  /** What a plan costs, in the currency's smallest unit. Yearly is charged once, as twelve months at the yearly rate. */
  const amountFor = (plan, yearly) => Math.round((yearly ? cfg.prices[plan].yearly * 12 : cfg.prices[plan].monthly) * 100)
  const planName = (plan, yearly) => `morecode:${plan}:${yearly ? 'yearly' : 'monthly'}:${cfg.currency}:${amountFor(plan, yearly)}`

  /** The Paystack plan (the recurring-charge definition) for a MoreCode plan; created on first use. */
  async function planCode(plan, yearly) {
    const key = `${plan}:${yearly ? 'yearly' : 'monthly'}`
    if (cfg.planCodes[key]) return cfg.planCodes[key]
    const name = planName(plan, yearly)
    if (planCache.has(name)) return planCache.get(name)
    const existing = (await paystack.listPlans())?.find?.((p) => p.name === name && !p.is_deleted)
    const code = existing?.plan_code ?? (await paystack.createPlan({ name, amount: amountFor(plan, yearly), interval: yearly ? 'annually' : 'monthly', currency: cfg.currency })).plan_code
    planCache.set(name, code)
    return code
  }

  /** Which MoreCode plan a Paystack plan object stands for. */
  function identify(p) {
    if (!p || typeof p !== 'object') return null
    for (const [key, code] of Object.entries(cfg.planCodes)) {
      if (code && code === p.plan_code) {
        const [plan, interval] = key.split(':')
        return { plan, yearly: interval === 'yearly', amount: amountFor(plan, interval === 'yearly'), currency: cfg.currency }
      }
    }
    const m = NAME.exec(String(p.name ?? ''))
    return m ? { plan: m[1], yearly: m[2] === 'yearly', amount: Number(m[4]), currency: m[3] } : null
  }

  const cardOf = (auth) =>
    auth && auth.channel === 'card' && auth.last4
      ? { brand: cap(String(auth.brand || auth.card_type || 'card').trim().split(/\s+/)[0]), last4: String(auth.last4).slice(-4), exp: `${String(auth.exp_month).padStart(2, '0')}/${String(auth.exp_year).slice(-2)}` }
      : null

  const findUser = async (data) => {
    const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
    return (
      (meta.userId && (await repo.userById(String(meta.userId)))) ||
      (data.customer?.customer_code && (await repo.userByCustomer(data.customer.customer_code))) ||
      (data.subscription_code && (await repo.userBySubscription(data.subscription_code))) ||
      (data.customer?.email && (await repo.userByEmail(String(data.customer.email).toLowerCase()))) ||
      null
    )
  }

  const bestEffort = async (what, fn) => {
    try {
      return await fn()
    } catch (e) {
      log.warn(`Paystack: could not ${what}: ${e.message}`)
      return null
    }
  }

  /* ---------- starting a payment ---------- */

  async function checkout(user, { plan, yearly }) {
    if (!live) throw new HttpError(403, 'billing-off', 'Payments are not available on this server.')
    if (!PAID.includes(plan)) throw new HttpError(400, 'invalid', 'Choose Pro or Max.')
    yearly = yearly === true
    const active = user.plan === plan && !user.cancelAtEnd && Boolean(user.billing?.yearly) === yearly
    if (active) throw new HttpError(409, 'already', `You are already on ${cap(plan)}.`)
    const reference = `mc_${newId(12)}`
    try {
      const data = await paystack.initialize({
        email: user.email,
        amount: amountFor(plan, yearly),
        currency: cfg.currency,
        reference,
        plan: await planCode(plan, yearly),
        channels: cfg.channels,
        callback_url: `${config.appUrl}/billing/return`,
        metadata: { userId: user.id, plan, yearly }
      })
      return { url: data.authorization_url, reference }
    } catch (e) {
      if (e instanceof PaystackError) throw new HttpError(502, 'payment-provider', 'Could not start the payment. Please try again in a moment.')
      throw e
    }
  }

  /* ---------- a payment arrived ---------- */

  /** Applies one successful charge (from a webhook or from verify). Safe to call twice with the same charge. */
  async function applyCharge(data) {
    // Only "failed" is final. Paystack calls a payment the customer has not finished yet "abandoned" (and it can
    // still be completed on the page that is open), so that must read as "keep waiting" - the app stops asking on "failed".
    if (!data || data.status !== 'success') return { status: data?.status === 'failed' ? 'failed' : 'pending' }
    const reject = (why) => {
      log.warn(`Paystack: ignored charge ${data.reference}: ${why}`)
      return { status: 'rejected' }
    }
    if (String(data.currency).toUpperCase() !== cfg.currency) return reject(`currency ${data.currency}`)
    const user = await findUser(data)
    if (!user) return reject('no matching account')

    const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
    const named = identify(data.plan)
    const which = named ?? (PAID.includes(meta.plan) ? { plan: meta.plan, yearly: meta.yearly === true, amount: amountFor(meta.plan, meta.yearly === true) } : null)
    if (!which) return reject('unknown plan')
    if (named?.currency && named.currency !== cfg.currency) return reject('plan currency')
    // a renewal pays what the plan said when it was bought, even if prices have changed since
    if (Number(data.amount) !== which.amount) return reject(`amount ${data.amount} is not ${which.amount}`)

    const paid = Date.parse(data.paid_at ?? '') || Date.now()
    const fresh = await repo.addPayment({ reference: String(data.reference), userId: user.id, plan: which.plan, yearly: which.yearly, amount: which.amount, currency: cfg.currency, paid, created: Date.now() })
    if (!fresh) return { status: 'success', userId: user.id, duplicate: true }

    const u = (await repo.userById(user.id)) ?? user
    // paying again for the plan you already have adds on to the end of it; a different plan starts now
    const start = u.plan === which.plan && u.planUntil && u.planUntil > paid ? u.planUntil : paid
    const card = cardOf(data.authorization)
    const stamp = new Date(paid).toISOString().slice(0, 7).replace('-', '')
    u.plan = which.plan
    u.planUntil = addPeriod(start, which.yearly)
    u.cancelAtEnd = false
    u.paystack = { ...u.paystack, customer: data.customer?.customer_code ?? u.paystack?.customer ?? null }
    u.billing = {
      ...u.billing,
      card: card ?? u.billing?.card ?? null,
      yearly: which.yearly,
      renews: u.planUntil,
      cancelling: false,
      pastDue: false,
      currency: cfg.currency,
      invoices: [
        { id: `INV-${stamp}-${String(data.reference).slice(-6).toUpperCase()}`, date: paid, description: `${cap(which.plan)} plan, ${which.yearly ? 'billed yearly' : 'billed monthly'}`, amount: which.amount / 100, currency: cfg.currency },
        ...(u.billing?.invoices ?? [])
      ].slice(0, 50)
    }
    await repo.saveUser(u)
    return { status: 'success', userId: u.id }
  }

  /** Make sure a payment made on Paystack's page is counted, asking Paystack ourselves rather than waiting for the webhook. */
  async function settle(reference) {
    if (!/^[\w.-]{6,100}$/.test(reference || '')) return { status: 'unknown' }
    const known = await repo.getPayment(reference)
    if (known) return { status: 'success', userId: known.userId }
    try {
      return await applyCharge(await paystack.verify(reference))
    } catch (e) {
      if (e instanceof PaystackError && e.status === 404) return { status: 'unknown' }
      throw e
    }
  }

  /* ---------- subscriptions ---------- */

  async function attachSubscription(data) {
    const user = await findUser({ customer: data.customer, subscription_code: data.subscription_code })
    if (!user) return log.warn(`Paystack: subscription ${data.subscription_code} has no matching account`)
    const old = user.paystack?.sub && user.paystack.sub !== data.subscription_code ? user.paystack : null
    user.paystack = { customer: data.customer?.customer_code ?? user.paystack?.customer ?? null, sub: data.subscription_code, token: data.email_token ?? null }
    await repo.saveUser(user)
    // changing plan starts a new subscription: stop the old one so you are not charged twice
    if (old?.token) await bestEffort('stop the old subscription', () => paystack.disableSubscription(old.sub, old.token))
    // cancelled before the subscription had finished being set up
    if (user.cancelAtEnd && user.paystack.token) await bestEffort('stop a cancelled subscription', () => paystack.disableSubscription(user.paystack.sub, user.paystack.token))
  }

  async function markEnding(data) {
    const user = await findUser({ subscription_code: data.subscription_code ?? data.code, customer: data.customer })
    if (!user || (user.paystack?.sub && data.subscription_code && user.paystack.sub !== data.subscription_code)) return // an older subscription we already replaced
    user.cancelAtEnd = true
    user.billing = { ...user.billing, cancelling: true }
    await repo.saveUser(user)
  }

  async function markPastDue(data) {
    const user = await findUser({ subscription_code: data.subscription?.subscription_code ?? data.subscription_code, customer: data.customer })
    if (!user) return
    user.billing = { ...user.billing, pastDue: true }
    await repo.saveUser(user)
  }

  /** The person's own subscription is stopped; they keep what they paid for until the end of the period. */
  async function cancel(user) {
    if (!live) throw new HttpError(403, 'billing-off', 'Plan changes are not available on this server.')
    if (!PAID.includes(user.plan)) throw new HttpError(400, 'invalid', 'You are already on Free.')
    if (user.paystack?.sub && user.paystack.token) {
      try {
        await paystack.disableSubscription(user.paystack.sub, user.paystack.token)
      } catch (e) {
        if (!(e instanceof PaystackError) || e.status >= 500) throw new HttpError(502, 'payment-provider', 'Could not cancel just now. Please try again in a moment.')
        // Paystack says it is already stopped: the result is the same
      }
    }
    user.cancelAtEnd = true
    user.billing = { ...user.billing, cancelling: true }
    await repo.saveUser(user)
    return user
  }

  async function updateCardLink(user) {
    if (!live) throw new HttpError(403, 'billing-off', 'Payments are not available on this server.')
    if (!user.paystack?.sub) throw new HttpError(409, 'pending', 'Your subscription is still being set up. Try again in a minute.')
    try {
      const data = await paystack.manageLink(user.paystack.sub)
      return { url: data.link }
    } catch (e) {
      if (e instanceof PaystackError) throw new HttpError(502, 'payment-provider', 'Could not open the card page. Please try again in a moment.')
      throw e
    }
  }

  /** Stops charging a person (used when their account is deleted). Never throws. */
  async function stopCharging(user) {
    if (live && user.paystack?.sub && user.paystack.token) await bestEffort('stop the subscription of a deleted account', () => paystack.disableSubscription(user.paystack.sub, user.paystack.token))
  }

  /* ---------- the end of a paid period ---------- */

  const lapsed = (u, now = Date.now()) => u.plan !== 'free' && u.planUntil != null && u.planUntil + (u.cancelAtEnd ? 0 : GRACE) < now

  /** Moves a person whose paid period is over back to Free (their card and invoices stay). */
  async function lapse(u) {
    const stillCharging = !u.cancelAtEnd && u.paystack?.sub && u.paystack.token
    u.plan = 'free'
    u.planUntil = null
    u.cancelAtEnd = false
    u.billing = { ...u.billing, renews: null, cancelling: false, pastDue: false }
    await repo.saveUser(u)
    if (stillCharging) await bestEffort('stop a lapsed subscription', () => paystack.disableSubscription(u.paystack.sub, u.paystack.token))
    return u
  }

  /** Called on every signed-in request, so a plan never outlives what was paid for even between sweeps. */
  async function refresh(u) {
    return lapsed(u) ? lapse(u) : u
  }

  async function sweep(now = Date.now()) {
    for (const u of await repo.usersWithEndedPlan(now, GRACE)) await lapse(u)
  }

  /* ---------- webhook ---------- */

  async function webhook(rawBody, signature) {
    if (!live) throw new HttpError(404, 'not-found', 'There is nothing at that address.')
    if (!validSignature(cfg.secret, rawBody, signature)) throw new HttpError(401, 'bad-signature', 'Signature not valid.')
    let evt
    try {
      evt = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new HttpError(400, 'invalid', 'Not valid JSON.')
    }
    const data = evt?.data ?? {}
    switch (evt?.event) {
      case 'charge.success':
        await applyCharge(data)
        break
      case 'subscription.create':
        await attachSubscription(data)
        break
      case 'subscription.disable':
      case 'subscription.not_renew':
        await markEnding(data)
        break
      case 'invoice.payment_failed':
        await markPastDue(data)
        break
      default:
        break // events we do not need are acknowledged and ignored
    }
    return { ok: true }
  }

  return {
    live,
    amountFor,
    checkout,
    settle,
    cancel,
    updateCardLink,
    stopCharging,
    refresh,
    sweep,
    webhook,
    applyCharge
  }
}
