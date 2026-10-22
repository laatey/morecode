import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * All data access lives here (SQLite). One file on disk, write-ahead logging for crash safety,
 * real tables and indexes, and transactions where two steps must happen together. The rest of the
 * server never writes SQL, so moving to Postgres later means rewriting only this file.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  onboarded INTEGER NOT NULL DEFAULT 0,
  tour_seen INTEGER NOT NULL DEFAULT 0,
  profile TEXT,
  project TEXT,
  recents TEXT NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL DEFAULT 'free',
  billing TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'password',
  paystack_customer TEXT,
  paystack_sub TEXT,
  paystack_token TEXT,
  plan_until INTEGER,
  cancel_at_end INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_paystack_customer ON users(paystack_customer);
CREATE INDEX IF NOT EXISTS users_paystack_sub ON users(paystack_sub);
CREATE TABLE IF NOT EXISTS payments (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  yearly INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  paid INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id, paid);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS runs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, run_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  exp INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  title TEXT NOT NULL,
  access TEXT NOT NULL,
  author TEXT NOT NULL,
  messages TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  UNIQUE (user_id, chat_id)
);
CREATE TABLE IF NOT EXISTS chats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS chats_changed ON chats(user_id, updated);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  client TEXT NOT NULL,
  exp INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tickets (
  client TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exp INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created INTEGER NOT NULL
);
`

const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v))
const parse = (v, fallback = null) => {
  if (v === null || v === undefined) return fallback
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

const toUser = (r) =>
  r ? {
    id: r.id,
    email: r.email,
    name: r.name,
    passHash: r.pass_hash,
    verified: !!r.verified,
    created: r.created,
    onboarded: !!r.onboarded,
    tourSeen: !!r.tour_seen,
    profile: parse(r.profile),
    project: parse(r.project),
    recents: parse(r.recents, []),
    plan: r.plan,
    billing: parse(r.billing, { card: null, yearly: false, renews: null, invoices: [] }),
    provider: r.provider,
    paystack: { customer: r.paystack_customer ?? null, sub: r.paystack_sub ?? null, token: r.paystack_token ?? null },
    planUntil: r.plan_until ?? null,
    cancelAtEnd: !!r.cancel_at_end
  } : null

export function openRepo(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  // databases created before payments existed get the new columns
  const have = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name))
  for (const [col, ddl] of [['paystack_customer', 'TEXT'], ['paystack_sub', 'TEXT'], ['paystack_token', 'TEXT'], ['plan_until', 'INTEGER'], ['cancel_at_end', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (!have.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${ddl}`)
  }

  const q = (sql) => db.prepare(sql)
  const st = {
    userById: q('SELECT * FROM users WHERE id = ?'),
    userByEmail: q('SELECT * FROM users WHERE email = ?'),
    insertUser: q('INSERT INTO users (id,email,name,pass_hash,verified,created,onboarded,tour_seen,profile,project,recents,plan,billing,provider,paystack_customer,paystack_sub,paystack_token,plan_until,cancel_at_end) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    updateUser: q('UPDATE users SET email=?,name=?,pass_hash=?,verified=?,onboarded=?,tour_seen=?,profile=?,project=?,recents=?,plan=?,billing=?,provider=?,paystack_customer=?,paystack_sub=?,paystack_token=?,plan_until=?,cancel_at_end=? WHERE id=?'),
    userByCustomer: q('SELECT * FROM users WHERE paystack_customer = ?'),
    userBySub: q('SELECT * FROM users WHERE paystack_sub = ?'),
    planEnded: q("SELECT * FROM users WHERE plan <> 'free' AND plan_until IS NOT NULL AND plan_until + CASE WHEN cancel_at_end = 1 THEN 0 ELSE ? END < ?"),
    paymentAdd: q('INSERT OR IGNORE INTO payments (reference,user_id,plan,yearly,amount,currency,paid,created) VALUES (?,?,?,?,?,?,?,?)'),
    paymentGet: q('SELECT * FROM payments WHERE reference = ?'),
    deleteUser: q('DELETE FROM users WHERE id = ?'),
    usageDays: q('SELECT day, count FROM usage WHERE user_id = ? ORDER BY day DESC LIMIT 30'),
    usageDay: q('SELECT count FROM usage WHERE user_id = ? AND day = ?'),
    bumpUsage: q('INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1'),
    runSeen: q('SELECT 1 FROM runs WHERE user_id = ? AND run_id = ?'),
    runAdd: q('INSERT OR IGNORE INTO runs (user_id, run_id, ts) VALUES (?, ?, ?)'),
    runsPrune: q('DELETE FROM runs WHERE ts < ?'),
    sessionAdd: q('INSERT INTO sessions (id,user_id,created,agent) VALUES (?,?,?,?)'),
    sessionGet: q('SELECT * FROM sessions WHERE id = ?'),
    sessionDel: q('DELETE FROM sessions WHERE id = ?'),
    sessionsDelUser: q('DELETE FROM sessions WHERE user_id = ?'),
    codePut: q('INSERT INTO codes (email,hash,exp,tries,purpose) VALUES (?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET hash=excluded.hash, exp=excluded.exp, tries=0, purpose=excluded.purpose'),
    codeGet: q('SELECT * FROM codes WHERE email = ?'),
    codeTry: q('UPDATE codes SET tries = tries + 1 WHERE email = ?'),
    codeDel: q('DELETE FROM codes WHERE email = ?'),
    shareByToken: q('SELECT * FROM shares WHERE token = ?'),
    shareByChat: q('SELECT * FROM shares WHERE user_id = ? AND chat_id = ?'),
    shareUpsert: q('INSERT INTO shares (token,user_id,chat_id,title,access,author,messages,created,updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id, chat_id) DO UPDATE SET title=excluded.title, access=excluded.access, author=excluded.author, messages=excluded.messages, updated=excluded.updated'),
    shareDel: q('DELETE FROM shares WHERE token = ? AND user_id = ?'),
    chatsSince: q('SELECT id, data, updated, deleted FROM chats WHERE user_id = ? AND updated > ? ORDER BY updated LIMIT 500'),
    chatGet: q('SELECT updated FROM chats WHERE user_id = ? AND id = ?'),
    chatPut: q('INSERT INTO chats (user_id,id,data,updated,deleted) VALUES (?,?,?,?,0) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data, updated=excluded.updated, deleted=0'),
    chatTomb: q("INSERT INTO chats (user_id,id,data,updated,deleted) VALUES (?,?,'{}',?,1) ON CONFLICT(user_id,id) DO UPDATE SET data='{}', updated=excluded.updated, deleted=1"),
    stateAdd: q('INSERT INTO oauth_states (state,provider,client,exp) VALUES (?,?,?,?)'),
    stateTake: q('DELETE FROM oauth_states WHERE state = ? RETURNING provider, client, exp'),
    ticketPut: q('INSERT OR REPLACE INTO oauth_tickets (client,user_id,exp) VALUES (?,?,?)'),
    ticketTake: q('DELETE FROM oauth_tickets WHERE client = ? RETURNING user_id, exp'),
    sweepOauth: q('DELETE FROM oauth_states WHERE exp < ?'),
    sweepTickets: q('DELETE FROM oauth_tickets WHERE exp < ?'),
    sweepCodes: q('DELETE FROM codes WHERE exp < ?'),
    feedbackAdd: q('INSERT INTO feedback (id,user_id,kind,message,details,created) VALUES (?,?,?,?,?,?)')
  }

  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  const row = (s) => ({
    token: s.token,
    userId: s.user_id,
    chatId: s.chat_id,
    title: s.title,
    access: s.access,
    author: s.author,
    messages: parse(s.messages, []),
    created: s.created,
    updated: s.updated
  })

  return {
    close: () => db.close(),
    ping: () => !!db.prepare('SELECT 1 AS ok').get(),
    tx,

    userById: (id) => toUser(st.userById.get(id)),
    userByEmail: (email) => toUser(st.userByEmail.get(email)),
    insertUser: (u) =>
      st.insertUser.run(u.id, u.email, u.name, u.passHash ?? null, u.verified ? 1 : 0, u.created, u.onboarded ? 1 : 0, u.tourSeen ? 1 : 0, json(u.profile), json(u.project), json(u.recents ?? []), u.plan, json(u.billing), u.provider ?? 'password', u.paystack?.customer ?? null, u.paystack?.sub ?? null, u.paystack?.token ?? null, u.planUntil ?? null, u.cancelAtEnd ? 1 : 0),
    saveUser: (u) =>
      st.updateUser.run(u.email, u.name, u.passHash ?? null, u.verified ? 1 : 0, u.onboarded ? 1 : 0, u.tourSeen ? 1 : 0, json(u.profile), json(u.project), json(u.recents ?? []), u.plan, json(u.billing), u.provider ?? 'password', u.paystack?.customer ?? null, u.paystack?.sub ?? null, u.paystack?.token ?? null, u.planUntil ?? null, u.cancelAtEnd ? 1 : 0, u.id),
    userByCustomer: (c) => toUser(st.userByCustomer.get(c)),
    userBySubscription: (c) => toUser(st.userBySub.get(c)),
    /** Paid plans whose period is over (cancelled ones at once, others after a grace period for late renewals). */
    usersWithEndedPlan: (now, graceMs) => st.planEnded.all(graceMs, now).map(toUser),
    /** Records a payment once. Returns false when this reference was already recorded (so a repeat does nothing). */
    addPayment: (p) => st.paymentAdd.run(p.reference, p.userId, p.plan, p.yearly ? 1 : 0, p.amount, p.currency, p.paid, p.created).changes === 1,
    getPayment: (reference) => {
      const r = st.paymentGet.get(reference)
      return r ? { reference: r.reference, userId: r.user_id, plan: r.plan, yearly: !!r.yearly, amount: r.amount, currency: r.currency, paid: r.paid } : null
    },
    deleteUser: (id) => st.deleteUser.run(id), // sessions, usage, shares, chats and tickets go with it

    usageMap: (userId) => Object.fromEntries(st.usageDays.all(userId).map((r) => [r.day, r.count])),
    usageToday: (userId, day) => st.usageDay.get(userId, day)?.count ?? 0,

    /**
     * Counts one message unless today's limit is already reached (decided and written together, so
     * two requests at once cannot both slip through). A run already counted is let through free.
     */
    admitMessage(userId, day, limit, runId, now = Date.now()) {
      return tx(() => {
        st.runsPrune.run(now - 6 * 3_600_000)
        if (runId && st.runSeen.get(userId, runId)) return { ok: true, used: st.usageDay.get(userId, day)?.count ?? 0 }
        const used = st.usageDay.get(userId, day)?.count ?? 0
        if (used >= limit) return { ok: false, used }
        st.bumpUsage.run(userId, day)
        if (runId) st.runAdd.run(userId, runId, now)
        return { ok: true, used: used + 1 }
      })
    },

    addSession: (s) => st.sessionAdd.run(s.id, s.userId, s.created, s.agent ?? ''),
    getSession: (id) => {
      const r = st.sessionGet.get(id)
      return r ? { id: r.id, userId: r.user_id, created: r.created } : null
    },
    deleteSession: (id) => st.sessionDel.run(id),
    deleteUserSessions: (userId) => st.sessionsDelUser.run(userId),

    putCode: (email, hash, exp, purpose) => st.codePut.run(email, hash, exp, purpose),
    getCode: (email) => st.codeGet.get(email) ?? null,
    bumpCodeTries: (email) => st.codeTry.run(email),
    deleteCode: (email) => st.codeDel.run(email),

    shareByToken: (t) => {
      const r = st.shareByToken.get(t)
      return r ? row(r) : null
    },
    shareByChat: (userId, chatId) => {
      const r = st.shareByChat.get(userId, chatId)
      return r ? row(r) : null
    },
    upsertShare: (s) => st.shareUpsert.run(s.token, s.userId, s.chatId, s.title, s.access, s.author, JSON.stringify(s.messages), s.created, s.updated),
    deleteShare: (token, userId) => st.shareDel.run(token, userId),

    chatsSince: (userId, since) => st.chatsSince.all(userId, since).map((r) => ({ id: r.id, updated: r.updated, deleted: !!r.deleted, data: parse(r.data, {}) })),
    putChat(userId, id, data, updated) {
      // the newer edit wins, so two devices cannot overwrite each other with stale copies
      const have = st.chatGet.get(userId, id)
      if (have && have.updated > updated) return false
      st.chatPut.run(userId, id, JSON.stringify(data), updated)
      return true
    },
    tombstoneChat: (userId, id, updated) => st.chatTomb.run(userId, id, updated),

    addOauthState: (state, provider, client, exp) => st.stateAdd.run(state, provider, client, exp),
    takeOauthState: (state) => st.stateTake.get(state) ?? null,
    putTicket: (client, userId, exp) => st.ticketPut.run(client, userId, exp),
    takeTicket: (client) => st.ticketTake.get(client) ?? null,

    addFeedback: (f) => st.feedbackAdd.run(f.id, f.userId ?? null, f.kind, f.message, f.details ?? null, f.created),

    sweep(now = Date.now()) {
      st.sweepOauth.run(now)
      st.sweepTickets.run(now)
      st.sweepCodes.run(now)
    }
  }
}
