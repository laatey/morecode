/**
 * PostgreSQL data access: the production database. It offers exactly the same methods as
 * repo.sqlite.mjs (which is what development and the quick tests use), so nothing else in the server
 * knows which one it is talking to. Timestamps are milliseconds in BIGINT columns, structured values are
 * JSONB, and anything that must happen together (counting a message against the daily limit) runs in a
 * transaction that is serialised per person, so a burst of requests cannot overshoot a plan's limit.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created BIGINT NOT NULL,
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  tour_seen BOOLEAN NOT NULL DEFAULT FALSE,
  profile JSONB,
  project JSONB,
  recents JSONB NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL DEFAULT 'free',
  billing JSONB NOT NULL,
  provider TEXT NOT NULL DEFAULT 'password',
  paystack_customer TEXT,
  paystack_sub TEXT,
  paystack_token TEXT,
  plan_until BIGINT,
  cancel_at_end BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS users_paystack_customer ON users(paystack_customer);
CREATE INDEX IF NOT EXISTS users_paystack_sub ON users(paystack_sub);
CREATE TABLE IF NOT EXISTS payments (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  yearly BOOLEAN NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  paid BIGINT NOT NULL,
  created BIGINT NOT NULL
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
  ts BIGINT NOT NULL,
  PRIMARY KEY (user_id, run_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created BIGINT NOT NULL,
  agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  exp BIGINT NOT NULL,
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
  messages JSONB NOT NULL,
  created BIGINT NOT NULL,
  updated BIGINT NOT NULL,
  UNIQUE (user_id, chat_id)
);
CREATE TABLE IF NOT EXISTS chats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated BIGINT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS chats_changed ON chats(user_id, updated);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  client TEXT NOT NULL,
  exp BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tickets (
  client TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exp BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created BIGINT NOT NULL
);
`

const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v))

const toUser = (r) =>
  !r ? null : {
    id: r.id,
    email: r.email,
    name: r.name,
    passHash: r.pass_hash,
    verified: r.verified,
    created: r.created,
    onboarded: r.onboarded,
    tourSeen: r.tour_seen,
    profile: r.profile ?? null,
    project: r.project ?? null,
    recents: r.recents ?? [],
    plan: r.plan,
    billing: r.billing ?? { card: null, yearly: false, renews: null, invoices: [] },
    provider: r.provider,
    paystack: { customer: r.paystack_customer ?? null, sub: r.paystack_sub ?? null, token: r.paystack_token ?? null },
    planUntil: r.plan_until ?? null,
    cancelAtEnd: r.cancel_at_end
  }

const toShare = (s) =>
  !s ? null : {
    token: s.token,
    userId: s.user_id,
    chatId: s.chat_id,
    title: s.title,
    access: s.access,
    author: s.author,
    messages: s.messages ?? [],
    created: s.created,
    updated: s.updated
  }

/**
 * @param {string} url  postgres://user:pass@host:5432/dbname
 * @param {{ ssl?: boolean, max?: number }} [opts]  ssl: require an encrypted connection (most hosted databases do)
 */
