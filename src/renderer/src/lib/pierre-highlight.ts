import { getSharedHighlighter } from '@pierre/diffs'

const cache = new Map<string, string>()
const MAX_CACHE_ENTRIES = 120

export const escapeCodeHtml = (code: string): string =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function getCachedHighlight(code: string, language: string | null): string | undefined {
  const lang = language || 'text'
  return cache.get(`${lang}\u0000${code}`)
}

/**
 * Use Pierre/Shiki for token colours only. The app continues to own the code surface, spacing,
 * and controls instead of inheriting Pierre's file-view UI.
 */
export async function highlightWithPierre(code: string, language: string | null): Promise<string> {
  const lang = language || 'text'
  const key = `${lang}\u0000${code}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  try {
    const highlighter = await getSharedHighlighter({ themes: ['pierre-dark'], langs: [lang] })
    const rendered = highlighter.codeToHtml(code, { lang, theme: 'pierre-dark' })
    // Pierre's outer <pre> sets its own background. Keep only its syntax-token markup.
    const html = rendered
      .replace(/^<pre[^>]*><code>/, '')
      .replace(/<\/code><\/pre>$/, '')
      // Shiki separates block-level `.line` spans with literal newlines. In our own `<pre>`,
      // those newlines would become extra visual rows, so remove only the separator whitespace.
      .replace(/<\/span>\n(?=<span class="line">)/g, '</span>')
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? key)
    cache.set(key, html)
    return html
  } catch {
    return escapeCodeHtml(code)
  }
}
