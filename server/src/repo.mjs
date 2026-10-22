import { openPgRepo } from './repo.pg.mjs'
import { openRepo } from './repo.sqlite.mjs'

/**
 * Picks the database: PostgreSQL when DATABASE_URL is set (always the case in production), otherwise a local
 * SQLite file so development and the tests need nothing installed. Both offer the same methods.
 */
export async function openDatabase(config) {
  if (config.databaseUrl) return openPgRepo(config.databaseUrl, { ssl: config.databaseSsl })
  return openRepo(config.dataFile)
}

export { openPgRepo, openRepo }
