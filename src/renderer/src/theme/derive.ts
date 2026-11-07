/**
 * VS Code theme → MoreCode design tokens.
 *
 * VS Code themes are large, inconsistent bags of colours: Dark+ sets nine, Dark 2026 sets ninety, High Contrast
 * sets four and lets VS Code fill the rest. MoreCode needs ~100 tokens. For every token the rule is the same:
 *
 *   1. the colour the theme sets itself (so each theme keeps its personality), else
 *   2. VS Code's own built-in default for that kind of theme (so sparse themes look as they do in VS Code), else
 *   3. a value mixed from the theme's background and text colour (so surfaces always step visibly).
 *
 * Then legibility is enforced: text-like tokens are nudged (as little as possible, keeping their hue) until they
 * reach a WCAG contrast floor on the theme's background. Themes that are deliberately low-contrast, such as
 * Solarized, are lifted just to the floor, never beyond it.
 */
import {
  BLACK,
  WHITE,
  chroma,
  contrast,
  ensureContrast,
  flatten,
  lightness,
  mix,
  parse,
  readableOn,
  toHex,
  withAlpha,
  type Rgba
} from './color'
import { ANSI_NAMES } from './vscode-keys'
import { vscodeDefault } from './vscode-defaults'
import {
  isDarkKind,
  isHighContrast,
  type TokenMap,
  type TokenRule,
  type VSCodeThemeData
} from './types'

/** Contrast floors (WCAG 2): body text, large/secondary UI, and decorative or disabled elements. */
export const FLOOR = { text: 4.5, ui: 3, faint: 3 } as const

/** Minimum OKLab lightness distance between the text colour and the muted text colour. */
const TIER_GAP = 0.07
/** Fraction of its normal contrast that text keeps when it sits on a selection. */
export const SELECTION_KEEPS = 0.85
/** Below this chroma a colour is a grey, not a hue, and cannot stand in for red, green, amber or blue. */
const MIN_CHROMA = 0.06
/** A primary fill may be a little quieter than a status colour, but must still read as a hue. */
const MIN_PRIMARY_CHROMA = 0.05

/** Shortest hex the browser and Electron both understand: opaque colours stay `#rrggbb`. */
const hex = (c: Rgba): string => toHex(c)

// --- TextMate scope matching ---------------------------------------------------------------------------

/**
 * The colour a theme gives a scope: among rules whose selector is the scope or a dotted prefix of it, the most
 * specific wins, and a later rule beats an earlier one of equal specificity (the TextMate rule VS Code follows).
 * Rules that only apply inside a parent scope ("source.css meta.property-name") are ignored on purpose.
 */
export function scopeColor(rules: TokenRule[], scope: string): string | null {
  let found: string | null = null
  let specificity = -1
  for (const rule of rules) {
    for (const selector of rule.scope) {
      if (/\s/.test(selector.trim())) continue
      if (scope === selector || scope.startsWith(selector + '.')) {
        if (selector.length >= specificity) {
          found = rule.color
          specificity = selector.length
        }
      }
    }
  }
  return found
}

/** First scope in the list the theme colours. */
const firstScope = (rules: TokenRule[], scopes: string[]): string | null => {
  for (const s of scopes) {
    const c = scopeColor(rules, s)
    if (c) return c
  }
  return null
}

// --- derivation ----------------------------------------------------------------------------------------

