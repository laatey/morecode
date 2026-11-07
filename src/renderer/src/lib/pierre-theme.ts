import { registerCustomCSSVariableTheme } from '@pierre/diffs'

/**
 * Pierre/Shiki theme whose token colours are CSS variables (`--diffs-token-*`, set from the app's `--syn-*`
 * tokens in styles.css). Highlighting therefore never depends on which colour theme is active.
 */
export const PIERRE_THEME = 'morecode'

registerCustomCSSVariableTheme(PIERRE_THEME, {})
