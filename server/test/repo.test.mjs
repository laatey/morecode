import { openPgRepo } from '../src/repo.pg.mjs'
import { openRepo } from '../src/repo.sqlite.mjs'

/**
 * The same checks for both databases, so they cannot drift apart.
 *
 *   npm test                                                        SQLite only
 *   TEST_DATABASE_URL=postgres://user:pass@localhost/morecode_test npm test     also PostgreSQL
 *
 * Use an empty throwaway database for the second form: the test creates the tables and wipes the rows it adds.
 */

let pass = 0
const fails = []
const ok = (name, cond, extra) => {
  if (cond) pass++
  else fails.push(`FAIL: ${name} ${extra === undefined ? '' : JSON.stringify(extra)}`)
}

const user = (id, email, over = {}) => ({
  id,
  email,
  name: 'Test',
  passHash: 'h',
  verified: true,
  created: 1_000,
  onboarded: false,
  tourSeen: false,
  profile: { goals: ['app'], experience: 'some' },
  project: { name: 'p', path: '/p' },
  recents: [{ name: 'p', path: '/p' }],
  plan: 'free',
  billing: { card: null, yearly: false, renews: null, invoices: [] },
  provider: 'password',
  paystack: { customer: null, sub: null, token: null },
  planUntil: null,
  cancelAtEnd: false,
  ...over
})