export function deriveTokens(theme: VSCodeThemeData): TokenMap {
  const kind = theme.type
  const dark = isDarkKind(kind)
  const hc = isHighContrast(kind)

  const explicit = (key: string): Rgba | null => parse(theme.colors[key])
  const builtin = (key: string): Rgba | null => parse(vscodeDefault(kind, key))
  const get = (key: string): Rgba | null => explicit(key) ?? builtin(key)

  /** The first key the theme sets itself; failing that, the first key VS Code has a default for. */
  const pick = (keys: string[]): Rgba | null => {
    for (const k of keys) {
      const c = explicit(k)
      if (c) return c
    }
    for (const k of keys) {
      const c = builtin(k)
      if (c) return c
    }
    return null
  }

  // Surfaces ----------------------------------------------------------------------------------------------
  const background = flatten(get('editor.background') ?? (dark ? parse('#1e1e1e')! : WHITE), BLACK)
  const on = (c: Rgba | null): Rgba | null => (c ? flatten(c, background) : null)

  // Text. `foreground` is VS Code's UI text; many themes only set `editor.foreground`, which is what they meant.
  const foreground = ensureContrast(
    on(explicit('foreground') ?? explicit('editor.foreground') ?? get('foreground'))!,
    background,
    FLOOR.text
  )

  const toward = (amount: number): Rgba => mix(background, foreground, amount)
  const shade = (amount: number): Rgba => mix(background, BLACK, amount)

  const card = hc ? background : dark ? shade(0.1) : toward(0.025)
  const inset = hc ? background : dark ? shade(0.28) : shade(0.05)
  const muted = toward(hc ? 0.1 : 0.045)
  const secondary = toward(hc ? 0.14 : 0.085)
  const accent = toward(hc ? 0.2 : 0.13)

  // Borders. High-contrast themes exist to draw lines, so their border is the theme's contrast border.
  const visible = (c: Rgba | null, min: number): Rgba | null => {
    const flat = on(c)
    return flat && contrast(flat, background) >= min ? flat : null
  }
  const border = hc
    ? (on(pick(['contrastBorder'])) ?? foreground)
    : (visible(pick(['panel.border', 'editorGroup.border', 'widget.border']), 1.12) ?? toward(0.14))
  const borderStrong = hc
    ? (on(pick(['contrastActiveBorder', 'contrastBorder'])) ?? foreground)
    : mix(border, foreground, 0.4)
  const inputBorder =
    visible(pick(['input.border', 'dropdown.border']), hc ? 1.5 : 1.25) ?? borderStrong

  // Text tiers: foreground > soft > muted > faint.
  // Some themes set the description colour equal to the text colour, which would flatten the hierarchy the whole
  // interface relies on; a description that is not visibly softer than the text is replaced by a mix.
  const softer = flatten(withAlpha(foreground, 0.7), background) // VS Code's own default: the text colour at 70%
  let described = on(explicit('descriptionForeground') ?? get('descriptionForeground')) ?? softer
  if (Math.abs(lightness(described) - lightness(foreground)) < TIER_GAP) described = softer
  const mutedForeground = ensureContrast(described, background, FLOOR.text)
  const softForeground = ensureContrast(
    mix(foreground, mutedForeground, 0.4),
    background,
    FLOOR.text
  )
  const faintForeground = ensureContrast(
    mix(mutedForeground, background, 0.42),
    background,
    FLOOR.faint
  )

  // Accent colours ----------------------------------------------------------------------------------------
  // Primary is a fill (buttons, switches), so it must show against the page; High Contrast buttons are plain
  // black boxes with an outline, so those themes fall through to their focus colour.
  const fill = (keys: string[], min: number): Rgba => {
    for (const k of keys) {
      const c = on(explicit(k))
      if (c && contrast(c, background) >= min) return c
    }
    for (const k of keys) {
      const c = on(builtin(k))
      if (c && contrast(c, background) >= min) return c
    }
    return ensureContrast(on(pick(keys)) ?? foreground, background, min)
  }
  // A primary has to read as a colour (not a grey) and carry white button text; dark-on-pale primaries are only
  // kept where the theme is high contrast, whose own buttons are deliberately like that.
  const PRIMARY_KEYS = ['button.background', 'focusBorder', 'textLink.foreground', 'badge.background']
  const PRIMARY_EXTRA = ['terminal.ansiBlue', 'charts.blue']
  const primaryOk = (c: Rgba): boolean =>
    contrast(c, background) >= 2.2 &&
    chroma(c) >= MIN_PRIMARY_CHROMA &&
    (hc || contrast(WHITE, c) >= FLOOR.text)
  /** Darken a hued candidate (keeping its hue) until white text reads on it, if the page still shows it. */
  const deepen = (c: Rgba): Rgba | null => {
    if (chroma(c) < MIN_PRIMARY_CHROMA) return null
    for (let amount = 0; amount <= 0.7; amount += 0.05) {
      const d = mix(c, BLACK, amount)
      if (primaryOk(d)) return d
    }
    return null
  }
  const primary = ((): Rgba => {
    const keys = [...PRIMARY_KEYS, ...PRIMARY_EXTRA]
    // The theme's own colours first (as they are, then deepened), VS Code's generic defaults only after that.
    for (const source of [explicit, builtin]) {
      for (const k of keys) {
        const c = on(source(k))
        if (c && primaryOk(c)) return c
      }
      for (const k of keys) {
        const c = on(source(k))
        const d = c && deepen(c)
        if (d) return d
      }
    }
    return fill(PRIMARY_KEYS, 2.2)
  })()
  const onPrimary = readableOn(
    primary,
    [on(explicit('button.foreground')), WHITE, BLACK],
    FLOOR.text
  )
  const ring = ensureContrast(on(pick(['focusBorder'])) ?? primary, background, FLOOR.ui)

  /** A status colour used as text and as a fill: lifted to text contrast, with a readable colour for on top of it. */
  const status = (keys: string[], fallbackKeys: string[] = []): { color: Rgba; on: Rgba } => {
    // Themes sometimes set e.g. errorForeground to near-white (text for a red box); only a real hue counts.
    const hued = (c: Rgba | null): Rgba | null => (c && chroma(on(c)!) >= MIN_CHROMA ? on(c) : null)
    let found: Rgba | null = null
    for (const k of [...keys, ...fallbackKeys]) if ((found = hued(explicit(k)))) break
    if (!found) for (const k of [...keys, ...fallbackKeys]) if ((found = hued(builtin(k)))) break
    const color = ensureContrast(found ?? on(pick(keys)) ?? foreground, background, FLOOR.text)
    return { color, on: readableOn(color, [WHITE, BLACK], FLOOR.text) }
  }
  const destructive = status([
    'editorError.foreground',
    'errorForeground',
    'list.errorForeground',
    'terminal.ansiRed'
  ])
  const warning = status([
    'editorWarning.foreground',
    'list.warningForeground',
    'charts.yellow',
    'terminal.ansiYellow'
  ])
  const success = status([
    'gitDecoration.addedResourceForeground',
    'editorGutter.addedBackground',
    'charts.green',
    'terminal.ansiGreen'
  ])
  const info = status(['editorInfo.foreground', 'charts.blue', 'terminal.ansiBlue'])
  const link = ensureContrast(
    on(pick(['textLink.foreground', 'editorInfo.foreground'])) ?? info.color,
    background,
    FLOOR.text
  )

  const popover =
    on(
      pick([
        'menu.background',
        'quickInput.background',
        'editorWidget.background',
        'dropdown.background'
      ])
    ) ?? card
  const popoverForeground = ensureContrast(
    on(pick(['menu.foreground', 'quickInput.foreground', 'dropdown.foreground'])) ?? foreground,
    popover,
    FLOOR.text
  )
  const sidebar = on(pick(['sideBar.background'])) ?? (dark ? shade(0.15) : toward(0.035))
  const sidebarForeground = ensureContrast(
    on(explicit('sideBar.foreground')) ?? foreground,
    sidebar,
    FLOOR.text
  )

  // Syntax --------------------------------------------------------------------------------------------------
  const rules = theme.tokens
  const code = (scopes: string[], fallback: Rgba): Rgba => {
    const c = firstScope(rules, scopes)
    return ensureContrast(on(parse(c)) ?? fallback, background, hc ? FLOOR.text : FLOOR.ui)
  }
  const codeForeground = foreground
  const keyword = code(['keyword', 'keyword.control', 'storage'], link)
  const string = code(['string'], success.color)
  const number = code(['constant.numeric', 'constant'], warning.color)
  const constant = code(['constant.language', 'constant'], number)
  const fn = code(['entity.name.function', 'support.function'], link)
  const type = code(
    ['entity.name.type', 'entity.name.class', 'support.class', 'support.type'],
    info.color
  )
  const variable = code(['variable'], codeForeground)
  const property = code(
    [
      'variable.other.property',
      'support.type.property-name',
      'variable.other.object.property',
      'variable'
    ],
    codeForeground
  )
  const tag = code(['entity.name.tag'], keyword)
  const regexp = code(['string.regexp'], string)
  const comment = code(['comment'], mutedForeground)
  const meta = code(
    ['meta.preprocessor', 'entity.other.attribute-name', 'punctuation.definition.tag'],
    keyword
  )

  // Terminal ------------------------------------------------------------------------------------------------
  const terminalBg = on(explicit('terminal.background')) ?? inset
  const terminalFg = ensureContrast(
    on(explicit('terminal.foreground')) ?? foreground,
    terminalBg,
    FLOOR.text
  )
  const ansi: TokenMap = {}
  for (const name of ANSI_NAMES) {
    const raw = on(get(`terminal.ansi${name}`)) ?? foreground
    // xterm, and so VS Code's terminal, raises any colour below 4.5:1; the same rule keeps `ls` output readable.
    const key = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    ansi[`ansi-${key}`] = hex(ensureContrast(raw, terminalBg, FLOOR.text))
  }

  // Charts ------------------------------------------------------------------------------------------------
  const chart = (keys: string[], fallback: Rgba): Rgba =>
    ensureContrast(on(pick(keys)) ?? fallback, background, FLOOR.ui)
  const chart1 = chart(['charts.blue'], primary)
  const chart2 = chart(['charts.green'], success.color)
  const chart3 = chart(['charts.yellow'], warning.color)
  const chart4 = chart(['charts.orange', 'charts.red'], destructive.color)
  const chart5 = chart(['charts.purple'], keyword)

  // Text selection stays readable by construction: the strongest primary tint behind the text that still leaves it
  // at least 85% of the contrast it has on the plain page (capped at the 4.5:1 floor).
  const keepText = Math.min(FLOOR.text, contrast(foreground, background) * SELECTION_KEEPS)
  let selection = mix(background, primary, 0.35)
  for (let amount = 0.35; contrast(foreground, selection) < keepText && amount > 0.04; amount -= 0.03) {
    selection = mix(background, primary, amount)
  }

  const tokens: TokenMap = {
    // core surfaces & text
    background: hex(background),
    foreground: hex(foreground),
    surface: hex(background),
    card: hex(card),
    'card-foreground': hex(foreground),
    popover: hex(popover),
    'popover-foreground': hex(popoverForeground),
    inset: hex(inset),
    muted: hex(muted),
    secondary: hex(secondary),
    'secondary-foreground': hex(foreground),
    accent: hex(accent),
    'accent-foreground': hex(foreground),
    'muted-foreground': hex(mutedForeground),
    'soft-foreground': hex(softForeground),
    'faint-foreground': hex(faintForeground),
    // lines & focus
    border: hex(border),
    'border-strong': hex(borderStrong),
    input: hex(inputBorder),
    ring: hex(ring),
    grid: hex(toward(0.08)),
    selection: hex(selection),
    // brand & status
    primary: hex(primary),
    'primary-foreground': hex(onPrimary),
    destructive: hex(destructive.color),
    'destructive-foreground': hex(destructive.on),
    success: hex(success.color),
    'success-foreground': hex(success.on),
    warning: hex(warning.color),
    'warning-foreground': hex(warning.on),
    info: hex(info.color),
    'info-foreground': hex(info.on),
    link: hex(link),
    scrim: '#000000',
    'scrim-foreground': '#ffffff',
    // sidebar family (shadcn)
    sidebar: hex(sidebar),
    'sidebar-foreground': hex(sidebarForeground),
    'sidebar-primary': hex(primary),
    'sidebar-primary-foreground': hex(onPrimary),
    'sidebar-accent': hex(accent),
    'sidebar-accent-foreground': hex(foreground),
    'sidebar-border': hex(border),
    'sidebar-ring': hex(ring),
    // charts & scores
    'chart-1': hex(chart1),
    'chart-2': hex(chart2),
    'chart-3': hex(chart3),
    'chart-4': hex(chart4),
    'chart-5': hex(chart5),
    score: hex(success.color),
    'score-foreground': hex(success.on),
    'score-mid': hex(warning.color),
    'score-low': hex(destructive.color),
    // diffs
    'diff-add': hex(success.color),
    'diff-del': hex(destructive.color),
    'diff-mod': hex(info.color),
    'diff-add-bg': hex(mix(background, success.color, 0.16)),
    'diff-del-bg': hex(mix(background, destructive.color, 0.16)),
    // syntax
    'syn-keyword': hex(keyword),
    'syn-string': hex(string),
    'syn-number': hex(number),
    'syn-constant': hex(constant),
    'syn-title': hex(fn),
    'syn-type': hex(type),
    'syn-variable': hex(variable),
    'syn-attr': hex(property),
    'syn-tag': hex(tag),
    'syn-regexp': hex(regexp),
    'syn-comment': hex(comment),
    'syn-meta': hex(meta),
    // terminal
    'terminal-bg': hex(terminalBg),
    'terminal-fg': hex(terminalFg),
    ...ansi,
    // native window chrome (also sent to the main process)
    titlebar: hex(background),
    'titlebar-symbol': hex(mutedForeground)
  }

  // Overlay tint used for scrollbars: the text colour at low alpha reads on every surface.
  tokens['scrollbar'] = hex(withAlpha(foreground, 0.28))
  tokens['scrollbar-hover'] = hex(withAlpha(foreground, 0.5))
  return tokens
}
