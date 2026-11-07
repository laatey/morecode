import { deriveTokens } from './derive'
import { MORECODE_DARK, MORECODE_LIGHT } from './morecode-themes'
import { VSCODE_THEMES } from './vscode-themes-generated'
import { isDarkKind, type AppTheme, type VSCodeThemeData } from './types'

export const DEFAULT_THEME_ID = 'morecode-dark'
export const DEFAULT_LIGHT_THEME_ID = 'morecode-light'

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface Entry {
  id: string
  label: string
  kind: AppTheme['kind']
  source: AppTheme['source']
  data: VSCodeThemeData
}

const ENTRIES: Entry[] = [
  ...[MORECODE_DARK, MORECODE_LIGHT].map((d) => ({
    id: slug(d.label),
    label: d.label,
    kind: d.type,
    source: 'morecode' as const,
    data: d
  })),
  ...VSCODE_THEMES.map((d) => ({
    id: `vscode-${slug(d.label)}`,
    label: d.label,
    kind: d.type,
    source: 'vscode' as const,
    data: d
  }))
]

const cache = new Map<string, AppTheme>()

/** Every theme, light/dark/high-contrast, cheap to list: tokens are derived only when a theme is first used. */
export const THEME_LIST: {
  id: string
  label: string
  kind: AppTheme['kind']
  source: AppTheme['source']
}[] = ENTRIES.map(({ id, label, kind, source }) => ({ id, label, kind, source }))

export const hasTheme = (id: string): boolean => ENTRIES.some((e) => e.id === id)

export function getTheme(id: string): AppTheme {
  const entry = ENTRIES.find((e) => e.id === id) ?? ENTRIES[0]
  let theme = cache.get(entry.id)
  if (!theme) {
    theme = {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      source: entry.source,
      tokens: deriveTokens(entry.data)
    }
    cache.set(entry.id, theme)
  }
  return theme
}

/** Raw theme data, for tests and tooling. */
export const themeData = (id: string): VSCodeThemeData | undefined =>
  ENTRIES.find((e) => e.id === id)?.data

export const themeIsDark = (id: string): boolean => isDarkKind(getTheme(id).kind)