async function suite(label, repo) {
  const t = (name, cond, extra) => ok(`[${label}] ${name}`, cond, extra)
  const tag = Math.random().toString(36).slice(2, 8)
  const id = `u_${tag}`
  const email = `${tag}@x.test`

  t('ping', (await repo.ping()) === true)

  /* users */
  await repo.insertUser(user(id, email))
  let u = await repo.userByEmail(email)
  t('user round-trips', u.id === id && u.verified === true && u.onboarded === false && u.profile.goals[0] === 'app' && u.project.path === '/p' && u.recents.length === 1 && u.billing.invoices.length === 0 && u.paystack.sub === null && u.planUntil === null && u.cancelAtEnd === false, u)
  t('missing user is null', (await repo.userById('nope')) === null && (await repo.userByEmail('nope@x')) === null)
  u.name = 'Renamed'
  u.plan = 'pro'
  u.planUntil = 1_800_000_000_000
  u.cancelAtEnd = true
  u.paystack = { customer: `CUS_${tag}`, sub: `SUB_${tag}`, token: 'tok' }
  u.billing = { card: { brand: 'Visa', last4: '4081', exp: '12/30' }, yearly: true, renews: u.planUntil, invoices: [{ id: 'i', date: 1, description: 'd', amount: 250.5, currency: 'GHS' }] }
  await repo.saveUser(u)
  u = await repo.userById(id)
  t('user saves (numbers stay numbers, booleans stay booleans)', u.name === 'Renamed' && u.plan === 'pro' && u.planUntil === 1_800_000_000_000 && typeof u.planUntil === 'number' && u.cancelAtEnd === true && u.billing.invoices[0].amount === 250.5 && u.billing.card.last4 === '4081', u)
  t('found by Paystack customer and subscription', (await repo.userByCustomer(`CUS_${tag}`))?.id === id && (await repo.userBySubscription(`SUB_${tag}`))?.id === id && (await repo.userBySubscription('SUB_nope')) === null)
  const ended = await repo.usersWithEndedPlan(1_800_000_000_001, 3 * 86_400_000)
  t('a cancelled plan that has ended is listed at once', ended.some((x) => x.id === id))
  u.cancelAtEnd = false
  await repo.saveUser(u)
  t('an uncancelled plan is not listed within its grace period', !(await repo.usersWithEndedPlan(1_800_000_000_001, 3 * 86_400_000)).some((x) => x.id === id))
  t('but is listed after it', (await repo.usersWithEndedPlan(1_800_000_000_000 + 4 * 86_400_000, 3 * 86_400_000)).some((x) => x.id === id))

  /* payments are recorded once */
  const pay = { reference: `ref_${tag}`, userId: id, plan: 'pro', yearly: false, amount: 25000, currency: 'GHS', paid: 5, created: 6 }
  t('a payment is recorded once', (await repo.addPayment(pay)) === true && (await repo.addPayment(pay)) === false)
  t('a payment can be read back', (await repo.getPayment(pay.reference))?.amount === 25000 && (await repo.getPayment('ref_none')) === null)

  /* usage and the daily limit */
  const day = '2026-10-22'
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => repo.admitMessage(id, day, 25, `run_${tag}_${i}`)))
  t('30 messages at once against a limit of 25 admit exactly 25', results.filter((r) => r.ok).length === 25 && (await repo.usageToday(id, day)) === 25, results.filter((r) => r.ok).length)
  t('a run already counted passes free, even at the limit', (await repo.admitMessage(id, day, 25, `run_${tag}_3`)).ok === true && (await repo.usageToday(id, day)) === 25)
  t('usage map', (await repo.usageMap(id))[day] === 25)

  /* sessions, codes */
  await repo.addSession({ id: `s_${tag}`, userId: id, created: 1, agent: 'x' })
  t('session', (await repo.getSession(`s_${tag}`))?.userId === id)
  await repo.deleteUserSessions(id)
  t('sessions deleted', (await repo.getSession(`s_${tag}`)) === null)
  await repo.putCode(email, 'hash', Date.now() + 1000, 'verify')
  await repo.bumpCodeTries(email)
  const code = await repo.getCode(email)
  t('code with tries and a numeric expiry', code.tries === 1 && code.purpose === 'verify' && typeof code.exp === 'number', code)
  await repo.putCode(email, 'hash2', Date.now() + 1000, 'reset')
  t('a new code resets the tries', (await repo.getCode(email)).tries === 0 && (await repo.getCode(email)).hash === 'hash2')
  await repo.deleteCode(email)
  t('code deleted', (await repo.getCode(email)) === undefined || (await repo.getCode(email)) === null)

  /* shares */
  const share = { token: `tok_${tag}`, userId: id, chatId: 'c1', title: 'T', access: 'view', author: 'A', messages: [{ role: 'user', text: 'hi' }], created: 1, updated: 2 }
  await repo.upsertShare(share)
  await repo.upsertShare({ ...share, token: 'ignored', title: 'T2', updated: 3 })
  const sh = await repo.shareByChat(id, 'c1')
  t('share upsert keeps the first token', sh.token === share.token && sh.title === 'T2' && sh.messages[0].text === 'hi', sh)
  t('share by token', (await repo.shareByToken(share.token))?.chatId === 'c1')
  await repo.deleteShare(share.token, id)
  t('share deleted', (await repo.shareByToken(share.token)) === null)

  /* chats: the newer edit wins */
  t('chat saved', (await repo.putChat(id, 'k1', { a: 1 }, 100)) === true)
  t('an older copy is refused', (await repo.putChat(id, 'k1', { a: 0 }, 50)) === false)
  t('a newer copy is applied', (await repo.putChat(id, 'k1', { a: 2 }, 200)) === true)
  let chats = await repo.chatsSince(id, 0)
  t('chat content', chats.length === 1 && chats[0].data.a === 2 && chats[0].updated === 200 && chats[0].deleted === false, chats)
  await repo.tombstoneChat(id, 'k1', 300)
  chats = await repo.chatsSince(id, 250)
  t('deleted chat becomes a tombstone', chats.length === 1 && chats[0].deleted === true, chats)
  t('nothing newer than the last change', (await repo.chatsSince(id, 300)).length === 0)

  /* oauth */
  await repo.addOauthState(`st_${tag}`, 'google', 'client', Date.now() + 1000)
  const st = await repo.takeOauthState(`st_${tag}`)
  t('oauth state is single use', st.provider === 'google' && (await repo.takeOauthState(`st_${tag}`)) === null)
  await repo.putTicket(`cl_${tag}`, id, Date.now() + 1000)
  const tk = await repo.takeTicket(`cl_${tag}`)
  t('oauth ticket is single use', tk.user_id === id && (await repo.takeTicket(`cl_${tag}`)) === null)

  /* feedback, sweep */
  await repo.addFeedback({ id: `f_${tag}`, userId: id, kind: 'bug', message: 'm', details: '{}', created: 1 })
  await repo.addFeedback({ id: `g_${tag}`, kind: 'idea', message: 'anonymous', created: 2 })
  await repo.putCode('old@x.test', 'h', 1, 'verify')
  await repo.sweep(Date.now())
  t('sweep removes expired codes', !(await repo.getCode('old@x.test')))

  /* deleting a person removes everything of theirs */
  await repo.deleteUser(id)
  t('user and their data are gone', (await repo.userById(id)) === null && (await repo.getPayment(pay.reference)) === null && (await repo.chatsSince(id, 0)).length === 0 && (await repo.usageToday(id, day)) === 0)
}

const sqlite = openRepo(':memory:')
await suite('sqlite', sqlite)
sqlite.close()

if (process.env.TEST_DATABASE_URL) {
  const pg = await openPgRepo(process.env.TEST_DATABASE_URL, { ssl: process.env.TEST_DATABASE_SSL === 'true' })
  try {
    await suite('postgres', pg)
  } finally {
    await pg.close()
  }
} else {
  console.log('(PostgreSQL checks skipped: set TEST_DATABASE_URL to a throwaway database to run them)')
}

for (const f of fails) console.log(f)
console.log(`\n${pass} passed, ${fails.length} failed`)
process.exit(fails.length ? 1 : 0)