export async function openPgRepo(url, opts = {}) {
  // loaded only when PostgreSQL is actually used, so development with SQLite needs no install
  const { default: pg } = await import('pg')
  // BIGINT comes back as a string by default; every number we store (milliseconds, cents) is far below 2^53
  pg.types.setTypeParser(20, (v) => Number(v))
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 10, ssl: opts.ssl ? { rejectUnauthorized: false } : undefined })
  pool.on('error', (e) => console.error('Database connection error:', e.message))

  // several servers starting together must not race to create tables
  const boot = await pool.connect()
  try {
    await boot.query('SELECT pg_advisory_lock(727274)')
    await boot.query(SCHEMA)
  } finally {
    await boot.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined)
    boot.release()
  }

  const one = async (sql, params) => (await pool.query(sql, params)).rows[0] ?? null
  const run = (sql, params) => pool.query(sql, params)

  const tx = async (fn) => {
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      const out = await fn(c)
      await c.query('COMMIT')
      return out
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      c.release()
    }
  }

  const USER_COLS = 'id,email,name,pass_hash,verified,created,onboarded,tour_seen,profile,project,recents,plan,billing,provider,paystack_customer,paystack_sub,paystack_token,plan_until,cancel_at_end'
  const userParams = (u) => [u.id, u.email, u.name, u.passHash ?? null, !!u.verified, u.created, !!u.onboarded, !!u.tourSeen, json(u.profile), json(u.project), json(u.recents ?? []), u.plan, json(u.billing), u.provider ?? 'password', u.paystack?.customer ?? null, u.paystack?.sub ?? null, u.paystack?.token ?? null, u.planUntil ?? null, !!u.cancelAtEnd]

  return {
    close: () => pool.end(),
    ping: async () => !!(await one('SELECT 1 AS ok')),

    userById: async (id) => toUser(await one('SELECT * FROM users WHERE id = $1', [id])),
    userByEmail: async (email) => toUser(await one('SELECT * FROM users WHERE email = $1', [email])),
    userByCustomer: async (c) => toUser(await one('SELECT * FROM users WHERE paystack_customer = $1', [c])),
    userBySubscription: async (c) => toUser(await one('SELECT * FROM users WHERE paystack_sub = $1', [c])),
    insertUser: async (u) => {
      await run(
        `INSERT INTO users (${USER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)`,
        userParams(u)
      )
    },
    saveUser: async (u) => {
      const p = userParams(u)
      await run(
        'UPDATE users SET email=$2,name=$3,pass_hash=$4,verified=$5,created=$6,onboarded=$7,tour_seen=$8,profile=$9::jsonb,project=$10::jsonb,recents=$11::jsonb,plan=$12,billing=$13::jsonb,provider=$14,paystack_customer=$15,paystack_sub=$16,paystack_token=$17,plan_until=$18,cancel_at_end=$19 WHERE id=$1',
        p
      )
    },
    deleteUser: async (id) => {
      await run('DELETE FROM users WHERE id = $1', [id]) // sessions, usage, shares, chats, payments and tickets go with it
    },
    /** Paid plans whose period is over (cancelled ones at once, others after a grace period for late renewals). */
    usersWithEndedPlan: async (now, graceMs) =>
      (await run("SELECT * FROM users WHERE plan <> 'free' AND plan_until IS NOT NULL AND plan_until + CASE WHEN cancel_at_end THEN 0 ELSE $2::bigint END < $1::bigint", [now, graceMs])).rows.map(toUser),

    /** Records a payment once. Returns false when this reference was already recorded (so a repeat does nothing). */
    addPayment: async (p) =>
      (await run('INSERT INTO payments (reference,user_id,plan,yearly,amount,currency,paid,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (reference) DO NOTHING', [p.reference, p.userId, p.plan, !!p.yearly, p.amount, p.currency, p.paid, p.created])).rowCount === 1,
    getPayment: async (reference) => {
      const r = await one('SELECT * FROM payments WHERE reference = $1', [reference])
      return r ? { reference: r.reference, userId: r.user_id, plan: r.plan, yearly: r.yearly, amount: r.amount, currency: r.currency, paid: r.paid } : null
    },

    usageMap: async (userId) => Object.fromEntries((await run('SELECT day, count FROM usage WHERE user_id = $1 ORDER BY day DESC LIMIT 30', [userId])).rows.map((r) => [r.day, r.count])),
    usageToday: async (userId, day) => (await one('SELECT count FROM usage WHERE user_id = $1 AND day = $2', [userId, day]))?.count ?? 0,

    /**
     * Counts one message unless today's limit is already reached. The decision and the write happen in one
     * transaction that is serialised per person, so two requests at once cannot both slip through.
     * A run already counted is let through free.
     */
    admitMessage: (userId, day, limit, runId, now = Date.now()) =>
      tx(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId])
        const used = async () => (await c.query('SELECT count FROM usage WHERE user_id = $1 AND day = $2', [userId, day])).rows[0]?.count ?? 0
        if (runId && (await c.query('SELECT 1 FROM runs WHERE user_id = $1 AND run_id = $2 AND ts >= $3', [userId, runId, now - 6 * 3_600_000])).rowCount) {
          return { ok: true, used: await used() }
        }
        const u = await used()
        if (u >= limit) return { ok: false, used: u }
        await c.query('INSERT INTO usage (user_id, day, count) VALUES ($1, $2, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = usage.count + 1', [userId, day])
        if (runId) await c.query('INSERT INTO runs (user_id, run_id, ts) VALUES ($1, $2, $3) ON CONFLICT (user_id, run_id) DO UPDATE SET ts = EXCLUDED.ts', [userId, runId, now])
        return { ok: true, used: u + 1 }
      }),

    addSession: async (s) => {
      await run('INSERT INTO sessions (id,user_id,created,agent) VALUES ($1,$2,$3,$4)', [s.id, s.userId, s.created, s.agent ?? ''])
    },
    getSession: async (id) => {
      const r = await one('SELECT * FROM sessions WHERE id = $1', [id])
      return r ? { id: r.id, userId: r.user_id, created: r.created } : null
    },
    deleteSession: async (id) => {
      await run('DELETE FROM sessions WHERE id = $1', [id])
    },
    deleteUserSessions: async (userId) => {
      await run('DELETE FROM sessions WHERE user_id = $1', [userId])
    },

    putCode: async (email, hash, exp, purpose) => {
      await run('INSERT INTO codes (email,hash,exp,tries,purpose) VALUES ($1,$2,$3,0,$4) ON CONFLICT (email) DO UPDATE SET hash = EXCLUDED.hash, exp = EXCLUDED.exp, tries = 0, purpose = EXCLUDED.purpose', [email, hash, exp, purpose])
    },
    getCode: async (email) => one('SELECT * FROM codes WHERE email = $1', [email]),
    bumpCodeTries: async (email) => {
      await run('UPDATE codes SET tries = tries + 1 WHERE email = $1', [email])
    },
    deleteCode: async (email) => {
      await run('DELETE FROM codes WHERE email = $1', [email])
    },

    shareByToken: async (t) => toShare(await one('SELECT * FROM shares WHERE token = $1', [t])),
    shareByChat: async (userId, chatId) => toShare(await one('SELECT * FROM shares WHERE user_id = $1 AND chat_id = $2', [userId, chatId])),
    upsertShare: async (s) => {
      await run(
        'INSERT INTO shares (token,user_id,chat_id,title,access,author,messages,created,updated) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT (user_id, chat_id) DO UPDATE SET title = EXCLUDED.title, access = EXCLUDED.access, author = EXCLUDED.author, messages = EXCLUDED.messages, updated = EXCLUDED.updated',
        [s.token, s.userId, s.chatId, s.title, s.access, s.author, JSON.stringify(s.messages), s.created, s.updated]
      )
    },
    deleteShare: async (token, userId) => {
      await run('DELETE FROM shares WHERE token = $1 AND user_id = $2', [token, userId])
    },

    chatsSince: async (userId, since) =>
      (await run('SELECT id, data, updated, deleted FROM chats WHERE user_id = $1 AND updated > $2 ORDER BY updated LIMIT 500', [userId, since])).rows.map((r) => ({ id: r.id, updated: r.updated, deleted: r.deleted, data: r.data ?? {} })),
    /** The newer edit wins, so two devices cannot overwrite each other with stale copies. */
    putChat: async (userId, id, data, updated) =>
      (await run('INSERT INTO chats (user_id,id,data,updated,deleted) VALUES ($1,$2,$3::jsonb,$4,FALSE) ON CONFLICT (user_id,id) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated, deleted = FALSE WHERE chats.updated <= EXCLUDED.updated', [userId, id, JSON.stringify(data), updated])).rowCount === 1,
    tombstoneChat: async (userId, id, updated) => {
      await run("INSERT INTO chats (user_id,id,data,updated,deleted) VALUES ($1,$2,'{}'::jsonb,$3,TRUE) ON CONFLICT (user_id,id) DO UPDATE SET data = '{}'::jsonb, updated = EXCLUDED.updated, deleted = TRUE", [userId, id, updated])
    },

    addOauthState: async (state, provider, client, exp) => {
      await run('INSERT INTO oauth_states (state,provider,client,exp) VALUES ($1,$2,$3,$4)', [state, provider, client, exp])
    },
    takeOauthState: async (state) => (await run('DELETE FROM oauth_states WHERE state = $1 RETURNING provider, client, exp', [state])).rows[0] ?? null,
    putTicket: async (client, userId, exp) => {
      await run('INSERT INTO oauth_tickets (client,user_id,exp) VALUES ($1,$2,$3) ON CONFLICT (client) DO UPDATE SET user_id = EXCLUDED.user_id, exp = EXCLUDED.exp', [client, userId, exp])
    },
    takeTicket: async (client) => (await run('DELETE FROM oauth_tickets WHERE client = $1 RETURNING user_id, exp', [client])).rows[0] ?? null,

    addFeedback: async (f) => {
      await run('INSERT INTO feedback (id,user_id,kind,message,details,created) VALUES ($1,$2,$3,$4,$5,$6)', [f.id, f.userId ?? null, f.kind, f.message, f.details ?? null, f.created])
    },

    async sweep(now = Date.now()) {
      await run('DELETE FROM oauth_states WHERE exp < $1', [now])
      await run('DELETE FROM oauth_tickets WHERE exp < $1', [now])
      await run('DELETE FROM codes WHERE exp < $1', [now])
      await run('DELETE FROM runs WHERE ts < $1', [now - 6 * 3_600_000])
    }
  }
}
