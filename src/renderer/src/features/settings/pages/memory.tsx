import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Folder, Globe, Pencil, Pin, PinOff, Search, Trash2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Btn, Group, Page, Row, Segmented } from '../kit'
import { useSettings, type Rule } from '../settings-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { MemoryImport } from './memory-import'

type View = Awaited<ReturnType<Window['api']['memory']['list']>>
type Note = View['global'][number]
type Result = { ok: true; view: View } | { ok: false; error: string }
type Area = { scope: 'global' } | { scope: 'project'; path: string; name: string }

const MODES: { value: Rule; label: string }[] = [
  { value: 'block', label: 'Off' },
  { value: 'ask', label: 'Ask before saving' },
  { value: 'allow', label: 'Auto' }
]

const MODE_NOTE: Record<Rule, string> = {
  block: 'The AI never sees your notes and cannot save new ones, in any chat.',
  ask: 'The AI can suggest something to remember. You see a card with Save or Skip each time.',
  allow: 'The AI saves durable facts and preferences on its own. You can still review or delete anything.'
}

const SHOW_SEARCH_FROM = 6

const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const plural = (n: number): string => `${n} note${n === 1 ? '' : 's'}`

/** "today", "yesterday", "Nov 4", or "Nov 4, 2025" for notes from another year. */
function when(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const now = new Date()
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

const byImportance = (a: Note, b: Note): number => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date)

export function MemoryPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const ws = useWorkspace()
  const here = ws.groups.find((g) => g.id === ws.active.projectId)?.folder
  const [area, setArea] = useState<Area | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [viewFor, setViewFor] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const api = typeof window !== 'undefined' ? window.api?.memory : undefined
  // the project whose notes the view holds: the one being looked at, otherwise the one you are working in
  const listPath = area?.scope === 'project' ? area.path : here

  const refresh = useCallback(async () => {
    if (!api) return
    setView(await api.list(listPath))
    setViewFor(listPath)
  }, [api, listPath])
  useEffect(() => void refresh(), [refresh])

  if (!api) return <Page title="Memory" description="Memory is only available in the desktop app." children={null} />

  const apply = async (r: Promise<Result>): Promise<void> => {
    const res = await r
    if (res.ok) {
      setError(null)
      setView(res.view)
      setViewFor(listPath)
    } else setError(res.error)
  }

  /* ---------- one area: everywhere, or one project ---------- */
  if (area) {
    const isProject = area.scope === 'project'
    const path = isProject ? area.path : undefined
    const scope = isProject ? 'project' : 'global'
    const ready = view !== null && (!isProject || viewFor === listPath)
    const notes = ready ? (isProject ? view.project : view.global) : []
    return (
      <AreaView
        title={isProject ? area.name : 'Everywhere'}
        icon={isProject ? <Folder className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        subtitle={isProject ? `Facts about ${area.name}, such as its stack and conventions. They load only in chats inside this project.` : 'Personal preferences such as language and tone. Every chat with memory on sees these.'}
        notes={notes}
        loading={!ready}
        error={error}
        onBack={() => {
          setError(null)
          setArea(null)
        }}
        onAdd={(text) => apply(api.add(scope, path, text))}
        onEdit={(id, patch) => apply(api.edit(scope, path, id, patch))}
        onRemove={(id) => apply(api.remove(scope, path, id))}
        onClear={() => apply(api.clear(scope, path))}
      />
    )
  }

  /* ---------- overview ---------- */
  const mode = settings.rules.memory
  const known = view?.projects ?? []
  // projects with notes, plus the one you are in even when it has none yet
  const projects = [
    ...(here && !known.some((p) => p.path === here) ? [{ path: here, name: nameOf(here), count: 0, updated: '', preview: '' }] : []),
    ...known
  ]
  const global = [...(view?.global ?? [])].sort(byImportance)
  const globalUpdated = global.reduce((m, n) => (n.date > m ? n.date : m), '')

  return (
    <Page
      title="Memory"
      description="Notes the AI can use across chats. They are plain files on this computer, never sent anywhere except as part of a chat that has memory on."
    >
      <Group title="Saving" note={MODE_NOTE[mode]}>
        <Row title="Memory" description="Applies to every chat. You can also switch it off for one chat from the message box, or type /fresh.">
          <Segmented label="Memory mode" value={mode} options={MODES} onChange={(v) => set({ rules: { ...settings.rules, memory: v } })} />
        </Row>
      </Group>

      <MemoryImport
        api={api}
        projectPath={here}
        projectName={here ? nameOf(here) : null}
        onImported={(v) => {
          setView(v)
          setViewFor(here)
        }}
      />

      <section>
        <h3 className="pb-2 text-[13px] font-medium text-foreground">Saved notes</h3>
        <div className="divide-y divide-border/50 overflow-hidden rounded-[10px] border border-border">
          <AreaRow
            icon={<Globe className="h-4 w-4" />}
            name="Everywhere"
            preview={global[0]?.text ?? 'Nothing saved yet'}
            count={global.length}
            updated={globalUpdated}
            onOpen={() => setArea({ scope: 'global' })}
          />
          {projects.map((p) => (
            <AreaRow
              key={p.path}
              icon={<Folder className="h-4 w-4" />}
              name={p.name}
              preview={p.preview || 'Nothing saved yet'}
              count={p.count}
              updated={p.updated}
              onOpen={() => setArea({ scope: 'project', path: p.path, name: p.name })}
            />
          ))}
        </div>
        <p className="px-1 pt-2 text-[12px] leading-relaxed text-faint-foreground">
          Everywhere applies to every chat. A project’s notes load only in chats inside that project.
        </p>
      </section>
    </Page>
  )
}

