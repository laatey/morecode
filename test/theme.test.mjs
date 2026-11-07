import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

register('./ts-resolve-hooks.mjs', import.meta.url)
const color = await import('../src/renderer/src/theme/color.ts')
const { deriveTokens, scopeColor, FLOOR, SELECTION_KEEPS } = await import('../src/renderer/src/theme/derive.ts')
const { UI_KEYS } = await import('../src/renderer/src/theme/vscode-keys.ts')
const { VSCODE_THEMES } = await import('../src/renderer/src/theme/vscode-themes-generated.ts')
const { THEME_LIST, getTheme, hasTheme, themeData, DEFAULT_THEME_ID } = await import('../src/renderer/src/theme/themes.ts')
const { cleanThemePrefs, resolveThemeId, DEFAULT_THEME_PREFS } = await import('../src/renderer/src/theme/prefs.ts')

const P = color.parse
const ratio = (a, b) => color.contrast(P(a), P(b))

test('colour maths matches WCAG reference values', () => {
  assert.equal(color.contrast(color.BLACK, color.WHITE).toFixed(3), '21.000')
  assert.equal(ratio('#777777', '#ffffff').toFixed(3), '4.478')
  assert.equal(color.toHex(color.mix(P('#272726'), P('#ececea'), 0)), '#272726')
  assert.equal(color.toHex(color.mix(P('#272726'), P('#ececea'), 1)), '#ececea')
  assert.equal(color.toHex(P('#f00a')), '#ff0000aa')
  assert.equal(P('transparent'), null)
})

test('ensureContrast reaches its target and leaves good colours alone', () => {
  const bg = P('#002b36')
  const lifted = color.ensureContrast(P('#586e75'), bg, 4.5)
  assert.ok(color.contrast(lifted, bg) >= 4.5)
  assert.equal(color.toHex(color.ensureContrast(P('#ffffff'), bg, 4.5)), '#ffffff')
  const dark = color.ensureContrast(P('#bf8803'), color.WHITE, 4.5)
  assert.ok(color.contrast(dark, color.WHITE) >= 4.5)
})

test('every VS Code built-in theme is present, with its kind', () => {
  const labels = VSCODE_THEMES.map((t) => t.label)
  for (const want of ['Dark Modern', 'Light Modern', 'Dark+', 'Light+', 'Monokai', 'Solarized Dark', 'Solarized Light', 'Abyss', 'Kimbie Dark', 'Red', 'Quiet Light', 'Tomorrow Night Blue', 'Monokai Dimmed']) {
    assert.ok(labels.includes(want), `missing ${want}`)
  }
  assert.ok(VSCODE_THEMES.length >= 19)
  assert.equal(VSCODE_THEMES.filter((t) => t.type === 'hcDark').length, 1)
  assert.equal(VSCODE_THEMES.filter((t) => t.type === 'hcLight').length, 1)
  assert.equal(THEME_LIST.length, VSCODE_THEMES.length + 2)
  assert.equal(new Set(THEME_LIST.map((t) => t.id)).size, THEME_LIST.length, 'ids are unique')
})

test('include chains are resolved (Dark Modern inherits Dark+ and Dark VS syntax rules)', () => {
  const dm = VSCODE_THEMES.find((t) => t.label === 'Dark Modern')
  assert.ok(dm.tokens.length > 20)
  assert.equal(scopeColor(dm.tokens, 'string'), '#ce9178')
  assert.equal(scopeColor(dm.tokens, 'entity.name.function'), '#dcdcaa')
  assert.equal(scopeColor(VSCODE_THEMES.find((t) => t.label === 'Monokai').tokens, 'keyword'), '#f92672')
})

test('scope matching: most specific wins, later wins ties, parent-constrained rules are ignored', () => {
  const rules = [
    { scope: ['string'], color: '#111111' },
    { scope: ['string.quoted'], color: '#222222' },
    { scope: ['string.quoted'], color: '#333333' },
    { scope: ['source.css string'], color: '#444444' }
  ]
  assert.equal(scopeColor(rules, 'string.quoted.double'), '#333333')
  assert.equal(scopeColor(rules, 'string.regexp'), '#111111')
  assert.equal(scopeColor(rules, 'comment'), null)
})

test('derivation only reads colour keys from the shared whitelist', () => {
  const allowed = new Set(UI_KEYS)
  for (const theme of VSCODE_THEMES) {
    const read = new Set()
    const colors = new Proxy(theme.colors, { get: (t, k) => (read.add(String(k)), t[k]) })
    deriveTokens({ ...theme, colors })
    for (const k of read) assert.ok(allowed.has(k), `${theme.label} read "${k}"`)
  }
})

