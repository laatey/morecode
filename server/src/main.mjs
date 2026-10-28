import { createServer } from 'node:http'
import { createApp } from './app.mjs'
import { loadConfig } from './config.mjs'
import { createMailer } from './mail.mjs'
import { openDatabase } from './repo.mjs'

const config = loadConfig()
const repo = await openDatabase(config)
const app = createApp({ config, repo, mail: createMailer(config) })
const server = createServer(app)
const sweeper = setInterval(() => app.sweep().catch((e) => console.error('Sweep failed:', e.message)), 10 * 60_000)
sweeper.unref()
app.sweep().catch((e) => console.error('Sweep failed:', e.message))

server.listen(config.port, () => {
  console.log(`MoreCode server on :${config.port} (${config.production ? 'production' : 'development'}), database ${config.databaseUrl ? 'PostgreSQL' : config.dataFile}`)
  if (!config.databaseUrl) console.log('No DATABASE_URL: using a local SQLite file. That is fine for development; production needs PostgreSQL.')
  if (!config.anthropicKey) console.log('ANTHROPIC_API_KEY is not set: hosted AI is off (people can still use their own key).')
  if (config.mailMode === 'log') console.log(config.production ? 'WARNING: no RESEND_API_KEY or MAIL_WEBHOOK_URL, so sign-up codes are NOT being delivered.' : 'No mail service set: emails are printed here instead of being sent.')
  const social = Object.entries(config.oauth).filter(([, v]) => v).map(([k]) => k)
  console.log(`Social sign-in: ${social.length ? social.join(', ') : 'off'}`)
  console.log(`Billing: ${config.billing}${config.billing === 'paystack' ? ` (${config.paystack.currency}); set the webhook in Paystack to ${config.appUrl}/v1/billing/paystack/webhook` : config.billing === 'demo' ? ' (plans are free: development only)' : ' (plan changes refused)'}`)
})

const stop = () => {
  server.close(async () => {
    await repo.close()
    process.exit(0)
  })
  server.closeIdleConnections()
  // an AI answer still streaming must not keep the server from stopping when the host asks it to
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// a bug in one request must not leave the server half-working: log it and let the host restart a clean process
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
  process.exit(1)
})
