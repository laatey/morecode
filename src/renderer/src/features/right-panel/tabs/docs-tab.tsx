import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/icon-button'
import { Markdown } from '@/features/ai-assistant/message-parts'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import type { DocInfo, DocMatch, WorkspaceInfo } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { takeDocRequest } from '../docs-request'
import { TabButton, TabEmpty, TabToolbar } from './tab-kit'

/** README first, then by folder, then by name. */
const order = (a: DocInfo, b: DocInfo): number => {
  const rank = (d: DocInfo): number => (/^readme\./i.test(d.name) ? 0 : 1)
  return rank(a) - rank(b) || a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name)
}

const title = (name: string): string =>
  name.replace(/\.(md|mdx|markdown)$/i, '').replace(/[-_]+/g, ' ')

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Show a line of text with the searched words marked. */
function Marked({ text, query }: { text: string; query: string }): React.JSX.Element {
  const q = query.trim()
  if (!q) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, 'ig'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-[2px] bg-[#e5a54b]/25 text-[#f1d9a8]">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function DocViewer({
  doc,
  startEditing,
  onBack
}: {
  doc: DocInfo
  startEditing: boolean
  onBack: () => void
}): React.JSX.Element {
  const { ask, running } = useChatContext()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(startEditing)
  const [save, setSave] = useState<SaveState>('idle')
  const saved = useRef('')
  const latest = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void window.api.docs.read(doc.path).then((r) => {
      if (cancelled) return
      if (r.ok) {
        saved.current = r.text
        latest.current = r.text
        setText(r.text)
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [doc.path])

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current)
    const next = latest.current
    if (next === saved.current) return
    setSave('saving')
    const res = await window.api.docs.write(doc.path, next)
    if (res.ok) {
      saved.current = next
      setSave(latest.current === next ? 'saved' : 'saving')
    } else {
      setSave('error')
      toast(res.error)
    }
  }, [doc.path])

  // leaving the doc (back button, closing the tab) never loses the last keystrokes
  useEffect(() => () => void flush(), [flush])

  const change = (value: string): void => {
    latest.current = value
    setText(value)
    setSave('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }

  const status =
    save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved' : save === 'error' ? 'Not saved' : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar>
        <IconButton
          title="All docs"
          onClick={() => {
            void flush()
            onBack()
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </IconButton>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">{doc.path}</span>
        {status && (
          <span className={cn('shrink-0 text-[11.5px]', save === 'error' ? 'text-[#f0746c]' : 'text-muted-foreground')}>
            {status}
          </span>
        )}
        <div className="flex shrink-0 items-center rounded-[6px] bg-white/[0.06] p-0.5">
          {(
            [
              [false, 'Read'],
              [true, 'Edit']
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              disabled={text === null}
              onClick={() => setEditing(value)}
              className={cn(
                'cursor-pointer rounded-[4px] px-2 py-0.5 text-[11.5px] transition-colors disabled:opacity-40',
                editing === value ? 'bg-white/[0.12] text-[#ececea]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <TabButton
          disabled={running}
          onClick={() => {
            void flush()
            ask(`Read ${doc.path} and explain what it says in plain language.`)
          }}
          className="h-6 text-[11.5px]"
        >
          <Sparkles className="h-3 w-3" /> Ask AI
        </TabButton>
        <IconButton title="Open in your editor" onClick={() => void window.api.docs.open(doc.path)}>
          <ExternalLink className="h-3.5 w-3.5" />
        </IconButton>
      </TabToolbar>

      {error ? (
        <p className="p-5 text-[12.5px] text-[#e8b365]">{error}</p>
      ) : text === null ? (
        <p className="p-5 text-[12px] text-muted-foreground">Opening…</p>
      ) : editing ? (
        <textarea
          autoFocus
          value={text}
          spellCheck
          aria-label={`Edit ${doc.name}`}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              void flush()
            }
          }}
          placeholder="Start writing. Markdown works: # for a heading, - for a list."
          className="slim-scroll min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[12.5px] leading-[20px] text-[#d6d6d3] outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <div className="slim-scroll min-h-0 flex-1 select-text overflow-y-auto">
          <article className="mx-auto max-w-[680px] px-5 py-4 text-[13px] text-[#d6d6d3]">
            {text.trim() ? (
              <Markdown text={text} />
            ) : (
              <p className="text-[12px] text-muted-foreground">
                This doc is empty. Switch to Edit to start writing.
              </p>
            )}
          </article>
        </div>
      )}
    </div>
  )
}

/** The little name box at the top of the list when you press New doc. */
function NewDoc({
  onCreated,
  onCancel
}: {
  onCreated: (doc: DocInfo) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const res = await window.api.docs.create(name)
    setBusy(false)
    if (res.ok) onCreated(res.doc)
    else setError(res.error)
  }

  return (
    <div className="mx-1 mb-1.5 rounded-[8px] border border-white/[0.1] p-2.5">
      <label className="mb-1 block text-[12px] text-[#a8a8a6]" htmlFor="new-doc-name">
        Name your doc
      </label>
      <input
        id="new-doc-name"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create()
          if (e.key === 'Escape') onCancel()
        }}
        spellCheck={false}
        placeholder="notes, or docs/setup-guide"
        className="h-7 w-full rounded-[6px] bg-white/[0.06] px-2 text-[12.5px] text-[#ececea] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-[#3b82f6]/60"
      />
      {error ? (
        <p className="mt-1.5 text-[11.5px] text-[#e8b365]">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          It is saved as a .md file in your project. Add a folder name to put it in a subfolder.
        </p>
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        <TabButton onClick={onCancel}>Cancel</TabButton>
        <TabButton tone="primary" disabled={!name.trim() || busy} onClick={() => void create()}>
          Create
        </TabButton>
      </div>
    </div>
  )
}

/** "Docs": browse, search, write and read the guides and notes (Markdown files) in your project. */
export function DocsTab(): React.JSX.Element {
  const available = Boolean(window.api?.docs)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [docs, setDocs] = useState<DocInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<DocMatch[] | null>(null)
  const [open, setOpen] = useState<{ doc: DocInfo; edit: boolean } | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api?.docs) return
    setDocs(null)
    const [w, list] = await Promise.all([window.api.workspace.get(), window.api.docs.list()])
    setWorkspace(w)
    setDocs([...list].sort(order))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // another part of the app (like /init) asked for a file to be opened
  const [wanted, setWanted] = useState(0)
  useEffect(() => {
    const on = (): void => {
      void refresh()
      setWanted((n) => n + 1)
    }
    window.addEventListener('docs:open', on)
    return () => window.removeEventListener('docs:open', on)
  }, [refresh])
  useEffect(() => {
    if (!docs) return
    const req = takeDocRequest()
    if (!req) return
    const doc = docs.find((d) => d.path === req.path)
    if (doc) setOpen({ doc, edit: req.edit })
  }, [docs, wanted])

  // search inside the docs too, once a couple of letters are typed
  const q = query.trim()
  useEffect(() => {
    if (!window.api?.docs || q.length < 2) {
      setMatches(null)
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      void window.api.docs.search(q).then((m) => {
        if (!cancelled) setMatches(m)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [q])

  const chooseFolder = async (): Promise<void> => {
    const next = await window.api.workspace.choose()
    if (next) {
      setOpen(null)
      await refresh()
    }
  }

  const byPath = useMemo(() => new Map((docs ?? []).map((d) => [d.path, d])), [docs])

  const results = useMemo(() => {
    const map = new Map<string, DocMatch[]>()
    for (const m of matches ?? []) map.set(m.path, [...(map.get(m.path) ?? []), m])
    return [...map.entries()]
  }, [matches])

  const groups = useMemo(() => {
    const map = new Map<string, DocInfo[]>()
    for (const d of docs ?? []) map.set(d.dir, [...(map.get(d.dir) ?? []), d])
    return [...map.entries()]
  }, [docs])

  if (!available) {
    return (
      <TabEmpty icon={FileText} title="Docs need the desktop app">
        Open MoreCode as a desktop app to read and write the guides and notes in your project folder.
      </TabEmpty>
    )
  }
  if (open) {
    return (
      <DocViewer
        key={open.doc.path}
        doc={open.doc}
        startEditing={open.edit}
        onBack={() => {
          setOpen(null)
          void refresh()
        }}
      />
    )
  }

  const searching = q.length >= 2

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar>
        <button
          type="button"
          onClick={() => void chooseFolder()}
          title="Choose a different folder"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-left text-[12.5px] text-[#ececea] transition-colors hover:bg-white/[0.06]"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{workspace?.name ?? 'Project'}</span>
        </button>
        <IconButton title="Refresh" onClick={() => void refresh()}>
          <RefreshCw className={cn('h-3.5 w-3.5', docs === null && 'animate-spin')} />
        </IconButton>
        <TabButton onClick={() => setCreating(true)} className="h-6 text-[11.5px]">
          <Plus className="h-3 w-3" /> New doc
        </TabButton>
      </TabToolbar>

      <div className="shrink-0 px-3 pb-1 pt-2.5">
        <label className="flex h-7 items-center gap-2 rounded-[7px] bg-white/[0.06] px-2.5 text-[12px] focus-within:ring-1 focus-within:ring-[#3b82f6]/60">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names and contents"
            aria-label="Search docs"
            className="min-w-0 flex-1 bg-transparent text-[#ececea] outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {creating && (
          <div className="pt-2">
            <NewDoc
              onCancel={() => setCreating(false)}
              onCreated={(doc) => {
                setCreating(false)
                setOpen({ doc, edit: true })
              }}
            />
          </div>
        )}

        {docs === null ? (
          <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">Looking for docs…</p>
        ) : searching ? (
          matches === null ? (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
              Nothing matches “{q}”.
            </p>
          ) : (
            results.map(([path, hits]) => {
              const doc = byPath.get(path)
              return (
                <section key={path} className="mt-2">
                  <button
                    type="button"
                    disabled={!doc}
                    onClick={() => doc && setOpen({ doc, edit: false })}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.6] text-[#a8a8a6]" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">
                      <Marked text={path} query={q} />
                    </span>
                  </button>
                  {hits
                    .filter((h) => h.line > 0)
                    .map((h) => (
                      <button
                        key={`${h.path}:${h.line}`}
                        type="button"
                        onClick={() => doc && setOpen({ doc, edit: false })}
                        className="flex w-full cursor-pointer items-baseline gap-2 rounded-[6px] py-1 pl-8 pr-2 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[#77776f]">
                          {h.line}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#a8a8a6]">
                          <Marked text={h.text} query={q} />
                        </span>
                      </button>
                    ))}
                </section>
              )
            })
          )
        ) : docs.length === 0 ? (
          <TabEmpty
            icon={FileText}
            title="No docs yet"
            action={
              <div className="flex gap-1.5">
                <TabButton tone="primary" onClick={() => setCreating(true)}>
                  New doc
                </TabButton>
                <TabButton onClick={() => void chooseFolder()}>Choose a folder</TabButton>
              </div>
            }
          >
            Markdown files (like README.md) in this folder are listed here. You can also write a new
            one.
          </TabEmpty>
        ) : (
          groups.map(([dir, items]) => (
            <section key={dir || '.'} className="mt-2">
              <h3 className="px-2 pb-1 text-[11.5px] font-medium text-[#77776f]">{dir || 'Project'}</h3>
              {items.map((d) => (
                <button
                  key={d.path}
                  type="button"
                  onClick={() => setOpen({ doc: d, edit: false })}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.6] text-[#a8a8a6]" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">
                    {title(d.name)}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(d.modified, { addSuffix: true })}
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
