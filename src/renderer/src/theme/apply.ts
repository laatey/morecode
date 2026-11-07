import { SETTINGS_KEY } from '../lib/storage-keys'
import { cleanThemePrefs, resolveThemeId, type ThemePrefs } from './prefs'
import { getTheme } from './themes'
import { isDarkKind, type AppTheme } from './types'

const STYLE_ID = 'morecode-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The operating system's current preference. */
export const systemPrefersDark = (): boolean => window.matchMedia(DARK_QUERY).matches

/**
 * Make `theme` the live theme: every token becomes a CSS custom property on :root (one replaceable <style>, so
 * switching is a single repaint), `color-scheme` follows its light/dark side so native controls match, and the
 * main process is told the frame colours for the title bar. `followSystem` keeps the native theme on the OS setting.
 */
export function applyTheme(theme: AppTheme, followSystem = false): void {
  const dark = isDarkKind(theme.kind)
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  const vars = Object.entries(theme.tokens)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')
  el.textContent = `:root{color-scheme:${dark ? 'dark' : 'light'};${vars}}`
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.dataset.theme = theme.id
  root.dataset.themeKind = theme.kind
  window.api?.app?.setTheme?.({
    background: theme.tokens.titlebar,
    symbol: theme.tokens['titlebar-symbol'],
    dark,
    system: followSystem
  })
}

/** Preferences saved by an earlier session, read directly so the first paint is already themed. */
export function readStoredThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return cleanThemePrefs(JSON.parse(raw) as Partial<ThemePrefs>)
  } catch {
    // unreadable storage: defaults
  }
  return cleanThemePrefs(undefined)
}

/** Call once before React renders so there is never a frame in the wrong colours. */
export function applyInitialTheme(): void {
  const prefs = readStoredThemePrefs()
  applyTheme(getTheme(resolveThemeId(prefs, systemPrefersDark())), prefs.themeAuto)
}
