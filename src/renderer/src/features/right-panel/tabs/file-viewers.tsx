import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from '@/components/icons'
import { Markdown } from '@/features/ai-assistant/message-parts'
import { escapeCodeHtml, getCachedHighlight, highlightWithPierre } from '@/lib/pierre-highlight'
import { cn } from '@/lib/utils'

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const buffer = base64ToArrayBuffer(base64)
  return URL.createObjectURL(new Blob([buffer], { type: mime }))
}

/** RFC-4180 CSV/TSV parser that handles quoted fields, escaped quotes, and newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

export interface SheetData {
  name: string
  rows: string[][]
}

export function SpreadsheetViewer({ sheets }: { sheets: SheetData[] }): React.JSX.Element {
  const [activeSheet, setActiveSheet] = useState(0)
  const [query, setQuery] = useState('')
  const sheet = sheets[activeSheet] ?? sheets[0]
  const rows = useMemo(() => sheet?.rows ?? [], [sheet])
  const header = rows[0] ?? []
  const body = useMemo(() => {
    const data = rows.slice(1)
    const q = query.trim().toLowerCase()
    if (!q) return data
    return data.filter((r) => r.some((cell) => String(cell ?? '').toLowerCase().includes(q)))
  }, [rows, query])

  const colCount = useMemo(
    () => Math.max(header.length, ...rows.slice(0, 50).map((r) => r.length), 1),
    [header.length, rows]
  )

  if (!sheet || rows.length === 0) {
    return <p className="p-4 text-[12px] text-muted-foreground">This spreadsheet is empty.</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-white/[0.015] px-3">
        <div className="relative flex min-w-0 flex-1 max-w-[240px] items-center">
          <Search className="pointer-events-none absolute left-2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rows…"
            className="h-6 w-full rounded-[5px] border border-white/[0.09] bg-white/[0.04] pl-6 pr-2 text-[11.5px] text-[#ececea] outline-none placeholder:text-[#77776f] focus:border-white/[0.22]"
          />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {body.length.toLocaleString()} {body.length === 1 ? 'row' : 'rows'} · {colCount} {colCount === 1 ? 'col' : 'cols'}
        </span>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#252524] text-[11.5px] font-medium text-[#cfcfcb] shadow-[0_1px_0_rgba(255,255,255,0.08)]">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-r border-white/[0.08] bg-[#252524] px-2 py-1.5 text-right font-mono text-[10.5px] text-[#77776f]">
                #
              </th>
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className="max-w-[280px] min-w-[96px] truncate border-r border-white/[0.07] px-2.5 py-1.5 font-medium"
                >
                  {header[c] || String.fromCharCode(65 + (c % 26))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05] font-mono text-[11.5px] text-[#d6d6d3]">
            {body.slice(0, 1500).map((r, rIdx) => (
              <tr key={rIdx} className="hover:bg-white/[0.03]">
                <td className="sticky left-0 z-10 border-r border-white/[0.08] bg-[#1f1f1e] px-2 py-1 text-right text-[10.5px] tabular-nums text-[#6d6d68]">
                  {rIdx + 1}
                </td>
                {Array.from({ length: colCount }, (_, c) => {
                  const val = r[c] ?? ''
                  const isNum = val !== '' && !Number.isNaN(Number(val))
                  return (
                    <td
                      key={c}
                      className={cn(
                        'max-w-[320px] truncate border-r border-white/[0.05] px-2.5 py-1 font-sans',
                        isNum && 'text-right font-mono tabular-nums text-[#a9c8ff]'
                      )}
                    >
                      {val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheets.length > 1 && (
        <div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-t border-white/[0.07] bg-white/[0.02] px-2">
          {sheets.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(idx)}
              className={cn(
                'cursor-pointer rounded-[5px] px-2.5 py-0.5 text-[11.5px] transition-colors',
                idx === activeSheet
                  ? 'bg-white/[0.11] font-medium text-[#ececea]'
                  : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function colIndexFromRef(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? 'A'
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return Math.max(0, col - 1)
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<SheetData[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const parser = new DOMParser()

  const sharedStrings: string[] = []
  const sstXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  if (sstXml) {
    const doc = parser.parseFromString(sstXml, 'application/xml')
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      const texts = Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '')
      sharedStrings.push(texts.join(''))
    }
  }

  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  const sheetEntries: { name: string; path: string }[] = []
  if (wbXml) {
    const doc = parser.parseFromString(wbXml, 'application/xml')
    const sheets = Array.from(doc.getElementsByTagName('sheet'))
    sheets.forEach((s, idx) => {
      const name = s.getAttribute('name') || `Sheet ${idx + 1}`
      sheetEntries.push({ name, path: `xl/worksheets/sheet${idx + 1}.xml` })
    })
  }
  if (!sheetEntries.length) {
    sheetEntries.push({ name: 'Sheet 1', path: 'xl/worksheets/sheet1.xml' })
  }

  const out: SheetData[] = []
  for (const entry of sheetEntries) {
    const xml = await zip.file(entry.path)?.async('string')
    if (!xml) continue
    const doc = parser.parseFromString(xml, 'application/xml')
    const rowEls = Array.from(doc.getElementsByTagName('row'))
    const rows: string[][] = rowEls.map((rowEl) => {
      const cells = Array.from(rowEl.getElementsByTagName('c'))
      const row: string[] = []
      for (const c of cells) {
        const ref = c.getAttribute('r') || 'A1'
        const colIdx = colIndexFromRef(ref)
        while (row.length <= colIdx) row.push('')
        const type = c.getAttribute('t')
        if (type === 'inlineStr') {
          row[colIdx] = Array.from(c.getElementsByTagName('t'))
            .map((t) => t.textContent ?? '')
            .join('')
        } else {
          const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
          row[colIdx] = type === 's' ? (sharedStrings[Number(v)] ?? v) : v
        }
      }
      return row
    })
    out.push({ name: entry.name, rows })
  }
  return out
}

export function XlsxViewer({ base64 }: { base64: string }): React.JSX.Element {
  const [sheets, setSheets] = useState<SheetData[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void parseXlsxBuffer(base64ToArrayBuffer(base64))
      .then((parsed) => {
        if (!cancelled) setSheets(parsed)
      })
      .catch(() => {
        if (!cancelled) setError('Could not read this spreadsheet.')
      })
    return () => {
      cancelled = true
    }
  }, [base64])

  if (error) return <p className="p-4 text-[12px] text-[#e8b365]">{error}</p>
  if (!sheets) return <p className="p-4 text-[12px] text-muted-foreground">Opening spreadsheet…</p>
  return <SpreadsheetViewer sheets={sheets} />
}

export function DocxViewer({ base64 }: { base64: string }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('mammoth')
      .then((mammoth) => mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(base64) }))
      .then((res) => {
        if (!cancelled) setHtml(res.value || '<p>This document is empty.</p>')
      })
      .catch(() => {
        if (!cancelled) setError('Could not read this Word document.')
      })
    return () => {
      cancelled = true
    }
  }, [base64])

  if (error) return <p className="p-4 text-[12px] text-[#e8b365]">{error}</p>
  if (html === null) return <p className="p-4 text-[12px] text-muted-foreground">Opening document…</p>

  return (
    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div
        className="mx-auto max-w-[680px] space-y-3 text-[13px] leading-6 text-[#dcdcd8] [&_h1]:mt-5 [&_h1]:font-display [&_h1]:text-[20px] [&_h1]:font-semibold [&_h1]:text-[#ececea] [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-[#ececea] [&_h3]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-[#ececea] [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px] [&_td]:border [&_td]:border-white/[0.1] [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-white/[0.1] [&_th]:bg-white/[0.04] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:font-medium [&_a]:text-[#7db1ff] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

interface NotebookCell {
  cell_type?: 'markdown' | 'code' | 'raw'
  execution_count?: number | null
  source?: string | string[]
  outputs?: {
    output_type?: string
    text?: string | string[]
    data?: Record<string, string | string[]>
    ename?: string
    evalue?: string
    traceback?: string[]
  }[]
}

function joinLines(val?: string | string[]): string {
  if (!val) return ''
  return Array.isArray(val) ? val.join('') : String(val)
}

function NotebookCodeSnippet({ code }: { code: string }): React.JSX.Element {
  const [html, setHtml] = useState(() => getCachedHighlight(code, 'python') ?? escapeCodeHtml(code))
  useEffect(() => {
    let cancelled = false
    void highlightWithPierre(code, 'python').then((next) => {
      if (!cancelled) setHtml(next)
    })
    return () => {
      cancelled = true
    }
  }, [code])
  return (
    <pre className="overflow-x-auto px-3.5 py-2.5 font-mono text-[11.5px] leading-relaxed text-[#d6d6d3]">
      <code className="pierre-code" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}

export function NotebookViewer({ text }: { text: string }): React.JSX.Element {
  const parsed = useMemo(() => {
    try {
      const nb = JSON.parse(text) as { cells?: NotebookCell[] }
      return Array.isArray(nb.cells) ? nb.cells : null
    } catch {
      return null
    }
  }, [text])

  if (!parsed) {
    return <p className="p-4 text-[12px] text-[#e8b365]">Invalid Jupyter notebook JSON.</p>
  }

  return (
    <div className="slim-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      {parsed.map((cell, idx) => {
        const src = joinLines(cell.source)
        if (cell.cell_type === 'markdown') {
          return (
            <div key={idx} className="rounded-[8px] border border-transparent px-1 text-[13px]">
              <Markdown text={src} />
            </div>
          )
        }
        return (
          <div key={idx} className="overflow-hidden rounded-[8px] border border-white/[0.09] bg-white/[0.02]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-3 py-1 font-mono text-[11px] text-muted-foreground">
              <span>In [{cell.execution_count ?? ' '}]:</span>
              <span>{cell.cell_type ?? 'code'}</span>
            </div>
            <NotebookCodeSnippet code={src} />
            {cell.outputs && cell.outputs.length > 0 && (
              <div className="space-y-2 border-t border-white/[0.07] bg-[#1a1a19] p-3 font-mono text-[11.5px]">
                {cell.outputs.map((out, oIdx) => {
                  const png = out.data?.['image/png'] ? joinLines(out.data['image/png']).trim() : null
                  const plain = out.text ? joinLines(out.text) : out.data?.['text/plain'] ? joinLines(out.data['text/plain']) : null
                  const err = out.ename ? `${out.ename}: ${out.evalue ?? ''}` : null
                  return (
                    <div key={oIdx} className="space-y-1.5">
                      {png && (
                        <img
                          src={`data:image/png;base64,${png}`}
                          alt="Notebook output"
                          className="max-h-[360px] rounded border border-white/[0.08] bg-white p-1"
                        />
                      )}
                      {plain && <pre className="whitespace-pre-wrap text-[#c9c9c6]">{plain}</pre>}
                      {err && <pre className="whitespace-pre-wrap text-[#f4a39e]">{err}</pre>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function JsonNode({
  name,
  value,
  depth = 0
}: {
  name?: string
  value: unknown
  depth?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(depth < 2)
  const isArray = Array.isArray(value)
  const isObject = value !== null && typeof value === 'object' && !isArray

  if (!isArray && !isObject) {
    const formatted =
      typeof value === 'string' ? (
        <span className="text-[#9ecbff]">&quot;{value}&quot;</span>
      ) : typeof value === 'number' ? (
        <span className="text-[#79b8ff]">{String(value)}</span>
      ) : typeof value === 'boolean' ? (
        <span className="text-[#f97583]">{String(value)}</span>
      ) : (
        <span className="text-[#8d8d8a]">null</span>
      )
    return (
      <div className="flex items-baseline gap-1.5 py-0.5 font-mono text-[12px] leading-5">
        {name !== undefined && <span className="text-[#d6d6d3]">{name}:</span>}
        <span className="break-all">{formatted}</span>
      </div>
    )
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)

  return (
    <div className="font-mono text-[12px] leading-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/[0.05]"
      >
        <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {name !== undefined && <span className="text-[#ececea]">{name}:</span>}
        <span className="text-[11px] text-muted-foreground">
          {isArray ? `[ ${entries.length} ${entries.length === 1 ? 'item' : 'items'} ]` : `{ ${entries.length} ${entries.length === 1 ? 'key' : 'keys'} }`}
        </span>
      </button>
      {open && entries.length > 0 && (
        <div className="ml-3 border-l border-white/[0.08] pl-3">
          {entries.slice(0, 500).map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function JsonTreeViewer({ text, jsonl = false }: { text: string; jsonl?: boolean }): React.JSX.Element {
  const parsed = useMemo(() => {
    try {
      if (jsonl) {
        return {
          ok: true as const,
          data: text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => JSON.parse(l) as unknown)
        }
      }
      return { ok: true as const, data: JSON.parse(text) as unknown }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  }, [text, jsonl])

  if (!parsed.ok) {
    return <p className="p-4 text-[12px] text-[#e8b365]">Invalid JSON: {parsed.error}</p>
  }

  return (
    <div className="slim-scroll min-h-0 flex-1 overflow-auto px-4 py-3">
      <JsonNode value={parsed.data} />
    </div>
  )
}

export function HtmlPreview({ html }: { html: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1b1b1a]">
      <iframe
        title="HTML preview"
        sandbox="allow-scripts"
        srcDoc={html}
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  )
}

export function SvgPreview({ svg }: { svg: string }): React.JSX.Element {
  const [zoom, setZoom] = useState(100)
  const dataUrl = useMemo(() => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, [svg])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-end gap-1.5 border-b border-white/[0.07] px-3 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(25, z - 25))}
          className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-white/[0.07] hover:text-foreground"
        >
          −
        </button>
        <span className="w-10 text-center tabular-nums">{zoom}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(400, z + 25))}
          className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-white/[0.07] hover:text-foreground"
        >
          +
        </button>
        {zoom !== 100 && (
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-white/[0.07] hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      <div className="slim-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <img
          src={dataUrl}
          alt="SVG preview"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
          className="max-h-full max-w-full object-contain transition-transform duration-100"
        />
      </div>
    </div>
  )
}

export function BinaryMediaViewer({ base64, mime, path }: { base64: string; mime: string; path: string }): React.JSX.Element {
  const url = useMemo(() => base64ToBlobUrl(base64, mime), [base64, mime])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  if (mime === 'application/pdf') {
    return <iframe title={path} src={url} className="h-full w-full flex-1 border-0 bg-[#1e1e1d]" />
  }
  if (mime.startsWith('audio/')) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <audio controls src={url} className="w-full max-w-[380px]" />
      </div>
    )
  }
  if (mime.startsWith('video/')) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
        <video controls src={url} className="max-h-full max-w-full rounded-[8px]" />
      </div>
    )
  }
  return <p className="p-4 text-[12px] text-muted-foreground">Binary file ({mime})</p>
}

