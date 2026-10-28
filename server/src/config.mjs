import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const proxyHops = (v) => {
  const n = Number(v || 0)
  if (!Number.isInteger(n) || n < 0 || n > 5) throw new Error('TRUST_PROXY_HOPS must be a whole number from 0 to 5')
  return n
}

/** All settings come from environment variables, so nothing secret is ever in the code. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const dataFile = env.DATABASE_FILE || './data/morecode.db'
  const databaseUrl = env.DATABASE_URL || ''
  if (production && !databaseUrl) throw new Error('DATABASE_URL (a PostgreSQL connection string) must be set when NODE_ENV=production')
  const paystackKey = env.PAYSTACK_SECRET_KEY || ''
  const currency = (env.PAYSTACK_CURRENCY || 'GHS').toUpperCase()
  // Price per month in whole currency units. Replace these placeholders with your real prices.
  const price = (name, fallback) => {
    const n = Number(env[name] ?? fallback)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`)
    return n
  }
  const prices = {
    pro: { monthly: price('PRICE_PRO_MONTHLY', 250), yearly: price('PRICE_PRO_YEARLY', 200) },
    max: { monthly: price('PRICE_MAX_MONTHLY', 1250), yearly: price('PRICE_MAX_YEARLY', 1060) }
  }
  // paystack = real payments; demo = plan changes apply with no payment (development only); off = plan changes refused
  const wanted = env.BILLING_MODE
  const billing = wanted === 'off' ? 'off' : wanted === 'demo' ? 'demo' : paystackKey ? 'paystack' : production ? 'off' : 'demo'
  if (billing === 'demo' && production) throw new Error('BILLING_MODE=demo gives every plan away free: it is not allowed when NODE_ENV=production')
  if (billing === 'paystack' && !paystackKey) throw new Error('BILLING_MODE=paystack needs PAYSTACK_SECRET_KEY')

  // a signing secret that survives restarts; set JWT_SECRET yourself in production
  let secret = env.TOKEN_SECRET
  if (!secret) {
    if (production) throw new Error('TOKEN_SECRET must be set when NODE_ENV=production')
    const f = dataFile + '.secret'
    mkdirSync(dirname(f), { recursive: true })
    if (existsSync(f)) secret = readFileSync(f, 'utf8')
    else writeFileSync(f, (secret = randomBytes(32).toString('hex')), { mode: 0o600 })
  }

  return {
    production,
    port: Number(env.PORT || 8787),
    /** New accounts allowed per hour from one address. */
    signupsPerHour: Number(env.SIGNUPS_PER_HOUR || 10),
    /**
     * How many reverse proxies (a load balancer, Cloudflare, a platform router) sit in front of this server.
     * With 0 the connection's own address is the person's; with 1 or more it is read from X-Forwarded-For, counted
     * from the end so a header the person sent themselves cannot be used to dodge the rate limits.
     */
    trustProxyHops: proxyHops(env.TRUST_PROXY_HOPS),
    dataFile,
    /** PostgreSQL connection string. Without it the server uses a local SQLite file (development and tests only). */
    databaseUrl,
    /** DATABASE_SSL=true for hosted databases that insist on an encrypted connection. */
    databaseSsl: env.DATABASE_SSL === 'true',
    secret,
    /** The key used for people who do not bring their own. Without it, hosted AI is switched off. */
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicBase: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    appUrl: (env.APP_URL || `http://localhost:${env.PORT || 8787}`).replace(/\/$/, ''),
    /** resend = Resend's API; webhook = POST to your own mail function; log = print (development only). */
    mailMode: env.RESEND_API_KEY ? 'resend' : env.MAIL_WEBHOOK_URL ? 'webhook' : 'log',
    resendKey: env.RESEND_API_KEY || '',
    resendBase: env.RESEND_BASE_URL || 'https://api.resend.com',
    mailWebhook: env.MAIL_WEBHOOK_URL || '',
    mailFrom: env.MAIL_FROM || 'MoreCode <no-reply@morecode.app>',
    /** Sign in with Google / GitHub. Each is on only when its id and secret are set. */
    oauth: {
      google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', apiUrl: env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo' }
        : null,
      github: env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET, authUrl: env.GITHUB_AUTH_URL || 'https://github.com/login/oauth/authorize', tokenUrl: env.GITHUB_TOKEN_URL || 'https://github.com/login/oauth/access_token', apiUrl: env.GITHUB_API_URL || 'https://api.github.com' }
        : null
    },
    /** A JSON file {latest, notes[], url} describing the newest app release. */
    releasesFile: env.RELEASES_FILE || '',
    billing,
    paystack: {
      secret: paystackKey,
      base: (env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, ''),
      currency,
      prices,
      /** card only by default: a card can be charged again every month. Add mobile_money etc. only if you accept that it may not renew by itself. */
      channels: (env.PAYSTACK_CHANNELS || 'card').split(',').map((c) => c.trim()).filter(Boolean),
      /** Optional: use plans you created in the Paystack dashboard (PLN_...). Otherwise they are created on first use. */
      planCodes: {
        'pro:monthly': env.PAYSTACK_PLAN_PRO_MONTHLY || '',
        'pro:yearly': env.PAYSTACK_PLAN_PRO_YEARLY || '',
        'max:monthly': env.PAYSTACK_PLAN_MAX_MONTHLY || '',
        'max:yearly': env.PAYSTACK_PLAN_MAX_YEARLY || ''
      }
    },
    // The desktop app reaches this server from its main process, which has no CORS rules, so no web origin needs access.
    // Development allows any origin for convenience; production allows only what ALLOWED_ORIGINS lists.
    origins: (env.ALLOWED_ORIGINS || (production ? '' : '*')).split(',').map((s) => s.trim()).filter(Boolean)
  }
}

export const PLANS = {
  free: { daily: 25, models: ['claude-haiku-5-5'] },
  pro: { daily: 400, models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] },
  max: { daily: 2000, models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] }
}