const REQUIRED = [
  'background', 'foreground', 'card', 'popover', 'inset', 'muted', 'secondary', 'accent', 'muted-foreground', 'soft-foreground',
  'faint-foreground', 'border', 'border-strong', 'input', 'ring', 'primary', 'primary-foreground', 'destructive', 'destructive-foreground',
  'success', 'success-foreground', 'warning', 'warning-foreground', 'info', 'info-foreground', 'link', 'scrim', 'scrim-foreground',
  'selection', 'diff-add', 'diff-del', 'diff-mod', 'diff-add-bg', 'diff-del-bg', 'terminal-bg', 'terminal-fg', 'titlebar', 'titlebar-symbol',
  'syn-keyword', 'syn-string', 'syn-number', 'syn-constant', 'syn-title', 'syn-type', 'syn-variable', 'syn-attr', 'syn-tag', 'syn-regexp', 'syn-comment', 'syn-meta',
  ...['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].flatMap((n) => [`ansi-${n}`, `ansi-bright-${n}`])
]

for (const { id, label } of THEME_LIST) {
  test(`${label}: complete, valid and legible`, () => {
    const t = getTheme(id).tokens
    for (const name of REQUIRED) {
      assert.ok(t[name], `missing token ${name}`)
      assert.ok(P(t[name]), `${name} is not a colour: ${t[name]}`)
    }
    // the tokens the shell renders on the page background must be readable on it
    for (const name of ['foreground', 'soft-foreground', 'muted-foreground', 'link', 'destructive', 'success', 'warning', 'info']) {
      assert.ok(ratio(t[name], t.background) >= FLOOR.text - 0.05, `${name} ${t[name]} on ${t.background} = ${ratio(t[name], t.background).toFixed(2)}`)
    }
    assert.ok(ratio(t['faint-foreground'], t.background) >= FLOOR.faint - 0.05, 'faint text')
    // text on filled controls
    for (const [fill, on] of [['primary', 'primary-foreground'], ['destructive', 'destructive-foreground'], ['success', 'success-foreground'], ['warning', 'warning-foreground'], ['info', 'info-foreground']]) {
      assert.ok(ratio(on === 'primary-foreground' ? t[on] : t[on], t[fill]) >= 4.4, `${on} on ${fill}`)
    }
    // code colours and terminal colours
    for (const n of Object.keys(t).filter((k) => k.startsWith('syn-'))) assert.ok(ratio(t[n], t.background) >= FLOOR.ui - 0.05, `${n} ${t[n]} on bg = ${ratio(t[n], t.background).toFixed(2)}`)
    for (const n of Object.keys(t).filter((k) => k.startsWith('ansi-'))) assert.ok(ratio(t[n], t['terminal-bg']) >= FLOOR.text - 0.05, `${n} on terminal bg`)
    assert.ok(ratio(t['terminal-fg'], t['terminal-bg']) >= FLOOR.text - 0.05, 'terminal text')
    // selected text stays readable
    assert.ok(
      ratio(t.foreground, t.selection) >= Math.min(FLOOR.text, ratio(t.foreground, t.background) * SELECTION_KEEPS) - 0.05,
      'text over selection'
    )
    // surfaces step visibly away from the page, and the primary fill shows against it
    assert.ok(ratio(t.secondary, t.background) > 1.04, 'secondary surface is distinguishable')
    assert.ok(ratio(t.primary, t.background) >= 2.1, 'primary fill is visible')
    assert.ok(ratio(t.border, t.background) >= 1.1, 'borders are visible')
    // the secondary text tier really is softer than body text
    assert.ok(ratio(t['muted-foreground'], t.background) <= ratio(t.foreground, t.background) + 0.01, 'muted is not stronger than text')
  })
}

test('High Contrast themes draw strong borders', () => {
  for (const t of THEME_LIST.filter((t) => t.kind.startsWith('hc'))) {
    assert.ok(ratio(getTheme(t.id).tokens.border, getTheme(t.id).tokens.background) >= 4.5, `${t.label} border`)
  }
})

test('MoreCode Dark keeps the original look', () => {
  const t = getTheme('morecode-dark').tokens
  assert.equal(t.background, '#272726')
  assert.equal(t.foreground, '#ececea')
  assert.equal(t.ring, '#3b82f6')
  assert.ok(ratio(t['primary-foreground'], t.primary) >= 4.5)
  assert.equal(DEFAULT_THEME_ID, 'morecode-dark')
})

test('themes report the right light/dark kind', () => {
  assert.equal(getTheme('vscode-dark-modern').kind, 'dark')
  assert.equal(getTheme('vscode-light-modern').kind, 'light')
  assert.equal(getTheme('vscode-solarized-light').kind, 'light')
  assert.ok(themeData('vscode-abyss'))
})

test('preferences: unknown themes fall back, automatic mode picks by system appearance', () => {
  assert.equal(cleanThemePrefs({ theme: 'does-not-exist' }).theme, DEFAULT_THEME_PREFS.theme)
  assert.equal(cleanThemePrefs(undefined).themeAuto, false)
  assert.ok(hasTheme('vscode-monokai'))
  const auto = { theme: 'vscode-monokai', themeAuto: true, themeDark: 'vscode-abyss', themeLight: 'vscode-quiet-light' }
  assert.equal(resolveThemeId(auto, true), 'vscode-abyss')
  assert.equal(resolveThemeId(auto, false), 'vscode-quiet-light')
  assert.equal(resolveThemeId({ ...auto, themeAuto: false }, false), 'vscode-monokai')
})
