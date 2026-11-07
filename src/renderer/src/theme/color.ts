/**
 * Colour maths for the theme engine. Pure functions, no DOM, so they run in tests and in the main process.
 *
 * - Mixing happens in OKLab, so "12% of the way to the text colour" looks equally strong on every theme.
 * - Contrast is the WCAG 2 ratio, which is what the legibility guarantees in derive.ts are written against.
 */

export interface Rgba {
  /** 0–255 */
  r: number
  g: number
  b: number
  /** 0–1 */
  a: number
}

const clamp = (n: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, n))
const byte = (n: number): number => Math.round(clamp(n, 0, 255))

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 }
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Anything else (named colours, `transparent`, junk) is null. */
export function parse(input: string | undefined | null): Rgba | null {
  if (!input) return null
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(input.trim())
  if (!m) return null
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
}

const hex2 = (n: number): string => byte(n).toString(16).padStart(2, '0')

/** `#rrggbb`, or `#rrggbbaa` when the colour is translucent. */
export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  return c.a < 1 ? base + hex2(c.a * 255) : base
}

export const withAlpha = (c: Rgba, a: number): Rgba => ({ ...c, a: clamp(a) })

/** Paint `c` over an opaque `base` and return the opaque result. */
export function flatten(c: Rgba, base: Rgba): Rgba {
  if (c.a >= 1) return c
  return {
    r: c.r * c.a + base.r * (1 - c.a),
    g: c.g * c.a + base.g * (1 - c.a),
    b: c.b * c.a + base.b * (1 - c.a),
    a: 1
  }
}

// --- OKLab ---------------------------------------------------------------------------------------------

const toLinear = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const fromLinear = (v: number): number => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return s * 255
}

type Lab = [number, number, number]

function toOklab(c: Rgba): Lab {
  const r = toLinear(c.r)
  const g = toLinear(c.g)
  const b = toLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function fromOklab([L, A, B]: Lab, a = 1): Rgba {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
  return {
    r: byte(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: byte(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: byte(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a
  }
}

/** OKLab lightness, 0 (black) to 1 (white). */
export const lightness = (c: Rgba): number => toOklab(flatten(c, BLACK))[0]

/** How colourful a colour is (OKLab chroma): ~0 for greys, ~0.1+ for clearly tinted colours. */
export function chroma(c: Rgba): number {
  const [, a, b] = toOklab(flatten(c, BLACK))
  return Math.hypot(a, b)
}

/** OKLab hue angle in degrees, 0–360 (red ≈ 25, amber ≈ 75, green ≈ 145, blue ≈ 260, purple ≈ 305). */
export function hue(c: Rgba): number {
  const [, a, b] = toOklab(flatten(c, BLACK))
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

/** `amount` of the way from `from` to `to` (0 = from, 1 = to), blended in OKLab. Alpha blends linearly. */
export function mix(from: Rgba, to: Rgba, amount: number): Rgba {
  const t = clamp(amount)
  const a = toOklab(from)
  const b = toOklab(to)
  return fromOklab(
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    from.a + (to.a - from.a) * t
  )
}

// --- Contrast ------------------------------------------------------------------------------------------

/** WCAG relative luminance of an opaque colour. */
export function luminance(c: Rgba): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b)
}

/** WCAG contrast ratio, 1 to 21. A translucent `fg` is judged as painted over `bg`. */
export function contrast(fg: Rgba, bg: Rgba): number {
  const opaqueBg = flatten(bg, BLACK)
  const a = luminance(flatten(fg, opaqueBg))
  const b = luminance(opaqueBg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Is this colour perceptually dark? Used to pick the contrasting side. */
export const isDark = (c: Rgba): boolean => luminance(flatten(c, BLACK)) < 0.179

/**
 * The smallest change to `fg` (keeping its hue as far as possible) that reaches `min` contrast on `bg`.
 * Moves toward white on dark backgrounds and black on light ones; if that side cannot reach the target it tries
 * the other, and finally returns whichever got closest.
 */
export function ensureContrast(fg: Rgba, bg: Rgba, min: number): Rgba {
  const base = flatten(fg, flatten(bg, BLACK))
  const surface = flatten(bg, BLACK)
  if (contrast(base, surface) >= min) return base
  const towards = isDark(surface) ? [WHITE, BLACK] : [BLACK, WHITE]
  let best = base
  let bestRatio = contrast(base, surface)
  for (const target of towards) {
    if (contrast(target, surface) < min && contrast(target, surface) <= bestRatio) continue
    let lo = 0
    let hi = 1
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (contrast(mix(base, target, mid), surface) >= min) hi = mid
      else lo = mid
    }
    const candidate = mix(base, target, hi)
    const ratio = contrast(candidate, surface)
    if (ratio >= min) return candidate
    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }
  }
  return best
}

/** The first candidate that reads at `min` on `bg`; otherwise black or white, whichever reads better. */
export function readableOn(bg: Rgba, candidates: (Rgba | null | undefined)[], min = 4.5): Rgba {
  for (const c of candidates) if (c && contrast(c, bg) >= min) return flatten(c, bg)
  return contrast(WHITE, bg) >= contrast(BLACK, bg) ? WHITE : BLACK
}
