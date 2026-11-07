/** Light/dark family of a theme, as VS Code names them. The two `hc` kinds are the high-contrast themes. */
export type ThemeKind = 'dark' | 'light' | 'hcDark' | 'hcLight'

export const isDarkKind = (kind: ThemeKind): boolean => kind === 'dark' || kind === 'hcDark'
export const isHighContrast = (kind: ThemeKind): boolean => kind === 'hcDark' || kind === 'hcLight'

/** One syntax rule from a VS Code theme: the TextMate scopes it applies to and the colour it sets. */
export interface TokenRule {
  scope: string[]
  color: string
}

/** A VS Code colour theme reduced to what MoreCode reads (see vscode-keys.ts), with `include` already resolved. */
export interface VSCodeThemeData {
  id: string
  label: string
  type: ThemeKind
  colors: Record<string, string>
  tokens: TokenRule[]
}

/**
 * Every CSS custom property a theme sets, name (without the leading `--`) to value. The names are the
 * design tokens the whole interface is written in; see tokens.ts for the full list.
 */
export type TokenMap = Record<string, string>

/** A theme the picker can offer, ready to apply. */
export interface AppTheme {
  id: string
  label: string
  kind: ThemeKind
  /** Where it comes from, shown as a small caption in the picker. */
  source: 'morecode' | 'vscode'
  tokens: TokenMap
}
