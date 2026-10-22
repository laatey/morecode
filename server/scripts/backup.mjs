import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * A copy of the database you can restore from.
 *   PostgreSQL (production): needs `pg_dump` installed -> ./backups/morecode-<time>.dump   (restore: pg_restore -d <url> <file>)
 *   SQLite (development):    node scripts/backup.mjs [from] [to]
 */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

if (process.env.DATABASE_URL) {
  const to = process.argv[2] || `./backups/morecode-${stamp}.dump`
  mkdirSync(dirname(to), { recursive: true })
  const r = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', to, process.env.DATABASE_URL], { stdio: 'inherit' })
  if (r.error) {
    console.error('Could not run pg_dump. Install the PostgreSQL client tools, or run it inside the database container:\n  docker compose exec db pg_dump -U morecode -Fc morecode > backups/morecode.dump')
    process.exit(1)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(`Backed up the database to ${to}`)
} else {
  const { DatabaseSync } = await import('node:sqlite')
  const from = process.argv[2] || process.env.DATABASE_FILE || './data/morecode.db'
  const to = process.argv[3] || `./backups/morecode-${stamp}.db`
  mkdirSync(dirname(to), { recursive: true })
  const db = new DatabaseSync(from)
  db.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`)
  db.close()
  console.log(`Backed up ${from} to ${to}`)
}
