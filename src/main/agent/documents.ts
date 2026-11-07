/**
 * Turns documents the model cannot read natively into something it can: text per page or sheet, and
 * pictures for pages that carry their content as drawings (scans, vector diagrams, charts).
 *
 * The model providers behind the OpenAI-compatible path have no PDF or Office support, so this is
 * done here, once, for every tool that touches a file (read_file, web_fetch).
 */
import { unzipSync, strFromU8 } from 'fflate'
import { htmlToText, decodeEntities } from './web'

export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'pptx'

export interface DocImage {
  media_type: string
  data: string
}

export interface DocResult {
  text: string
  images: DocImage[]
}

export interface DocOptions {
  /** 1-based page, slide or sheet selection such as "3", "2-5" or "1,4-6". Default: from the start. */
  pages?: string
  /** Draw the selected PDF pages as pictures even when they have text (charts, layouts). */
  render?: boolean
  /** Text budget for the whole result. */
  maxChars?: number
}

export const MAX_DOC_BYTES = 25 * 1024 * 1024
const MAX_PAGES_PER_CALL = 20
const MAX_IMAGES_PER_CALL = 6
const IMAGE_LONG_SIDE = 1600
/** A PDF page with fewer characters than this is treated as a drawing. */
const SPARSE_PAGE_CHARS = 40
const DEFAULT_CHARS = 40_000

const EXT: Record<string, DocKind> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', xlsm: 'xlsx', pptx: 'pptx' }
const MIME: [RegExp, DocKind][] = [
  [/application\/pdf/, 'pdf'],
  [/wordprocessingml\.document/, 'docx'],
  [/spreadsheetml\.sheet/, 'xlsx'],
  [/presentationml\.presentation/, 'pptx']
]

