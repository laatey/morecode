import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, Search, X } from '@/components/icons'
import { FileIcon } from '@/components/file-icon'
import { SegmentedSwitch } from '@/components/segmented-switch'
import { Markdown } from '@/features/ai-assistant/message-parts'
import { languageFor } from '@/lib/highlight'
import { escapeCodeHtml, getCachedHighlight, highlightWithPierre } from '@/lib/pierre-highlight'
import { takeFilePreviewRequest } from '../file-preview-request'
import { useRightPanel } from '../store'
import type { TabContentProps } from '../types'
import {
  BinaryMediaViewer,
  DocxViewer,
  HtmlPreview,
  JsonTreeViewer,
  NotebookViewer,
  parseDelimited,
  SpreadsheetViewer,
  SvgPreview,
  XlsxViewer
} from './file-viewers'
import { TabEmpty } from './tab-kit'

const LINE = 19
const baseName = (path: string): string => path.split('/').pop() ?? path
const extOf = (path: string): string => {
  const b = baseName(path).toLowerCase()
  const idx = b.lastIndexOf('.')
  return idx >= 0 ? b.slice(idx) : ''
}

const TEXT_FILE =
  /\.(?:[cm]?[jt]sx?|css|scss|sass|less|html?|xml|svg|mdx?|markdown|txt|csv|tsv|jsonc?|jsonl|ipynb|ya?ml|toml|ini|env|py|rb|php|go|rs|java|kt|kts|swift|c|cc|cpp|cxx|h|hpp|sh|bash|zsh|fish|ps1|sql|graphql|gql|vue|svelte|astro|prisma|lock|gitignore|dockerignore|editorconfig)$/i
const RASTER_IMAGE_FILE = /\.(?:png|jpe?g|gif|webp)$/i
const BINARY_DOC_FILE = /\.(?:docx|xlsx|xls|ods|pdf|mp3|wav|ogg|m4a|mp4|webm|mov)$/i

const isTextFile = (path: string): boolean => {
  const b = baseName(path).toLowerCase()
  if (b === 'dockerfile' || b.startsWith('dockerfile.') || b.startsWith('.env') || b === 'makefile') return true
  return TEXT_FILE.test(path)
}

type PreviewKind = 'markdown' | 'csv' | 'tsv' | 'json' | 'jsonl' | 'ipynb' | 'svg' | 'html' | null

function richKindOf(path: string): PreviewKind {
  const ext = extOf(path)
  if (ext === '.md' || ext === '.mdx' || ext === '.markdown') return 'markdown'
  if (ext === '.csv') return 'csv'
  if (ext === '.tsv') return 'tsv'
  if (ext === '.json') return 'json'
  if (ext === '.jsonl') return 'jsonl'
  if (ext === '.ipynb') return 'ipynb'
  if (ext === '.svg') return 'svg'
  if (ext === '.html' || ext === '.htm') return 'html'
  return null
}

const PREVIEW_LABELS: Record<NonNullable<PreviewKind>, [string, string]> = {
  markdown: ['Preview', 'Code'],
  csv: ['Table', 'Code'],
  tsv: ['Table', 'Code'],
  json: ['Tree', 'Code'],
  jsonl: ['Tree', 'Code'],
  ipynb: ['Notebook', 'JSON'],
  svg: ['Preview', 'Code'],
  html: ['Preview', 'Code']
}

