import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

/**
 * Every colour in the interface comes from a theme token (bg-background, text-muted-foreground, var(--border)…),
 * so that every theme can restyle it. This fails the build when a literal colour sneaks back in.
 *
 * Intentional exceptions live in ALLOWED, each with its reason. Black shadows are fine on every theme.
 */
const ROOT = join(import.meta.dirname, '../src/renderer/src')

const ALLOWED = [
  { file: 'theme/', why: 'the theme engine itself defines colours' },
  { file: 'components/logo.tsx', why: 'brand mark' },
  { file: 'components/file-icon.tsx', why: 'file-type brand colours (darkened on light themes in code)' },
  { file: 'features/auth/ui.tsx', why: 'the Google "G" must keep Google’s colours', only: /#(4285F4|34A853|FBBC05|EA4335)\b/ },
  { file: 'features/ai-assistant/image-utils.ts', why: 'white backing for transparent images converted to JPEG (pixel data, not UI)' },
  { file: 'components/ui/chart.tsx', why: 'recharts attribute selectors such as [stroke="#ccc"], never painted' },
  { file: 'styles.css', why: 'first-paint safety net for --background/--foreground', only: /--(background|foreground): #[0-9a-f]{6};/ }
]

const PATTERNS = [
  [/(?<![\w&])#[0-9a-fA-F]{8}\b|(?<![\w&/])#[0-9a-fA-F]{6}\b|(?<![\w&/])#[0-9a-fA-F]{3,4}\b(?![\w-])/g, 'hex colour'],
  [/\brgba?\((?!\s*0\s*,\s*0\s*,\s*0\b)/g, 'rgb()/rgba() other than a black shadow'],
  [/\bhsla?\(/g, 'hsl()'],
  [/\boklch\((?!\s*0[\s_])/g, 'oklch() other than a black shadow'],
  [/\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|caret|accent|placeholder)(?:-[trblxy])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g, 'Tailwind palette colour'],
  [/\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|caret|shadow)(?:-[trblxy])?-(?:white|black)\b/g, 'white/black utility']
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'brand-logos') yield* walk(path)
    } else if (/\.(tsx?|css)$/.test(name)) yield path
  }
}

test('no hardcoded colours outside the allowlist', () => {
  const found = []
  for (const path of walk(ROOT)) {
    const rel = relative(ROOT, path).split('\\').join('/')
    const rule = ALLOWED.find((a) => rel === a.file || (a.file.endsWith('/') && rel.startsWith(a.file)))
    if (rule && !rule.only) continue
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      for (const [re, what] of PATTERNS) {
        for (const m of line.matchAll(re)) {
          if (rule?.only?.test(line)) continue
          found.push(`${rel}:${i + 1}  ${what}: ${m[0]}`)
        }
      }
    })
  }
  assert.deepEqual(found, [], `Use a theme token instead of a literal colour:\n  ${found.join('\n  ')}`)
})

test('every allowlist entry still exists', () => {
  for (const a of ALLOWED) assert.ok(statSync(join(ROOT, a.file)), a.file)
})
