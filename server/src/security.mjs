import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'

const scryptAsync = (pw, salt) =>
  new Promise((resolve, reject) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))))

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':')
  if (!salt || !key) return false
  const given = await scryptAsync(password, Buffer.from(salt, 'hex'))
  const want = Buffer.from(key, 'hex')
  return given.length === want.length && timingSafeEqual(given, want)
}

const b64 = (b) => Buffer.from(b).toString('base64url')

/** Signed token: payload.signature. The session id inside lets a sign-out cancel it. */
export function signToken(secret, claims, ttlMs) {
  const body = b64(JSON.stringify({ ...claims, exp: Date.now() + ttlMs }))
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

export function readToken(secret, token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const want = createHmac('sha256', secret).update(body).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return claims.exp > Date.now() ? claims : null
  } catch {
    return null
  }
}

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')
export const hashCode = (secret, email, code) => createHmac('sha256', secret).update(`${email}|${code}`).digest('hex')
export const newId = (n = 9) => randomBytes(n).toString('base64url')

/** Fixed-window counter in memory: enough to slow guessing without a database. */
export class RateLimiter {
  constructor() {
    this.hits = new Map()
  }
  /** Returns seconds to wait when over the limit, or 0 when allowed. */
  hit(key, max, windowMs) {
    const now = Date.now()
    const entry = this.hits.get(key)
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { n: 1, reset: now + windowMs })
      return 0
    }
    entry.n++
    return entry.n > max ? Math.ceil((entry.reset - now) / 1000) : 0
  }
  clear(key) {
    this.hits.delete(key)
  }
  sweep() {
    const now = Date.now()
    for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k)
  }
}