export function FilePreviewTab({ tabId }: TabContentProps): React.JSX.Element {
  const { setAutoTitle } = useRightPanel()
  const [path, setPath] = useState<string | null>(() => takeFilePreviewRequest())
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [binary, setBinary] = useState<{ base64: string; mime: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const dirty = saved !== null && draft !== saved
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  useEffect(() => {
    const open = (): void => {
      const next = takeFilePreviewRequest()
      if (!next) return
      if (dirtyRef.current && !window.confirm('You have unsaved changes in this file. Open another file and discard them?')) return
      setPath(next)
    }
    window.addEventListener('file-preview:open', open)
    return () => window.removeEventListener('file-preview:open', open)
  }, [])

  // the file's name lives on the tab itself, so there is no second header inside it
  useEffect(() => {
    if (path) setAutoTitle(tabId, `${baseName(path)}${dirty ? ' •' : ''}`)
  }, [path, dirty, tabId, setAutoTitle])

  useEffect(() => {
    if (!path) return
    let stale = false
    setSaved(null)
    setDraft('')
    setImage(null)
    setBinary(null)
    setError(null)
    setNote(null)
    setViewMode(richKindOf(path) ? 'preview' : 'code')

    const textFile = isTextFile(path)
    const imageFile = RASTER_IMAGE_FILE.test(path)
    const binaryFile = BINARY_DOC_FILE.test(path)

    if (textFile) {
      void window.api.workspace.readFile(path).then((result) => {
        if (stale) return
        if (result.ok) {
          setSaved(result.text)
          setDraft(result.text)
        } else setError(result.error)
      })
    } else if (imageFile) {
      void window.api.workspace.readImage(path).then((result) => {
        if (stale) return
        if (result.ok) setImage(result.dataUrl)
        else setError(result.error)
      })
    } else if (binaryFile && window.api.workspace.readBinary) {
      void window.api.workspace.readBinary(path).then((result) => {
        if (stale) return
        if (result.ok) setBinary({ base64: result.base64, mime: result.mime })
        else setError(result.error)
      })
    } else {
      setError('Preview is not available for this binary format. Open it in your default app below.')
    }
    return () => {
      stale = true
    }
  }, [path])

  const save = useCallback(async (): Promise<void> => {
    if (!path || saved === null || draft === saved) return
    const result = await window.api.workspace.writeFile(path, draft)
    if (result.ok) {
      setSaved(draft)
      setNote('Saved')
      window.setTimeout(() => setNote((n) => (n === 'Saved' ? null : n)), 1400)
    } else setNote(result.error)
  }, [path, draft, saved])

  if (!path) {
    return <TabEmpty icon={FileText} title="Choose a file">Select a file from Code mode to open it here.</TabEmpty>
  }

  const richKind = richKindOf(path)
  const ext = extOf(path)

  const renderRichPreview = (): React.JSX.Element => {
    if (richKind === 'markdown') {
      return (
        <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[13px] text-[#dcdcd8]">
          <div className="mx-auto max-w-[680px]">
            <Markdown text={draft} />
          </div>
        </div>
      )
    }
    if (richKind === 'csv' || richKind === 'tsv') {
      const rows = parseDelimited(draft, richKind === 'tsv' ? '\t' : ',')
      return <SpreadsheetViewer sheets={[{ name: baseName(path), rows }]} />
    }
    if (richKind === 'json' || richKind === 'jsonl') {
      return <JsonTreeViewer text={draft} jsonl={richKind === 'jsonl'} />
    }
    if (richKind === 'ipynb') {
      return <NotebookViewer text={draft} />
    }
    if (richKind === 'svg') {
      return <SvgPreview svg={draft} />
    }
    if (richKind === 'html') {
      return <HtmlPreview html={draft} />
    }
    return <CodeEditor path={path} value={draft} onChange={setDraft} onSave={() => void save()} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {richKind && saved !== null && !error && (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
          <SegmentedSwitch
            options={[
              { value: 'preview', label: PREVIEW_LABELS[richKind][0] },
              { value: 'code', label: PREVIEW_LABELS[richKind][1] }
            ]}
            value={viewMode}
            onChange={setViewMode}
            itemWidth={62}
            height={24}
          />
          {dirty && (
            <button
              type="button"
              onClick={() => void save()}
              className="cursor-pointer rounded-[5px] bg-[#2563eb] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#2f6fe0]"
            >
              Save
            </button>
          )}
        </div>
      )}

      {error ? (
        <p className="p-4 text-[12px] text-[#e8b365]">{error}</p>
      ) : isTextFile(path) && saved === null ? (
        <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
      ) : isTextFile(path) ? (
        richKind && viewMode === 'preview' ? (
          renderRichPreview()
        ) : (
          <CodeEditor path={path} value={draft} onChange={setDraft} onSave={() => void save()} />
        )
      ) : image ? (
        <div className="slim-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          <img src={image} alt={path} className="max-h-full max-w-full object-contain" />
        </div>
      ) : binary ? (
        ext === '.docx' ? (
          <DocxViewer base64={binary.base64} />
        ) : ext === '.xlsx' || ext === '.xls' || ext === '.ods' ? (
          <XlsxViewer base64={binary.base64} />
        ) : (
          <BinaryMediaViewer base64={binary.base64} mime={binary.mime} path={path} />
        )
      ) : (
        <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
      )}

      <div className="flex h-[26px] shrink-0 items-center gap-2 border-t border-white/[0.07] px-3 text-[11px] text-muted-foreground">
        <FileIcon name={baseName(path)} className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate" title={path}>
          {path.split('/').join(' › ')}
        </span>
        {(note || dirty) && (
          <span className={dirty && !note ? 'text-[#e8b365]' : 'text-[#5fd17a]'}>{note ?? 'Unsaved · Ctrl+S'}</span>
        )}
        <button
          type="button"
          title="Open in your editor"
          onClick={() => void window.api.workspace.openFile(path)}
          className="grid h-4 w-4 place-items-center rounded-[3px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }

/**
 * Code editor with Shiki syntax highlighting, in-file search (Ctrl/Cmd+F), auto-closing brackets,
 * Tab/Shift+Tab block indentation, and native undo/redo.
 */
function CodeEditor({
  path,
  value,
  onChange,
  onSave
}: {
  path: string
  value: string
  onChange: (next: string) => void
  onSave: () => void
}): React.JSX.Element {
  const area = useRef<HTMLTextAreaElement>(null)
  const findInput = useRef<HTMLInputElement>(null)
  const [caret, setCaret] = useState({ line: 1, col: 1 })
  const lang = languageFor(path)
  const [html, setHtml] = useState(() => getCachedHighlight(value, lang) ?? escapeCodeHtml(value))
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)

  const lineCount = value.split('\n').length
  const gutter = String(lineCount).length

  useEffect(() => {
    const cached = getCachedHighlight(value, lang)
    if (cached !== undefined) {
      setHtml(cached)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void highlightWithPierre(value, lang).then((next) => {
        if (!cancelled) setHtml(next)
      })
    }, 16)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [lang, value])

  const matches = useMemo(() => {
    const q = findQuery.toLowerCase()
    if (!q) return []
    const lower = value.toLowerCase()
    const out: number[] = []
    let pos = 0
    while (pos <= lower.length - q.length) {
      const idx = lower.indexOf(q, pos)
      if (idx === -1) break
      out.push(idx)
      pos = idx + Math.max(1, q.length)
    }
    return out
  }, [value, findQuery])

  const jumpToMatch = (idx: number): void => {
    if (!matches.length || !area.current) return
    const safeIdx = ((idx % matches.length) + matches.length) % matches.length
    setMatchIdx(safeIdx)
    const start = matches[safeIdx]
    const end = start + findQuery.length
    area.current.focus()
    area.current.setSelectionRange(start, end)
    const before = value.slice(0, start)
    const line = before.split('\n').length
    setCaret({ line, col: before.length - before.lastIndexOf('\n') })
  }

  const where = (): void => {
    const el = area.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const line = before.split('\n').length
    setCaret({ line, col: before.length - before.lastIndexOf('\n') })
  }

  const insert = (text: string): void => {
    area.current?.focus()
    document.execCommand('insertText', false, text)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSave()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      setFindOpen(true)
      window.setTimeout(() => findInput.current?.focus(), 10)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const { selectionStart: a, selectionEnd: b, value: v } = el
      if (a === b && !e.shiftKey) return insert('  ')
      const from = v.lastIndexOf('\n', a - 1) + 1
      const block = v.slice(from, b)
      const next = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ')
      el.setSelectionRange(from, b)
      insert(next)
      el.setSelectionRange(from, from + next.length)
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const { selectionStart: a, value: v } = el
      const start = v.lastIndexOf('\n', a - 1) + 1
      const indent = /^[ \t]*/.exec(v.slice(start, a))?.[0] ?? ''
      const open = /[{[(]$/.test(v.slice(start, a).trimEnd())
      e.preventDefault()
      insert(`\n${indent}${open ? '  ' : ''}`)
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && PAIRS[e.key]) {
      const { selectionStart: a, selectionEnd: b, value: v } = el
      if (a !== b) {
        e.preventDefault()
        const wrapped = `${e.key}${v.slice(a, b)}${PAIRS[e.key]}`
        insert(wrapped)
        el.setSelectionRange(a + 1, b + 1)
      }
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {findOpen && (
        <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.08] bg-[#252524] px-3 text-[11.5px]">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={findInput}
            type="text"
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value)
              setMatchIdx(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                jumpToMatch(e.shiftKey ? matchIdx - 1 : matchIdx + 1)
              } else if (e.key === 'Escape') {
                setFindOpen(false)
                area.current?.focus()
              }
            }}
            placeholder="Find in file…"
            className="h-6 min-w-0 flex-1 rounded-[5px] border border-white/[0.1] bg-white/[0.04] px-2 text-[11.5px] text-[#ececea] outline-none placeholder:text-[#77776f] focus:border-white/[0.24]"
          />
          <span className="min-w-[48px] text-center tabular-nums text-muted-foreground">
            {matches.length ? `${(matchIdx % matches.length) + 1}/${matches.length}` : '0/0'}
          </span>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false)
              area.current?.focus()
            }}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="slim-scroll min-h-0 flex-1 overflow-auto font-mono text-[12px]" style={{ lineHeight: `${LINE}px` }}>
        <div className="flex min-h-full w-max min-w-full">
          <div
            aria-hidden
            className="sticky left-0 z-10 shrink-0 select-none bg-background py-3 pl-3 pr-3 text-right text-[#5d5d5a]"
            style={{ minWidth: `${gutter + 3}ch` }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className={i + 1 === caret.line ? 'text-[#a8a8a6]' : undefined}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 py-3 pr-6">
            <pre className="pointer-events-none m-0 whitespace-pre text-[#d6d6d3]" aria-hidden>
              <code className="pierre-code" dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
            <textarea
              ref={area}
              value={value}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-label={`Edit ${path}`}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={where}
              onClick={where}
              onSelect={where}
              className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre bg-transparent py-3 pr-6 font-[inherit] text-transparent caret-[#ececea] outline-none selection:bg-[#3b82f6]/30"
              style={{ lineHeight: `${LINE}px`, tabSize: 2 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
