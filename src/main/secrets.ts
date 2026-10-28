import { app, ipcMain, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Keeps the app's secrets (your API keys and sign-in sessions) encrypted with the computer's own login protection
 * (Windows DPAPI, the macOS Keychain, or the Linux keyring) instead of as plain text in the app's browser storage.
 * Only encrypted text is written to disk. The renderer can read and write secrets by name, nothing else.
 */
const file = (): string => join(app.getPath('userData'), 'secrets.json')
const NAME = /^morecode:[a-z0-9:._-]{1,60}$/
const MAX = 1_000_000

/** On Linux without a keyring Electron falls back to a fixed key, which is not protection at all. */
const available = (): boolean => {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    const backend = safeStorage.getSelectedStorageBackend?.()
    if (backend === 'basic_text' || backend === 'unknown') return false
  }
  return true
}

function readAll(): Record<string, string> {
  try {
    return existsSync(file())
      ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>)
      : {}
  } catch {
    return {} // unreadable: treated as empty, and the next write starts a clean file
  }
}

function writeAll(all: Record<string, string>): void {
  mkdirSync(dirname(file()), { recursive: true })
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 })
  renameSync(tmp, file()) // a crash mid-write cannot leave half a file
}

export function registerSecretsIpc(): void {
  ipcMain.handle('secrets:available', (): boolean => available())

  ipcMain.handle('secrets:get', (_e, name: unknown): string | null => {
    if (typeof name !== 'string' || !NAME.test(name) || !available()) return null
    const stored = readAll()[name]
    if (!stored) return null
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return null // encrypted for another login on this computer: unreadable here
    }
  })

  ipcMain.handle('secrets:set', (_e, name: unknown, value: unknown): boolean => {
    if (typeof name !== 'string' || !NAME.test(name) || !available()) return false
    if (value !== null && (typeof value !== 'string' || value.length > MAX)) return false
    const all = readAll()
    if (value === null) delete all[name]
    else all[name] = safeStorage.encryptString(value).toString('base64')
    try {
      writeAll(all)
      return true
    } catch {
      return false
    }
  })
}