function AreaRow({
  icon,
  name,
  preview,
  count,
  updated,
  onOpen
}: {
  icon: React.ReactNode
  name: string
  preview: string
  count: number
  updated: string
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035] focus-visible:outline-none"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="w-[120px] shrink-0 truncate text-[12.5px] font-medium text-foreground">{name}</span>
      <span className={cn('min-w-0 flex-1 truncate text-[12px]', count ? 'text-muted-foreground' : 'text-faint-foreground')}>{preview}</span>
      <span className="shrink-0 text-[11.5px] text-faint-foreground">
        {count ? `${plural(count)} · ${when(updated)}` : 'Empty'}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </button>
  )
}

function IconBtn({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        danger ? 'hover:bg-destructive/15 hover:text-destructive' : 'hover:bg-foreground/[0.08] hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function AreaView({
  title,
  icon,
  subtitle,
  notes,
  loading,
  error,
  onBack,
  onAdd,
  onEdit,
  onRemove,
  onClear
}: {
  title: string
  icon: React.ReactNode
  subtitle: string
  notes: Note[]
  loading: boolean
  error: string | null
  onBack: () => void
  onAdd: (text: string) => Promise<void>
  onEdit: (id: string, patch: { text?: string; pinned?: boolean }) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onClear: () => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const sorted = [...notes].sort(byImportance)
  const q = query.trim().toLowerCase()
  const shown = q ? sorted.filter((n) => n.text.toLowerCase().includes(q)) : sorted

  return (
    <div className="w-full space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Memory
      </button>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-medium text-foreground">
            <span className="text-muted-foreground">{icon}</span>
            <span className="truncate">{title}</span>
          </h2>
          <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {notes.length > 0 &&
          (confirmClear ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Delete all {notes.length}?</span>
              <Btn variant="default" onClick={() => setConfirmClear(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => void onClear().then(() => setConfirmClear(false))}>Delete all</Btn>
            </div>
          ) : (
            <Btn variant="default" className="shrink-0" onClick={() => setConfirmClear(true)}>Delete all</Btn>
          ))}
      </header>

      {error && <p className="rounded-md border border-destructive/25 bg-destructive/30 p-2 text-[12px] text-destructive">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = draft.trim()
          if (t) void onAdd(t).then(() => setDraft(''))
        }}
      >
        <label className="relative min-w-0 flex-1">
          <input
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note, for example “I use pnpm”"
            aria-label="New note"
            className="h-8 w-full rounded-[7px] border border-border bg-transparent px-3 text-[12px] text-foreground outline-none placeholder:text-faint-foreground focus:border-border-strong"
          />
        </label>
        <Btn type="submit" variant={draft.trim() ? 'primary' : 'default'} disabled={!draft.trim()} className="px-3.5 text-[12px]">Add</Btn>
      </form>

      {notes.length >= SHOW_SEARCH_FROM && (
        <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 focus-within:border-border-strong">
          <Search className="h-3.5 w-3.5 shrink-0 text-faint-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${plural(notes.length)}`}
            aria-label="Search notes"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-faint-foreground"
          />
        </label>
      )}

      {loading ? (
        <p className="px-1 text-[12px] text-faint-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-faint-foreground">
          {q ? 'No notes match that search.' : 'Nothing saved yet. Add a note above, or let the AI suggest one while you chat.'}
        </p>
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden rounded-[10px] border border-border">
          {shown.map((n) => (
            <div key={n.id} className="group px-4 py-3">
              {editing?.id === n.id ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    rows={2}
                    value={editing.text}
                    maxLength={300}
                    onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditing(null)
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void onEdit(n.id, { text: editing.text }).then(() => setEditing(null))
                      }
                    }}
                    className="w-full resize-none rounded-md border border-border-strong bg-transparent px-2.5 py-1.5 text-[12.5px] leading-5 text-foreground outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-faint-foreground">{editing.text.length}/300 · Enter to save, Esc to cancel</span>
                    <div className="flex gap-2">
                      <Btn variant="default" onClick={() => setEditing(null)}>Cancel</Btn>
                      <Btn variant="primary" onClick={() => void onEdit(n.id, { text: editing.text }).then(() => setEditing(null))}>Save</Btn>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-[19px] text-foreground">{n.text}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-faint-foreground">
                      <span>Saved {when(n.date)}</span>
                      {n.pinned && (
                        <span className="inline-flex items-center gap-1 text-link">
                          <Pin className="h-3 w-3" />
                          Always on
                        </span>
                      )}
                      {n.stale && <span className="text-warning">Old · the AI is told to verify it</span>}
                    </p>
                  </div>
                  {deleting === n.id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[12px] text-muted-foreground">Delete this note?</span>
                      <Btn variant="default" onClick={() => setDeleting(null)}>Cancel</Btn>
                      <Btn variant="danger" onClick={() => void onRemove(n.id).then(() => setDeleting(null))}>Delete</Btn>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <IconBtn
                        label={n.pinned ? 'Unpin: the AI looks it up only when needed' : 'Pin: always shown to the AI'}
                        onClick={() => void onEdit(n.id, { pinned: !n.pinned })}
                      >
                        {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </IconBtn>
                      <IconBtn label="Edit" onClick={() => setEditing({ id: n.id, text: n.text })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label="Delete" danger onClick={() => setDeleting(n.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
