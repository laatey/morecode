import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from '@/components/icons'
import { toast } from 'sonner'
import { Btn, TextInput, Toggle } from '@/features/settings/kit'
import { useSkills } from '@/features/skills/skills-store'
import {
  CATALOG,
  getSkillBundle,
  nameProblem,
  skillIcon,
  slugify,
  type CustomCommand,
  type Skill
} from '@/features/skills/skills-data'
import { parseUploadedSkillFiles } from '@/features/skills/skill-upload'
import { Markdown } from '../message-parts'
import { languageFor } from '@/lib/highlight'
import { escapeCodeHtml, getCachedHighlight, highlightWithPierre } from '@/lib/pierre-highlight'
import { cn } from '@/lib/utils'
import { SegmentedSwitch } from '@/components/segmented-switch'
import { MiniTabs, PanelFrame } from './ui'

type Tab = 'mine' | 'discover' | 'commands'
type View =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string | null }
  | { name: 'command'; id: string | null }

/** Puts a message in the composer so the person can adjust it before sending. */
const prefill = (text: string): void => {
  window.dispatchEvent(new CustomEvent('assistant:prefill', { detail: text }))
}

function Tile({ icon, size = 'sm' }: { icon: string; size?: 'sm' | 'lg' }): React.JSX.Element {
  const Icon = skillIcon(icon)
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center bg-secondary text-foreground',
        size === 'lg' ? 'h-10 w-10 rounded-[10px]' : 'h-8 w-8 rounded-[8px]'
      )}
    >
      <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
    </span>
  )
}

const label = 'mb-1 block text-[12px] font-medium text-foreground'
const area =
  'slim-scroll w-full resize-none rounded-[5px] border border-border bg-background px-2.5 py-2 text-[12.5px] leading-[18px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary'

