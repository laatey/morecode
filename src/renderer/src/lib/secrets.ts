/**
 * Secrets (API keys, sign-in sessions) live in the computer's encrypted store, kept by the main process, instead of
 * as plain text in this window's storage. They are loaded once before the app draws, so the rest of the app can keep
 * reading them without waiting. Where the computer offers no encrypted store (a browser preview, Linux without a
 * keyring) `secure` is false and callers keep using ordinary storage as they did before.
 */
/** Every secret the app keeps, by the name it is stored under. */
export const SECRET_NAMES = {
  sessions: 'morecode:sessions:v1',
  keys: 'morecode:keys:v1',
  openRouter: 'morecode:openrouter-key',
  gateway: 'morecode:gateway-key'
} as const

const cache = new Map<string, string>()
let secure = false

export const secrets = {
  get secure(): boolean {
    return secure
  },
  get: (name: string): string | null => cache.get(name) ?? null,
  set(name: string, value: string | null): void {
    if (!secure) return
    if (value === null) cache.delete(name)
    else cache.set(name, value)
    void window.api.secrets.set(name, value)
  }
}

/**
 * Load the named secrets. Any that are still sitting as plain text in this window's storage from an older version are
 * moved into the encrypted store and wiped from plain storage.
 */
export async function loadSecrets(
  names: string[],
  legacy: Record<string, string> = {}
): Promise<void> {
  try {
    secure = Boolean(await window.api?.secrets?.available())
    if (!secure) return
    for (const name of names) {
      const stored = await window.api.secrets.get(name)
      if (stored !== null) cache.set(name, stored)
      const old = legacy[name] && localStorage.getItem(legacy[name])
      if (old) {
        if (stored === null && (await window.api.secrets.set(name, old))) cache.set(name, old)
        if (cache.has(name)) localStorage.removeItem(legacy[name])
      }
    }
  } catch {
    secure = false // could not reach the store: carry on with ordinary storage rather than fail to start
  }
}
