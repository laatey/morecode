import { DEFAULT_LIGHT_THEME_ID, DEFAULT_THEME_ID, hasTheme } from './themes'

/** What the person chose in Settings → Appearance. Stored inside the app settings JSON. */
export interface ThemePrefs {
  /** The theme to use when not following the system. */
  theme: string
  /** Follow the operating system's light/dark setting instead. */
  themeAuto: boolean
  /** Themes used in automatic mode. */
  themeDark: string
  themeLight: string
}

export const DEFAULT_THEME_PREFS: ThemePrefs = {
  theme: DEFAULT_THEME_ID,
  themeAuto: false,
  themeDark: DEFAULT_THEME_ID,
  themeLight: DEFAULT_LIGHT_THEME_ID
}

/** Fix up saved values: a theme that no longer exists falls back rather than leaving the app unstyled. */
export function cleanThemePrefs(saved: Partial<ThemePrefs> | undefined): ThemePrefs {
  const d = DEFAULT_THEME_PREFS
  const ok = (v: unknown, fallback: string): string =>
    typeof v === 'string' && hasTheme(v) ? v : fallback
  return {
    theme: ok(saved?.theme, d.theme),
    themeAuto: saved?.themeAuto === true,
    themeDark: ok(saved?.themeDark, d.themeDark),
    themeLight: ok(saved?.themeLight, d.themeLight)
  }
}

/** The theme id these preferences resolve to, given whether the OS is currently dark. */
export function resolveThemeId(prefs: ThemePrefs, systemDark: boolean): string {
  if (!prefs.themeAuto) return prefs.theme
  return systemDark ? prefs.themeDark : prefs.themeLight
}