export function docKindFromName(name: string): DocKind | null {
  const clean = name.split(/[?#]/)[0]
  return EXT[clean.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

export function docKindFromMime(type: string): DocKind | null {
  const t = type.toLowerCase()
  return MIME.find(([re]) => re.test(t))?.[1] ?? null
}

/** Old binary formats cannot be read; say so plainly instead of calling them "binary". */
export function legacyOfficeHint(name: string): string | null {
  const ext = name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  const to: Record<string, string> = { doc: 'docx', xls: 'xlsx', ppt: 'pptx' }
  return to[ext] ? `.${ext} is an old Office format that cannot be read directly. Convert it to .${to[ext]} first (for example with LibreOffice: soffice --headless --convert-to ${to[ext]} <file>).` : null
}

/** "2-5,8" -> [2,3,4,5,8], clipped to 1..total. Throws for nonsense. */
export function parsePageSelection(spec: string | undefined, total: number): number[] {
  if (!spec || !spec.trim()) return Array.from({ length: total }, (_, n) => n + 1)
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if (!m) throw new Error(`“${spec}” is not a page selection. Use numbers like 3, 2-5 or 1,4-6.`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let n = Math.min(a, b); n <= Math.max(a, b) && out.size < 5000; n++) if (n >= 1 && n <= total) out.add(n)
  }
  if (!out.size) throw new Error(`The selection “${spec}” is outside the document, which has ${total} page${total === 1 ? '' : 's'}.`)
  return [...out].sort((x, y) => x - y)
}

/* ---------- PDF ---------- */

interface PdfTextItem {
  str?: string
  transform?: number[]
  hasEOL?: boolean
}

/** Rebuild lines from pdf.js text items (they arrive as fragments with positions). */
function pageText(items: PdfTextItem[]): string {
  let out = ''
  let lastY: number | null = null
  for (const it of items) {
    if (typeof it.str !== 'string') continue
    const y = it.transform?.[5] ?? 0
    if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n'
    else if (out && !out.endsWith(' ') && !out.endsWith('\n') && it.str && !it.str.startsWith(' ')) out += ' '
    out += it.str
    if (it.hasEOL) out += '\n'
    lastY = y
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadPdfjs(): Promise<any> {
  return await import('pdfjs-dist/legacy/build/pdf.mjs')
}

async function renderPdfPage(doc: any, pageNumber: number): Promise<DocImage | null> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(3, IMAGE_LONG_SIDE / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const factory = doc.canvasFactory
  if (!factory || typeof factory.create !== 'function') return null
  const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
  // white paper behind transparent drawings, so lines do not vanish on a dark background
  target.context.fillStyle = '#ffffff'
  target.context.fillRect(0, 0, target.canvas.width, target.canvas.height)
  await page.render({ canvasContext: target.context, viewport }).promise
  const png: Buffer = target.canvas.toBuffer('image/png')
  page.cleanup()
  return { media_type: 'image/png', data: png.toString('base64') }
}

export async function readPdf(buf: Buffer, opts: DocOptions = {}): Promise<DocResult> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0
  }).promise
  try {
    const total: number = doc.numPages
    const wanted = parsePageSelection(opts.pages, total)
    const pages = wanted.slice(0, MAX_PAGES_PER_CALL)
    const budget = Math.min(DEFAULT_CHARS, Math.max(2000, opts.maxChars ?? DEFAULT_CHARS))
    const images: DocImage[] = []
    const sections: string[] = []
    const drawn: number[] = []
    const notDrawn: number[] = []
    let used = 0
    let lastRead = 0
    for (const n of pages) {
      const page = await doc.getPage(n)
      const text = pageText((await page.getTextContent()).items as PdfTextItem[])
      page.cleanup()
      const sparse = text.replace(/\s/g, '').length < SPARSE_PAGE_CHARS
      let body = text
      if (sparse || opts.render) {
        if (images.length < MAX_IMAGES_PER_CALL) {
          const img = await renderPdfPage(doc, n).catch(() => null)
          if (img) {
            images.push(img)
            drawn.push(n)
            if (sparse) body = (text ? `${text}\n` : '') + '(little or no text on this page; it is attached as a picture)'
          } else if (sparse) {
            body = (text ? `${text}\n` : '') + '(little or no text on this page, and it could not be drawn)'
          }
        } else if (sparse) {
          notDrawn.push(n)
          body = (text ? `${text}\n` : '') + '(little or no text on this page; ask for it on its own to see it as a picture)'
        }
      }
      const block = `--- Page ${n} of ${total} ---\n${body || '(empty page)'}`
      if (used + block.length > budget && sections.length) break
      sections.push(block.slice(0, Math.max(0, budget - used)))
      used += block.length
      lastRead = n
    }
    const notes: string[] = []
    if (drawn.length) notes.push(`Pages shown as pictures: ${drawn.join(', ')}.`)
    if (notDrawn.length) notes.push(`Pages ${notDrawn.join(', ')} had no text and were not drawn (at most ${MAX_IMAGES_PER_CALL} pictures per call).`)
    const covered = wanted.filter((n) => n <= lastRead).length
    if (covered < wanted.length) {
      const next = wanted[covered]
      notes.push(`Stopped after page ${lastRead}; ${wanted.length - covered} more selected page${wanted.length - covered === 1 ? '' : 's'}. Continue with pages: "${next}-${Math.min(total, next + MAX_PAGES_PER_CALL - 1)}".`)
    }
    return { text: `PDF, ${total} page${total === 1 ? '' : 's'}\n\n${sections.join('\n\n')}${notes.length ? `\n\n[${notes.join(' ')}]` : ''}`, images }
  } finally {
    await doc.destroy().catch(() => undefined)
  }
}

/* ---------- Word ---------- */

export async function readDocx(buf: Buffer, opts: DocOptions = {}): Promise<DocResult> {
  const mammoth = await import('mammoth')
  const { value, messages } = await mammoth.convertToHtml({ buffer: buf })
  const { text } = htmlToText(`<body>${value}</body>`)
  const limit = Math.min(DEFAULT_CHARS, Math.max(2000, opts.maxChars ?? DEFAULT_CHARS))
  const cut = text.length > limit
  const warn = messages.some((m: { type: string }) => m.type === 'error') ? '\n[Some parts of the document could not be converted.]' : ''
  return { text: `Word document\n\n${text.slice(0, limit)}${cut ? `\n\n[Document continues: ${text.length - limit} more characters.]` : ''}${warn}`, images: [] }
}

/* ---------- Office XML helpers ---------- */

function unzip(buf: Buffer): Record<string, Uint8Array> {
  try {
    return unzipSync(new Uint8Array(buf), { filter: (f) => /\.(xml|rels)$/i.test(f.name) && f.originalSize < 20_000_000 })
  } catch {
    throw new Error('The file is damaged or is not a real Office document.')
  }
}

const xml = (files: Record<string, Uint8Array>, name: string): string | null => (files[name] ? strFromU8(files[name]) : null)
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
const unesc = (s: string): string => decodeEntities(s)

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function relationships(files: Record<string, Uint8Array>, relsPath: string, from: string): Map<string, string> {
  const map = new Map<string, string>()
  const src = xml(files, relsPath)
  if (!src) return map
  for (const m of src.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) map.set(id, resolveTarget(from, unesc(target)))
  }
  return map
}

/* ---------- PowerPoint ---------- */

function slideParagraphs(src: string): string[] {
  const out: string[] = []
  for (const p of src.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    let line = ''
    for (const run of p[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) line += run[1] !== undefined ? unesc(run[1]) : '\n'
    if (line.trim()) out.push(line.trim())
  }
  return out
}

export async function readPptx(buf: Buffer, opts: DocOptions = {}): Promise<DocResult> {
  const files = unzip(buf)
  const pres = xml(files, 'ppt/presentation.xml')
  if (!pres) throw new Error('This does not look like a PowerPoint file (no presentation.xml).')
  const rels = relationships(files, 'ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml')
  const order = [...pres.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => rels.get(attr(m[0], 'r:id') ?? '')).filter((p): p is string => !!p && !!files[p])
  const slides = order.length ? order : Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
  const wanted = parsePageSelection(opts.pages, slides.length).slice(0, 60)
  const limit = Math.min(DEFAULT_CHARS, Math.max(2000, opts.maxChars ?? DEFAULT_CHARS))
  const blocks: string[] = []
  let used = 0
  for (const n of wanted) {
    const path = slides[n - 1]
    const lines = slideParagraphs(xml(files, path) ?? '')
    const slideRels = relationships(files, path.replace(/slides\/([^/]+)$/, 'slides/_rels/$1.rels'), path)
    const notesPath = [...slideRels.values()].find((p) => /notesSlides\//.test(p))
    const notes = notesPath ? slideParagraphs(xml(files, notesPath) ?? '').filter((l) => !/^\d+$/.test(l)) : []
    const block = `--- Slide ${n} of ${slides.length} ---\n${lines.join('\n') || '(no text on this slide)'}${notes.length ? `\nSpeaker notes: ${notes.join(' ')}` : ''}`
    if (used + block.length > limit && blocks.length) {
      blocks.push(`[Stopped before slide ${n}. Continue with pages: "${n}-${slides.length}".]`)
      break
    }
    blocks.push(block)
    used += block.length
  }
  return { text: `PowerPoint, ${slides.length} slide${slides.length === 1 ? '' : 's'} (text only; pictures and shapes are not shown)\n\n${blocks.join('\n\n')}`, images: [] }
}

/* ---------- Excel ---------- */

function colIndex(ref: string): number {
  let n = 0
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '') n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

export async function readXlsx(buf: Buffer, opts: DocOptions = {}): Promise<DocResult> {
  const files = unzip(buf)
  const book = xml(files, 'xl/workbook.xml')
  if (!book) throw new Error('This does not look like an Excel file (no workbook.xml).')
  const rels = relationships(files, 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml')
  const shared: string[] = []
  for (const si of (xml(files, 'xl/sharedStrings.xml') ?? '').matchAll(/<si\b[\s\S]*?<\/si>/g))
    shared.push(unesc([...si[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
  const sheets = [...book.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => ({ name: unesc(attr(m[0], 'name') ?? 'Sheet'), path: rels.get(attr(m[0], 'r:id') ?? '') ?? '', state: attr(m[0], 'state') }))
    .filter((s) => s.path && files[s.path])
  const wanted = parsePageSelection(opts.pages, sheets.length)
  const limit = Math.min(DEFAULT_CHARS, Math.max(2000, opts.maxChars ?? DEFAULT_CHARS))
  const MAX_ROWS = 300
  const blocks: string[] = []
  let used = 0
  for (const n of wanted) {
    const sheet = sheets[n - 1]
    const src = xml(files, sheet.path) ?? ''
    const rows: string[] = []
    let totalRows = 0
    for (const r of src.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      if (!r[1]) continue
      totalRows++
      if (rows.length >= MAX_ROWS) continue
      const cells: string[] = []
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r') ?? ''
        const type = attr(c[1], 't')
        const body = c[2] ?? ''
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]
        let value = ''
        if (type === 's' && raw !== undefined) value = shared[Number(raw)] ?? ''
        else if (type === 'inlineStr') value = unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
        else if (raw !== undefined) value = unesc(raw)
        if (!value && !formula) continue
        const at = colIndex(ref)
        while (cells.length < at) cells.push('')
        cells[at] = formula && !value ? `=${unesc(formula)}` : value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      }
      if (cells.some(Boolean)) rows.push(`${attr(r[0], 'r') ?? rows.length + 1}: ${cells.join(' | ')}`)
    }
    const hidden = sheet.state && sheet.state !== 'visible' ? ` (${sheet.state})` : ''
    const more = totalRows > MAX_ROWS ? `\n[${totalRows - MAX_ROWS} more rows not shown. Dates appear as day numbers.]` : ''
    const block = `--- Sheet ${n} of ${sheets.length}: ${sheet.name}${hidden} ---\n${rows.join('\n') || '(empty sheet)'}${more}`
    if (used + block.length > limit && blocks.length) {
      blocks.push(`[Stopped before sheet ${n}. Continue with pages: "${n}-${sheets.length}".]`)
      break
    }
    blocks.push(block.slice(0, Math.max(1000, limit - used)))
    used += block.length
  }
  return { text: `Excel workbook, ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (values as last saved; each row starts with its row number)\n\n${blocks.join('\n\n')}`, images: [] }
}

/* ---------- entry point ---------- */

export async function readDocument(buf: Buffer, kind: DocKind, opts: DocOptions = {}): Promise<DocResult> {
  if (buf.length > MAX_DOC_BYTES) throw new Error(`The file is ${(buf.length / 1048576).toFixed(0)} MB; documents over ${MAX_DOC_BYTES / 1048576} MB are not read.`)
  switch (kind) {
    case 'pdf':
      return readPdf(buf, opts)
    case 'docx':
      return readDocx(buf, opts)
    case 'xlsx':
      return readXlsx(buf, opts)
    case 'pptx':
      return readPptx(buf, opts)
  }
}
