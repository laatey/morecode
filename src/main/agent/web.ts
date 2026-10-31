/**
 * Web search and page reading for the AI. No keys and no extra services: search reads the public
 * result pages of DuckDuckGo (and Bing when that comes back empty), and a page is fetched, stripped
 * to readable text and clipped. Pure functions where possible, so they can be tested without a network.
 */

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export interface PageText {
  url: string
  title: string
  text: string
  /** The page had more text than was returned. */
  clipped: boolean
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MoreCode'
const MAX_BYTES = 2 * 1024 * 1024

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  copy: '©'
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return NAMED[body.toLowerCase()] ?? whole
  })
}

const stripTags = (s: string): string =>
  decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

/* ---------- search result pages ---------- */

function ddgTarget(href: string): string | null {
  let h = decodeEntities(href)
  if (h.startsWith('//')) h = `https:${h}`
  try {
    const u = new URL(h, 'https://duckduckgo.com')
    if (u.hostname.endsWith('duckduckgo.com')) {
      if (u.pathname.startsWith('/y.js')) return null // an ad
      const real = u.searchParams.get('uddg')
      return real && /^https?:\/\//i.test(real) ? real : null
    }
    return /^https?:\/\//i.test(u.href) ? u.href : null
  } catch {
    return null
  }
}

export function parseDuckDuckGo(html: string, max = 8): SearchHit[] {
  const hits: SearchHit[] = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = m[1]
    if (/result__a\b/.test(attrs)) {
      const href = /href="([^"]*)"/i.exec(attrs)?.[1] ?? ''
      const url = ddgTarget(href)
      const title = stripTags(m[2])
      if (url && title) hits.push({ title, url, snippet: '' })
      else hits.push({ title: '', url: '', snippet: '' }) // keeps snippets lined up with a skipped ad
    } else if (/result__snippet\b/.test(attrs) && hits.length) {
      const last = hits[hits.length - 1]
      if (!last.snippet) last.snippet = stripTags(m[2])
    }
  }
  return hits.filter((h) => h.url).slice(0, max)
}

function bingTarget(href: string): string | null {
  const h = decodeEntities(href)
  try {
    const u = new URL(h)
    if (u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/')) {
      const enc = u.searchParams.get('u')
      if (enc && enc.startsWith('a1')) {
        const real = Buffer.from(
          enc.slice(2).replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ).toString('utf8')
        return /^https?:\/\//i.test(real) ? real : null
      }
      return null
    }
    return /^https?:\/\//i.test(u.href) ? u.href : null
  } catch {
    return null
  }
}

export function parseBing(html: string, max = 8): SearchHit[] {
  const hits: SearchHit[] = []
  for (const chunk of html.split(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"/i).slice(1)) {
    const link = /<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk)
    if (!link) continue
    const url = bingTarget(link[1])
    const title = stripTags(link[2])
    if (!url || !title) continue
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1]
    hits.push({ title, url, snippet: snippet ? stripTags(snippet) : '' })
    if (hits.length >= max) break
  }
  return hits
}

const blocked = (html: string): boolean =>
  /anomaly|captcha|unusual traffic|are you a robot/i.test(html.slice(0, 20_000))

async function getText(
  url: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<{ status: number; text: string }> {
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.8'
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  })
  return { status: res.status, text: await res.text() }
}

export async function webSearch(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  max = 8
): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) throw new Error('The search needs some words.')
  const q64 = encodeURIComponent(q)
  let sawBlock = false
  let failed = ''
  const attempts: [string, (html: string, n: number) => SearchHit[]][] = [
    [`https://html.duckduckgo.com/html/?q=${q64}`, parseDuckDuckGo],
    [`https://www.bing.com/search?q=${q64}&setlang=en`, parseBing]
  ]
  for (const [url, parse] of attempts) {
    try {
      const { status, text } = await getText(url, signal, fetchImpl)
      const hits = parse(text, max)
      if (hits.length) return hits
      if (blocked(text) || status === 202 || status === 429) sawBlock = true
    } catch (err) {
      if (signal.aborted) throw err
      failed = (err as Error).message
    }
  }
  if (sawBlock)
    throw new Error(
      'The search service is limiting requests right now. Try again in a moment, or use web_fetch on a specific page.'
    )
  if (failed)
    throw new Error(
      `Could not reach the search service (${failed}). Check the internet connection.`
    )
  return []
}

/* ---------- reading a page ---------- */

const BLOCK =
  /<\/?(?:p|div|section|article|header|footer|main|aside|nav|ul|ol|table|thead|tbody|tr|blockquote|pre|figure|figcaption|form|details|summary|hr)\b[^>]*>/gi

export function htmlToText(html: string): { title: string; text: string } {
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  let body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, '')
  // the main content when the page marks it, otherwise everything after <head>
  const main = /<(main|article)\b[^>]*>([\s\S]*)<\/\1>/i.exec(body)
  if (main && main[2].length > 800) body = main[2]
  else body = body.replace(/^[\s\S]*?<\/head>/i, '')
  body = body
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_w, n: string, inner: string) => `\n\n${'#'.repeat(Number(n))} ${stripTags(inner)}\n`
    )
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(BLOCK, '\n')
    .replace(/<[^>]+>/g, '')
  const text = decodeEntities(body)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text }
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
    if (total >= limit) {
      await reader.cancel().catch(() => undefined)
      break
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

export const isLocalUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url)

export function normalizeUrl(raw: string): string {
  let url = raw.trim()
  if (!url) throw new Error('“url” is required.')
  // "localhost:5173" looks like a scheme but is a host and port; only :// or a known non-web scheme counts
  if (!/^([a-z][a-z0-9+.-]*:\/\/|(file|data|javascript|mailto|ftp|about|blob|ws|wss):)/i.test(url))
    url = /^(localhost|127\.0\.0\.1)/i.test(url) ? `http://${url}` : `https://${url}`
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https addresses can be read.')
  try {
    return new URL(url).href
  } catch {
    throw new Error(`“${raw}” is not a valid web address.`)
  }
}

export async function webFetch(
  rawUrl: string,
  signal: AbortSignal,
  maxChars = 20_000,
  fetchImpl: typeof fetch = fetch
): Promise<PageText> {
  const url = normalizeUrl(rawUrl)
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5'
    },
    redirect: 'follow',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)])
  })
  if (!res.ok)
    throw new Error(`The page answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`)
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (type && !/(text\/|json|xml|javascript|markdown|yaml)/.test(type)) {
    throw new Error(
      `That address is a file (${type.split(';')[0]}), not a page that can be read as text.`
    )
  }
  const raw = await readLimited(res, MAX_BYTES)
  const isHtml = /html/.test(type) || /^\s*<(!doctype|html)/i.test(raw)
  const { title, text } = isHtml ? htmlToText(raw) : { title: '', text: raw.trim() }
  const limit = Math.min(40_000, Math.max(1000, maxChars))
  return { url: res.url || url, title, text: text.slice(0, limit), clipped: text.length > limit }
}