/** Skills library, the person's own skills, and their own / commands. */
export function SkillsPanel({
  initialTab,
  onClose,
  embedded
}: {
  initialTab: string
  onClose: () => void
  /** Shown inside the Customize page instead of as a floating panel. */
  embedded?: boolean
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(
    initialTab === 'commands' ? 'commands' : initialTab === 'discover' ? 'discover' : 'mine'
  )
  const [view, setView] = useState<View>({ name: 'list' })
  const back = (): void => setView({ name: 'list' })

  const title =
    view.name === 'detail'
      ? 'Skill'
      : view.name === 'edit'
        ? view.id
          ? 'Edit skill'
          : 'New skill'
        : view.name === 'command'
          ? view.id
            ? 'Edit command'
            : 'New command'
          : tab === 'commands'
            ? 'Your commands'
            : 'Skills'

  return (
    <PanelFrame title={title} onClose={onClose} width={440} maxHeight="60%" embedded={embedded}>
      {view.name === 'list' && (
        <ListView tab={tab} setTab={setTab} setView={setView} onClose={onClose} embedded={embedded} />
      )}
      {view.name === 'detail' && (
        <DetailView id={view.id} setView={setView} onBack={back} onClose={onClose} />
      )}
      {view.name === 'edit' && (
        <SkillEditor
          id={view.id}
          onBack={back}
          onSaved={(id) => setView({ name: 'detail', id })}
          onClose={onClose}
        />
      )}
      {view.name === 'command' && <CommandEditor id={view.id} onBack={back} />}
    </PanelFrame>
  )
}

function ListView({
  tab,
  setTab,
  setView,
  onClose,
  embedded
}: {
  tab: Tab
  setTab: (t: Tab) => void
  setView: (v: View) => void
  onClose: () => void
  embedded?: boolean
}): React.JSX.Element {
  const sk = useSkills()
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const filePicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addOpen) return
    const onDown = (e: MouseEvent): void => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [addOpen])

  const handleUpload = async (files: FileList | File[] | null): Promise<void> => {
    if (!files || files.length === 0) return
    try {
      const taken = sk.all.map((s) => s.id)
      const created = await parseUploadedSkillFiles(files, taken)
      sk.saveSkill(created)
      toast.success(`Imported “${created.name}” (${Object.keys(created.bundle ?? {}).length} files)`)
      setView({ name: 'detail', id: created.id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import skill package')
    }
  }

  const q = query.trim().toLowerCase()
  const match = (s: Skill): boolean =>
    !q || `${s.name} ${s.id} ${s.description} ${s.category}`.toLowerCase().includes(q)

  const mine = sk.all.filter((s) => sk.isInstalled(s.id) && match(s))
  const discoverList = sk.all.filter((s) => match(s))

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files)
      }}
      className="relative"
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[12px] border border-dashed border-primary/60 bg-inset/90 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Package className="h-5 w-5 text-link" />
            <span className="text-[13px] font-medium text-foreground">Drop a .skill, .zip, SKILL.md, or skill files to import</span>
          </div>
        </div>
      )}

      {/* Hidden inputs for .zip / .md / .json upload and folder upload */}
      <input
        ref={filePicker}
        type="file"
        accept=".skill,.zip,.md,.mdx,.json,.yaml,.yml,.txt"
        multiple
        hidden
        onChange={(e) => {
          void handleUpload(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={folderPicker}
        type="file"
        // @ts-expect-error webkitdirectory is supported in Chromium/Electron
        webkitdirectory=""
        directory=""
        multiple
        hidden
        onChange={(e) => {
          void handleUpload(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <MiniTabs
          value={tab}
          onChange={(t) => {
            setTab(t)
            setQuery('')
          }}
          options={[
            { value: 'mine', label: `Yours${mine.length && !q ? ` · ${mine.length}` : ''}` },
            { value: 'discover', label: 'Discover' },
            { value: 'commands', label: 'Commands' }
          ]}
        />

        <div className="flex items-center gap-2">
          {tab !== 'commands' && (
            <div className="relative w-[190px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint-foreground" />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search skills"
                aria-label="Search skills"
                className="h-8 pl-7"
              />
            </div>
          )}

          <div ref={addRef} className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((o) => !o)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] bg-foreground px-3 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {addOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-[225px] rounded-[9px] border border-border bg-card p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    filePicker.current?.click()
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07]"
                >
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <div className="font-medium leading-tight">Upload skill (.skill, .zip or .md)</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Import a .skill package, zip or SKILL.md</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    folderPicker.current?.click()
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07]"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <div className="font-medium leading-tight">Upload skill folder</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Select a folder containing SKILL.md files</div>
                  </div>
                </button>
                <div className="my-1 h-px bg-foreground/[0.07]" />
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    setView({ name: 'edit', id: null })
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07]"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Write a new skill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    setView({ name: 'command', id: null })
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07]"
                >
                  <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>New slash command</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === 'mine' &&
        (mine.length === 0 ? (
          <Empty
            text={q ? `No skills match “${query}”.` : 'You have not added any skills yet. Drop a .skill, .zip or SKILL.md here, or browse Discover.'}
            action={
              !q && (
                <div className="flex items-center gap-2">
                  <Btn onClick={() => filePicker.current?.click()}>Upload .skill / .zip / SKILL.md</Btn>
                  <Btn onClick={() => setTab('discover')}>Browse Discover</Btn>
                </div>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[10px] border border-border">
            {mine.map((s) => (
              <SkillRow
                key={s.id}
                skill={s}
                custom={s.source === 'custom'}
                onOpen={() => setView({ name: 'detail', id: s.id })}
                right={
                  <Toggle
                    label={`${s.name} on or off`}
                    checked={sk.isEnabled(s.id)}
                    onChange={(on) => sk.setEnabled(s.id, on)}
                  />
                }
              />
            ))}
          </ul>
        ))}

      {tab === 'discover' && (
        <div>
          <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-faint-foreground">Recommended</div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {discoverList.map((s) => {
              const added = sk.isInstalled(s.id)
              return (
                <div
                  key={s.id}
                  onClick={() => setView({ name: 'detail', id: s.id })}
                  className="group flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3.5 transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
                >
                  <Tile icon={s.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium text-foreground">{s.name}</span>
                      <div
                        className="flex shrink-0 items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!added) sk.install(s.id)
                            window.dispatchEvent(new CustomEvent('skill:try-in-chat', { detail: `/${s.id} ` }))
                            onClose()
                          }}
                          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[6px] bg-foreground/[0.08] px-2 text-[11.5px] text-foreground transition-colors hover:bg-foreground/[0.14]"
                        >
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span>Try</span>
                        </button>
                        <button
                          type="button"
                          aria-label={added ? `${s.name} added` : `Add ${s.name}`}
                          onClick={() => {
                            if (added) {
                              setView({ name: 'detail', id: s.id })
                            } else {
                              sk.install(s.id)
                              toast.success(`${s.name} added`)
                            }
                          }}
                          className={cn(
                            'grid h-6 w-6 cursor-pointer place-items-center rounded-[6px] transition-colors',
                            added
                              ? 'bg-success/15 text-success'
                              : 'bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.14]'
                          )}
                        >
                          {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">
                      {s.description}
                    </p>
                    <div className="mt-2 text-[11px] text-faint-foreground">
                      by {s.author ?? 'MoreCode'}
                      {s.installs ? ` · ${s.installs}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'commands' && (
        <div>
          <p className="mb-3 text-[12.5px] leading-5 text-muted-foreground">
            Save a message you send often as your own command. Type{' '}
            <span className="text-soft-foreground">/name</span> and it is sent for you.
          </p>
          {sk.commands.length === 0 ? (
            <Empty text="No commands yet." />
          ) : (
            <ul className="-mx-1">
              {sk.commands.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setView({ name: 'command', id: c.id })}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] text-foreground">/{c.id}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {c.description || c.prompt}
                      </span>
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-faint-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!embedded && (
        <div className="mt-4 flex justify-end pt-3">
          <Btn onClick={onClose}>Done</Btn>
        </div>
      )}
    </div>
  )
}

function SkillRow({
  skill,
  custom,
  right,
  onOpen
}: {
  skill: Skill
  custom?: boolean
  right: React.ReactNode
  onOpen: () => void
}): React.JSX.Element {
  const fileCount = Object.keys(getSkillBundle(skill)).length
  return (
    <li className="flex items-center gap-1 pr-3 transition-colors hover:bg-foreground/[0.03]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-left"
      >
        <Tile icon={skill.icon} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            {skill.name}
            {custom && (
              <span className="rounded-full border border-border px-1.5 text-[10px] font-medium leading-[15px] text-soft-foreground">
                Yours
              </span>
            )}
            <span className="text-[11px] font-normal text-faint-foreground">{fileCount} files</span>
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">{skill.description}</span>
        </span>
      </button>
      <span className="shrink-0">{right}</span>
    </li>
  )
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border px-6 py-10 text-center text-[12.5px] leading-5 text-muted-foreground">
      {text}
      {action}
    </div>
  )
}

function PierreFileView({ path, code }: { path: string; code: string }): React.JSX.Element {
  const language = languageFor(path)
  const [html, setHtml] = useState(() => getCachedHighlight(code, language) ?? escapeCodeHtml(code))

  useEffect(() => {
    const cached = getCachedHighlight(code, language)
    if (cached !== undefined) {
      setHtml(cached)
      return
    }
    let cancelled = false
    setHtml(escapeCodeHtml(code))
    void highlightWithPierre(code, language).then((next) => {
      if (!cancelled) setHtml(next)
    })
    return () => {
      cancelled = true
    }
  }, [code, language])

  return (
    <pre className="whitespace-pre font-mono text-[12px] leading-[20px] text-soft-foreground">
      <code className="pierre-code bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}

/* ---------------- Tree Builder for DetailView ---------------- */

type TreeNode =
  | { kind: 'folder'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string }

function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const fullPath of [...paths].sort()) {
    const parts = fullPath.split('/').filter(Boolean)
    let level = root
    let currentPath = ''
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      currentPath = currentPath ? `${currentPath}/${seg}` : seg
      const isLast = i === parts.length - 1
      if (isLast) {
        level.push({ kind: 'file', name: seg, path: fullPath })
      } else {
        let folder = level.find(
          (n): n is Extract<TreeNode, { kind: 'folder' }> => n.kind === 'folder' && n.name === seg
        )
        if (!folder) {
          folder = { kind: 'folder', name: seg, path: currentPath, children: [] }
          level.push(folder)
        }
        level = folder.children
      }
    }
  }

  // Sort folders first, then files alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((n) => (n.kind === 'folder' ? { ...n, children: sortNodes(n.children) } : n))

  return sortNodes(root)
}

function stripYamlFrontmatter(raw: string): { meta: Record<string, string> | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim())
  if (!m) return { meta: null, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/.exec(line.trim())
    if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').trim()
  }
  return { meta: Object.keys(meta).length ? meta : null, body: m[2] }
}

function DetailView({
  id,
  setView,
  onBack,
  onClose
}: {
  id: string
  setView: (v: View) => void
  onBack: () => void
  onClose: () => void
}): React.JSX.Element {
  const sk = useSkills()
  const skill = sk.all.find((s) => s.id === id) ?? CATALOG.find((s) => s.id === id)
  const [subTab, setSubTab] = useState<'overview' | 'contents' | 'skills'>('overview')
  const [mode, setMode] = useState<'preview' | 'code'>('preview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)
  const [fileFilter, setFileFilter] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const bundle = useMemo(() => (skill ? getSkillBundle(skill) : {}), [skill])
  const filePaths = useMemo(() => Object.keys(bundle).sort(), [bundle])
  const defaultFile =
    filePaths.find((p) => /(?:^|\/)README\.md$/i.test(p)) ??
    filePaths.find((p) => /\.md$/i.test(p)) ??
    filePaths[0] ??
    'README.md'
  const tree = useMemo(() => buildFileTree(filePaths), [filePaths])

  const subSkills = useMemo(() => {
    if (!skill) return []
    const found = filePaths
      .filter((p) => /skills\/[^/]+\/SKILL\.md$/i.test(p))
      .map((p) => {
        const subId = p.split('/')[1]
        const { meta, body } = stripYamlFrontmatter(bundle[p] ?? '')
        const firstLine = body
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#'))
        return { id: subId, path: p, description: meta?.description || firstLine || skill.description }
      })
    return found.length > 0 ? found : [{ id: skill.id, path: defaultFile, description: skill.description }]
  }, [filePaths, bundle, skill, defaultFile])

  if (!skill) {
    return (
      <div>
        <BackLink onBack={onBack} />
        <div className="mt-3">
          <Empty text="This skill no longer exists." />
        </div>
      </div>
    )
  }

  const activeFile = selectedFile && bundle[selectedFile] !== undefined ? selectedFile : defaultFile
  const rawContent = bundle[activeFile] ?? ''
  const isMarkdown = /\.(md|mdx)$/i.test(activeFile)
  const { meta: frontmatter, body: markdownBody } = stripYamlFrontmatter(rawContent)

  const installed = sk.isInstalled(id)
  const enabled = installed && sk.isEnabled(id)
  const custom = skill.source === 'custom'
  const author = skill.author ?? (custom ? 'You' : 'MoreCode')
  const version = skill.version ?? '1.0.0'
  const updatedAt = skill.updatedAt ?? 'Oct 29'
  const overviewDoc = bundle['README.md'] ?? `${skill.instructions}`

  const toggleFolder = (path: string): void => setCollapsedFolders((prev) => ({ ...prev, [path]: !prev[path] }))

  const tryInChat = (): void => {
    if (!installed) sk.install(id)
    window.dispatchEvent(new CustomEvent('skill:try-in-chat', { detail: `/${skill.id} ` }))
    onClose()
  }

  const exportBundle = (): void => {
    const blob = new Blob([JSON.stringify({ skill, bundle }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${skill.id}-skill.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${skill.id}-skill.json`)
  }

  const copyFile = (): void => {
    void navigator.clipboard?.writeText(rawContent).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  const renderTree = (nodes: TreeNode[], depth = 0): React.JSX.Element[] =>
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const isClosed = Boolean(collapsedFolders[node.path])
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              className="flex h-[26px] w-full cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 text-left text-[12.5px] text-soft-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              <ChevronRight
                className={cn('h-3 w-3 shrink-0 text-faint-foreground transition-transform duration-150', !isClosed && 'rotate-90')}
              />
              {isClosed ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {!isClosed && (
              <div className="ml-[13px] border-l border-border/70 pl-1.5">{renderTree(node.children, depth + 1)}</div>
            )}
          </div>
        )
      }
      return <FileRow key={node.path} path={node.path} name={node.name} />
    })

  const FileRow = ({ path, name, hint }: { path: string; name: string; hint?: string }): React.JSX.Element => {
    const active = path === activeFile
    const Icon = /\.(md|mdx|txt)$/i.test(name) ? FileText : FileCode2
    return (
      <button
        type="button"
        onClick={() => setSelectedFile(path)}
        className={cn(
          'relative flex h-[26px] w-full cursor-pointer items-center gap-2 rounded-[5px] pl-[22px] pr-1.5 text-left text-[12.5px] transition-colors',
          active
            ? 'bg-foreground/[0.08] text-foreground'
            : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-foreground' : 'text-faint-foreground')} />
        <span className="truncate">{name}</span>
        {hint && <span className="ml-auto truncate pl-2 text-[11px] text-faint-foreground">{hint}</span>}
      </button>
    )
  }

  const fileQuery = fileFilter.trim().toLowerCase()
  const filteredPaths = fileQuery ? filePaths.filter((p) => p.toLowerCase().includes(fileQuery)) : []
  const lineCount = rawContent ? rawContent.split(/\r?\n/).length : 0
  const byteSize = new Blob([rawContent]).size
  const sizeLabel = byteSize >= 1024 ? `${(byteSize / 1024).toFixed(1)} KB` : `${byteSize} B`
  const fileName = activeFile.split('/').pop() ?? activeFile
  const fileDir = activeFile.includes('/') ? activeFile.slice(0, activeFile.lastIndexOf('/')) : ''

  const downloadFile = (): void => {
    const url = URL.createObjectURL(new Blob([rawContent], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const menuItem =
    'flex w-full cursor-pointer items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07]'

  return (
    <div>
      <BackLink onBack={onBack} />

      {/* Header */}
      <header className="mt-4 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-border bg-secondary text-foreground">
          {React.createElement(skillIcon(skill.icon), { className: 'h-5 w-5' })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-foreground">{skill.name}</h2>
            {custom && (
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[10.5px] font-medium leading-[16px] text-soft-foreground">
                Yours
              </span>
            )}
            {installed && (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 text-[11px] font-medium',
                  enabled ? 'text-success' : 'text-faint-foreground'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-success' : 'bg-faint-foreground')} />
                {enabled ? 'On' : 'Off'}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{skill.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint-foreground">
            <code className="rounded-[5px] bg-foreground/[0.06] px-1.5 py-px font-mono text-[11px] text-soft-foreground">
              /{skill.id}
            </code>
            <span>by {author}</span>
            <span aria-hidden>·</span>
            <span>v{version.replace(/^v/, '')}</span>
            <span aria-hidden>·</span>
            <span>Updated {updatedAt}</span>
          </div>
        </div>
      </header>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {installed ? (
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[7px] border border-border px-2.5 text-[12.5px] text-foreground">
            <Toggle label="Skill on or off" checked={enabled} onChange={(on) => sk.setEnabled(id, on)} />
            {enabled ? 'Enabled' : 'Disabled'}
          </label>
        ) : (
          <Btn
            variant="primary"
            onClick={() => {
              sk.install(id)
              toast.success(`${skill.name} added. Use it with /${id}`)
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add skill
          </Btn>
        )}
        <Btn onClick={tryInChat}>
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Try in chat
        </Btn>
        <div ref={menuRef} className="relative ml-auto">
          <button
            type="button"
            aria-label="More actions"
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-[180px] rounded-[9px] border border-border bg-card p-1 shadow-xl">
              {custom && (
                <button type="button" onClick={() => { setMenuOpen(false); setView({ name: 'edit', id }) }} className={menuItem}>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit skill
                </button>
              )}
              <button type="button" onClick={() => { setMenuOpen(false); exportBundle() }} className={menuItem}>
                <Download className="h-3.5 w-3.5 text-muted-foreground" /> Export bundle
              </button>
              {(custom || installed) && (
                <>
                  <div className="my-1 h-px bg-foreground/[0.07]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      if (custom) {
                        sk.deleteSkill(id)
                        toast.success('Skill deleted')
                        onBack()
                      } else {
                        sk.uninstall(id)
                        toast.success(`${skill.name} removed`)
                      }
                    }}
                    className={cn(menuItem, 'text-destructive hover:bg-destructive/10')}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {custom ? 'Delete skill' : 'Remove'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="mt-6 flex items-center gap-5 border-b border-border">
        {(
          [
            { id: 'overview', label: 'Overview', count: null },
            { id: 'contents', label: 'Files', count: filePaths.length },
            { id: 'skills', label: 'Commands', count: subSkills.length }
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={subTab === t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              '-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 text-[12.5px] font-medium transition-colors',
              subTab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-soft-foreground'
            )}
          >
            {t.label}
            {t.count !== null && (
              <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[10.5px] leading-[16px] text-muted-foreground">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {subTab === 'overview' && (
        <article className="mt-6 max-w-[640px] text-[13.5px] leading-[1.75] text-soft-foreground">
          <Markdown text={stripYamlFrontmatter(overviewDoc).body} />
        </article>
      )}

      {/* FILES */}
      {subTab === 'contents' && (
        <div className="mt-4 flex h-[600px]">
          {/* tree */}
          <div className="flex h-full w-[210px] shrink-0 flex-col pr-3">
            <div className="mb-1 flex h-9 shrink-0 items-center gap-2 px-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-faint-foreground" />
              <input
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                placeholder={`Filter ${filePaths.length} files`}
                aria-label="Filter files"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-faint-foreground"
              />
              {fileFilter && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setFileFilter('')}
                  className="grid h-5 w-5 cursor-pointer place-items-center rounded-[4px] text-faint-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
              {fileQuery ? (
                filteredPaths.length ? (
                  filteredPaths.map((p) => {
                    const parts = p.split('/')
                    return <FileRow key={p} path={p} name={parts[parts.length - 1]} hint={parts.slice(0, -1).join('/')} />
                  })
                ) : (
                  <p className="px-2 py-6 text-center text-[12px] text-faint-foreground">No files match.</p>
                )
              ) : (
                renderTree(tree)
              )}
            </div>
            <div className="flex h-9 shrink-0 items-center justify-between px-1.5">
              <span className="text-[11px] text-faint-foreground">{filePaths.length} files</span>
              <button
                type="button"
                onClick={exportBundle}
                className="inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <Download className="h-3 w-3" /> Export
              </button>
            </div>
          </div>

          {/* viewer */}
          <div className="flex h-full min-w-0 flex-1 flex-col border-l border-border/60 pl-5">
            <div className="flex h-9 shrink-0 items-center gap-3">
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate text-[13px] font-medium text-foreground">{fileName}</span>
                {fileDir && <span className="truncate font-mono text-[11px] text-faint-foreground">{fileDir}/</span>}
              </div>
              <span className="hidden shrink-0 text-[11px] tabular-nums text-faint-foreground sm:inline">
                {lineCount} lines · {sizeLabel}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                {isMarkdown && (
                  <div className="mr-1">
                    <SegmentedSwitch
                      options={[
                        { value: 'preview', icon: <Eye className="h-3.5 w-3.5" />, title: 'Preview' },
                        { value: 'code', icon: <Code2 className="h-3.5 w-3.5" />, title: 'Source' }
                      ]}
                      value={mode}
                      onChange={setMode}
                      itemWidth={28}
                      height={24}
                    />
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Copy file"
                  title="Copy"
                  onClick={copyFile}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  aria-label="Download file"
                  title="Download"
                  onClick={downloadFile}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="slim-scroll min-h-0 flex-1 overflow-auto">
              {mode === 'preview' && isMarkdown ? (
                <div className="max-w-[620px] py-4 pr-4 text-[13px] leading-6 text-soft-foreground">
                  {frontmatter && (
                    <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-border pb-4 text-[11.5px]">
                      {Object.entries(frontmatter).map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt className="text-faint-foreground">{k}</dt>
                          <dd className="min-w-0 truncate font-mono text-soft-foreground">{v}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                  <Markdown text={markdownBody} />
                </div>
              ) : (
                <div className="flex min-w-max py-3">
                  <div
                    aria-hidden
                    className="sticky left-0 select-none bg-background pr-4 text-right font-mono text-[12px] leading-[20px] text-faint-foreground/70"
                  >
                    {Array.from({ length: lineCount || 1 }, (_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <div className="pr-6">
                    <PierreFileView path={activeFile} code={rawContent} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMMANDS */}
      {subTab === 'skills' && (
        <ul className="mt-5 divide-y divide-border/60 overflow-hidden rounded-[10px] border border-border">
          {subSkills.map((sub) => (
            <li key={sub.id} className="flex items-center gap-3 px-3.5 py-3">
              <code className="shrink-0 rounded-[5px] bg-foreground/[0.06] px-1.5 py-px font-mono text-[12px] text-link">
                /{sub.id}
              </code>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-soft-foreground">{sub.description}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(sub.path)
                  setSubTab('contents')
                }}
                className="shrink-0 cursor-pointer rounded-[6px] px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                View file
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BackLink({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 flex cursor-pointer items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Skills
    </button>
  )
}

function FileChip({ name, onRemove }: { name: string; onRemove?: () => void }): React.JSX.Element {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] bg-border-strong py-0.5 pl-2 pr-1.5 text-[11.5px] text-foreground">
      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/** Plain-language steps the AI would follow, taken from the instructions. This is a preview, not a real run. */
function previewSteps(draft: { instructions: string; files: string[] }, sample: string): string[] {
  const lines = draft.instructions
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)
  return [
    sample.trim() ? `Reads your request: “${sample.trim().slice(0, 60)}”` : 'Reads your request',
    ...draft.files.map((f) => `Looks at your example file ${f}`),
    ...lines.map((l) => (l.length > 80 ? `${l.slice(0, 77)}…` : l)),
    'Replies in plain language'
  ]
}

function SkillEditor({
  id,
  onBack,
  onSaved,
  onClose
}: {
  id: string | null
  onBack: () => void
  onSaved: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const sk = useSkills()
  const existing = id ? sk.all.find((s) => s.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [example, setExample] = useState(existing?.example ?? '')
  const [files, setFiles] = useState<string[]>(existing?.files ?? [])
  const icon = existing?.icon ?? 'spark'
  const [touched, setTouched] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const slug = slugify(name)
  const taken = sk.all.map((s) => s.id).filter((x) => x !== id)
  const problem = nameProblem(slug, taken)
  const missing = !instructions.trim() ? 'Tell the AI what to do.' : null
  const canSave = !problem && !missing

  const [test, setTest] = useState<{ steps: string[]; shown: number; running: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])

  const runTest = (): void => {
    if (missing) {
      setTouched(true)
      return
    }
    clearInterval(timer.current)
    const steps = previewSteps({ instructions, files }, example)
    setTest({ steps, shown: 0, running: true })
    let n = 0
    timer.current = setInterval(() => {
      n += 1
      setTest({ steps, shown: n, running: n < steps.length })
      if (n >= steps.length) clearInterval(timer.current)
    }, 420)
  }

  const draft = (): Skill => ({
    id: slug,
    name: name.trim(),
    description: description.trim() || 'A skill you made.',
    instructions: instructions.trim(),
    example: example.trim(),
    category: 'Quality',
    icon,
    triggers: [],
    files,
    source: 'custom',
    author: 'You',
    version: existing?.version ?? '1.0.0',
    updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    bundle: existing?.bundle
  })

  const save = (): void => {
    setTouched(true)
    if (!canSave) return
    sk.saveSkill(draft(), id ?? undefined)
    toast.success(id ? 'Skill saved' : `Skill created. Use it with /${slug}`)
    onSaved(slug)
  }

  const useInChat = (): void => {
    if (!canSave) {
      setTouched(true)
      return
    }
    sk.saveSkill(draft(), id ?? undefined)
    prefill(`/${slug} ${example.trim()}`.trim())
    onClose()
  }

  return (
    <div>
      <BackLink onBack={onBack} />
      <div className="mt-3 space-y-3.5">
        <div>
          <label htmlFor="sk-name" className={label}>
            Name
          </label>
          <TextInput
            id="sk-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Release notes"
          />
          <p className={cn('mt-1 text-[11.5px]', touched && problem ? 'text-warning' : 'text-faint-foreground')}>
            {touched && problem ? problem : slug ? `You will type /${slug}` : 'This becomes the / command.'}
          </p>
        </div>

        <div>
          <label htmlFor="sk-desc" className={label}>
            What it is for <span className="text-faint-foreground">(optional)</span>
          </label>
          <TextInput
            id="sk-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Turns merged changes into release notes"
          />
        </div>

        <div>
          <label htmlFor="sk-ins" className={label}>
            What should the AI do?
          </label>
          <textarea
            id="sk-ins"
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={
              '1. Read the changes since the last release.\n2. Group them as New, Improved and Fixed.\n3. Write short notes a customer would understand.'
            }
            className={area}
          />
          <p className={cn('mt-1 text-[11.5px]', touched && missing ? 'text-warning' : 'text-faint-foreground')}>
            {touched && missing ? missing : 'Write it like you would explain the job to a new teammate.'}
          </p>
        </div>

        <div>
          <label htmlFor="sk-ex" className={label}>
            Example message <span className="text-faint-foreground">(optional)</span>
          </label>
          <TextInput
            id="sk-ex"
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="Write release notes for version 1.2"
          />
        </div>

        <div>
          <span className={label}>
            Example files <span className="text-faint-foreground">(optional)</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((f) => (
              <FileChip key={f} name={f} onRemove={() => setFiles((l) => l.filter((x) => x !== f))} />
            ))}
            <Btn onClick={() => picker.current?.click()}>
              <Plus className="h-3.5 w-3.5" /> Add file
            </Btn>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name)
                setFiles((l) => [...new Set([...l, ...names])].slice(0, 8))
                e.target.value = ''
              }}
            />
          </div>
          <p className="mt-1 text-[11.5px] text-faint-foreground">Show the AI what a good result looks like.</p>
        </div>

        <section className="rounded-[8px] border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12.5px] text-foreground">Test it</div>
              <div className="text-[11.5px] text-muted-foreground">See how the AI will read your instructions.</div>
            </div>
            <Btn onClick={runTest} busy={test?.running}>
              {test ? 'Run again' : 'Run test'}
            </Btn>
          </div>
          {test && (
            <>
              <ul className="mt-3 space-y-1.5" aria-live="polite">
                {test.steps.slice(0, test.shown).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-[18px] text-soft-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {s}
                  </li>
                ))}
                {test.running && (
                  <li className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
                  </li>
                )}
              </ul>
              {!test.running && (
                <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                  This is a preview. Use “Save and try in chat” for a real run.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
        <Btn onClick={useInChat}>Save and try in chat</Btn>
        <span className="flex gap-2">
          <Btn onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Save skill
          </Btn>
        </span>
      </div>
    </div>
  )
}

function CommandEditor({ id, onBack }: { id: string | null; onBack: () => void }): React.JSX.Element {
  const sk = useSkills()
  const existing = id ? sk.commands.find((c) => c.id === id) : undefined
  const [name, setName] = useState(existing?.id ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [prompt, setPrompt] = useState(existing?.prompt ?? '')
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const slug = slugify(name)
  const taken = useMemo(
    () => [...sk.all.map((s) => s.id), ...sk.commands.map((c) => c.id)].filter((x) => x !== id),
    [sk.all, sk.commands, id]
  )
  const problem = nameProblem(slug, taken)
  const missing = !prompt.trim() ? 'Write the message to send.' : null

  const save = (): void => {
    setTouched(true)
    if (problem || missing) return
    const cmd: CustomCommand = { id: slug, description: description.trim(), prompt: prompt.trim() }
    sk.saveCommand(cmd, id ?? undefined)
    toast.success(id ? 'Command saved' : `Command created. Type /${slug} to use it`)
    onBack()
  }

  return (
    <div>
      <BackLink onBack={onBack} />
      <div className="mt-3 space-y-3.5">
        <div>
          <label htmlFor="cm-name" className={label}>
            Name
          </label>
          <TextInput
            id="cm-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="standup"
          />
          <p className={cn('mt-1 text-[11.5px]', touched && problem ? 'text-warning' : 'text-faint-foreground')}>
            {touched && problem ? problem : slug ? `You will type /${slug}` : 'Letters, numbers and dashes.'}
          </p>
        </div>
        <div>
          <label htmlFor="cm-desc" className={label}>
            Short description <span className="text-faint-foreground">(optional)</span>
          </label>
          <TextInput
            id="cm-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Summarise what I did today"
          />
        </div>
        <div>
          <label htmlFor="cm-prompt" className={label}>
            Message to send
          </label>
          <textarea
            id="cm-prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Summarise what changed today in three bullet points for my team standup."
            className={area}
          />
          <p className={cn('mt-1 text-[11.5px]', touched && missing ? 'text-warning' : 'text-faint-foreground')}>
            {touched && missing ? missing : 'Type $ARGUMENTS where text typed after the command should go.'}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
        {existing ? (
          confirm ? (
            <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Delete?
              <Btn
                variant="danger"
                onClick={() => {
                  sk.deleteCommand(existing.id)
                  toast.success('Command deleted')
                  onBack()
                }}
              >
                Delete
              </Btn>
              <Btn onClick={() => setConfirm(false)}>Keep</Btn>
            </span>
          ) : (
            <Btn variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Btn>
          )
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Btn onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Save command
          </Btn>
        </span>
      </div>
    </div>
  )
}
