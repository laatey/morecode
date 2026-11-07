import { useEffect, useSyncExternalStore } from 'react'
import { applyTheme, systemPrefersDark } from './apply'
import { resolveThemeId, type ThemePrefs } from './prefs'
import { getTheme } from './themes'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * Keeps the window in the theme the preferences resolve to, following the OS light/dark setting in automatic
 * mode. Returns the id of the theme in effect.
 */
export function useApplyTheme(prefs: ThemePrefs): string {
  const systemDark = useSyncExternalStore(subscribe, systemPrefersDark, () => true)
  const id = resolveThemeId(prefs, systemDark)
  useEffect(() => applyTheme(getTheme(id), prefs.themeAuto), [id, prefs.themeAuto])
  return id
}
