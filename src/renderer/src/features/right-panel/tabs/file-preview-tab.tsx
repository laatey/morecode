import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText } from '@/components/icons'
import { FileIcon } from '@/components/file-icon'
import { languageFor } from '@/lib/highlight'
import { escapeCodeHtml, highlightWithPierre } from '@/lib/pierre-highlight'
import { takeFilePreviewRequest } from '../file-preview-request'
import { useRightPanel } from '../store'
import type { TabContentProps } from '../types'
import { TabEmpty } from './tab-kit'

const LINE = 19
const baseName = (path: string): string => path.split('/').pop() ?? path

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|scss|sass|less|html?|xml|mdx?|txt|ya?ml|toml|ini|env|py|rb|php|go|rs|java|kt|kts|swift|c|cc|cpp|cxx|h|hpp|sh|bash|zsh|fish|ps1|sql|graphql|gql|vue|svelte|astro|prisma|lock)$/i
const isTextFile = (path: string): boolean => TEXT_FILE.test(path)

export function FilePreviewTab({ tabId }: TabContentProps): React.JSX.Element {
  const { setAutoTitle } = useRightPanel()
  const [path, setPath] = useState<string | null>(() => takeFilePreviewRequest())
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
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
    setError(null)
    setNote(null)
    const textFile = isTextFile(path)
    const imageFile = /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
    const read = textFile ? window.api.workspace.readFile(path) : imageFile ? window.api.workspace.readImage(path) : null
    if (!read) {
      setError('Preview is available for images and editable text files. Open other formats in your editor.')
      return
    }
    void read.then((result) => {
      if (stale) return
      if (result.ok && 'text' in result) {
        setSaved(result.text)
        setDraft(result.text)
      } else if (result.ok && 'dataUrl' in result) {
        setImage(result.dataUrl)
      } else setError(result.error)
    })
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <p className="p-4 text-[12px] text-[#e8b365]">{error}</p>
      ) : isTextFile(path) && saved === null ? (
        <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
      ) : isTextFile(path) ? (
        <CodeEditor path={path} value={draft} onChange={setDraft} onSave={() => void save()} />
      ) : image ? (
        <div className="slim-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          <img src={image} alt={path} className="max-h-full max-w-full object-contain" />
        </div>
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

/**
 * A small real editor with no extra packages: a transparent text box sits exactly on top of the
 * highlighted code, so you type in the text box and see the colours underneath. Tab indents,
 * Enter keeps the indent, Ctrl/Cmd+S saves, and the browser's own undo keeps working.
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
  const [caret, setCaret] = useState({ line: 1, col: 1 })
  const [html, setHtml] = useState(() => escapeCodeHtml(value))
  const lineCount = value.split('\n').length
  const gutter = String(lineCount).length

  useEffect(() => {
    let cancelled = false
    setHtml(escapeCodeHtml(value))
    void highlightWithPierre(value, languageFor(path)).then((next) => {
      if (!cancelled) setHtml(next)
    })
    return () => {
      cancelled = true
    }
  }, [path, value])

  const where = (): void => {
    const el = area.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const line = before.split('\n').length
    setCaret({ line, col: before.length - before.lastIndexOf('\n') })
  }

  const insert = (text: string): void => {
    // execCommand keeps undo/redo working, which setting .value would break
    area.current?.focus()
    document.execCommand('insertText', false, text)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSave()
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
    }
  }

  return (
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
  )
}
