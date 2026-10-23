import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import type { Msg } from '@/features/ai-assistant/types'
import { workspaceKey } from '@/lib/storage-keys'
import { useChatSync, type RemoteChat } from './chat-sync'

export interface Chat {
  id: string
  title: string
  /** Project this chat belongs to, or null for a loose chat. */
  projectId: string | null
  pinned: boolean
  archived: boolean
  updatedAt: number
}

export interface ProjectGroup {
  id: string
  name: string
  /** Folder on disk, if the project was created from one. */
  folder?: string
}

export const NEW_CHAT_TITLE = 'New chat'

interface Saved {
  chats: Chat[]
  groups: ProjectGroup[]
  activeId: string
  messages: Record<string, Msg[]>
}

export type WorkspaceDialog =
  | { kind: 'move'; chatId: string }
  | { kind: 'new-project'; moveChatId?: string }
  | { kind: 'rename-project'; id: string }
  | null

interface WorkspaceApi {
  dialog: WorkspaceDialog
  setDialog: (d: WorkspaceDialog) => void
  chats: Chat[]
  groups: ProjectGroup[]
  activeId: string
  active: Chat
  renamingId: string | null
  searchOpen: boolean
  canBack: boolean
  canForward: boolean
  select: (id: string) => void
  back: () => void
  forward: () => void
  newChat: (projectId?: string | null) => string
  rename: (id: string, title: string) => void
  startRename: (id: string | null) => void
  togglePin: (id: string) => void
  toggleArchive: (id: string) => void
  remove: (id: string) => void
  moveTo: (id: string, projectId: string | null) => void
  addGroup: (name: string, folder?: string) => string
  renameGroup: (id: string, name: string) => void
  removeGroup: (id: string) => void
  setSearchOpen: (open: boolean) => void
  /** Delete every chat (projects stay) and start a fresh one. */
  deleteAllChats: () => void
  /** Messages for a chat, as last saved. Read once when a chat opens. */
  getMessages: (id: string) => Msg[]
  /** Called by the chat as it streams. Kept out of React state so typing stays smooth. */
  saveMessages: (id: string, messages: Msg[]) => void
  /** Plain text of every message, for search. */
  textOf: (id: string) => string
}

const Ctx = createContext<WorkspaceApi | null>(null)
const uid = (): string => crypto.randomUUID().slice(0, 8)
const now = (): number => Date.now()

function emptyWorkspace(): Saved {
  const t = now()
  const id = uid()
  const chat: Chat = { id, title: NEW_CHAT_TITLE, projectId: null, pinned: false, archived: false, updatedAt: t }
  return { chats: [chat], groups: [], activeId: id, messages: { [id]: [] } }
}

const keyFor = workspaceKey

function load(accountId: string): Saved {
  try {
    const raw = localStorage.getItem(keyFor(accountId))
    if (raw) {
      const s = JSON.parse(raw) as Saved
      if (Array.isArray(s.chats) && s.chats.length) {
        // Older releases inserted the c1–c6 demo chats on first run. They were never
        // user content, so remove them while retaining any real chats the person created.
        const chats = s.chats.filter((chat) => !/^c\d+$/.test(chat.id))
        if (chats.length) {
          const messages = Object.fromEntries(Object.entries(s.messages ?? {}).filter(([id]) => !/^c\d+$/.test(id)))
          return { ...s, chats, activeId: chats.some((chat) => chat.id === s.activeId) ? s.activeId : chats[0].id, messages }
        }
      }
    }
  } catch {
    /* fall through to an empty workspace */
  }
  return emptyWorkspace()
}

/** A message list that was saved mid-run must not come back looking busy. */
const settle = (list: Msg[]): Msg[] =>
  list.map((m) => (m.role === 'agent' && m.running ? { ...m, running: false } : m))

const textOfMsg = (m: Msg): string =>
  m.role === 'agent' ? m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ') : m.text

export function WorkspaceProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { account } = useAuth()
  const accountId = account?.id ?? 'guest'
  const [initial] = useState<Saved>(() => load(accountId))

  const [chats, setChats] = useState<Chat[]>(initial.chats)
  const [groups, setGroups] = useState<ProjectGroup[]>(initial.groups)
  const [activeId, setActiveId] = useState(initial.activeId)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dialog, setDialog] = useState<WorkspaceDialog>(null)
  const [trail, setTrail] = useState<{ ids: string[]; at: number }>({
    ids: [initial.activeId],
    at: 0
  })

  // messages live in a ref: they change on every streamed token
  const messages = useRef<Record<string, Msg[]>>(initial.messages)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ chats, groups, activeId })
  useEffect(() => {
    latest.current = { chats, groups, activeId }
  })

  const persist = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const { chats: c, groups: g, activeId: a } = latest.current
      const data: Saved = { chats: c, groups: g, activeId: a, messages: messages.current }
      try {
        localStorage.setItem(keyFor(accountId), JSON.stringify(data))
      } catch {
        // storage full (long chats with images): keep working, just not saved
      }
    }, 400)
  }, [accountId])

  useEffect(persist, [chats, groups, activeId, persist])

  // chats from other computers: newer copies replace older ones; the chat on screen is left alone
  const applyRemote = useCallback(
    (items: RemoteChat[]) => {
      setChats((prev) => {
        const next = [...prev]
        for (const r of items) {
          const i = next.findIndex((c) => c.id === r.id)
          const isOpen = r.id === latest.current.activeId
          if (r.deleted) {
            if (i >= 0 && !isOpen && next[i].updatedAt <= r.updated) {
              next.splice(i, 1)
              delete messages.current[r.id]
            }
            continue
          }
          const incoming = r.data.chat
          if (!incoming || isOpen || (i >= 0 && next[i].updatedAt >= r.updated)) continue
          if (i < 0) next.push(incoming)
          else next[i] = incoming
          messages.current[r.id] = settle(r.data.messages ?? [])
        }
        return next
      })
      setGroups((prev) => {
        const add = items.flatMap((r) => (r.data.group && !prev.some((g) => g.id === r.data.group?.id) ? [r.data.group] : []))
        return add.length ? [...prev, ...add] : prev
      })
      persist()
    },
    [persist]
  )
  useChatSync({
    accountId,
    chats,
    groups,
    getMessages: (id) => messages.current[id] ?? [],
    apply: applyRemote
  })

  const active = chats.find((c) => c.id === activeId) ?? chats[0]

  const go = useCallback((id: string, push: boolean) => {
    setActiveId(id)
    setRenamingId(null)
    if (push)
      setTrail((t) => {
        if (t.ids[t.at] === id) return t
        const ids = [...t.ids.slice(0, t.at + 1), id].slice(-50)
        return { ids, at: ids.length - 1 }
      })
  }, [])

  const select = useCallback((id: string) => go(id, true), [go])

  const trailRef = useRef(trail)
  useEffect(() => {
    trailRef.current = trail
  })

  const step = useCallback((d: -1 | 1) => {
    const t = trailRef.current
    // skip chats that were deleted since
    let at = t.at + d
    while (at >= 0 && at < t.ids.length && !latest.current.chats.some((c) => c.id === t.ids[at]))
      at += d
    if (at < 0 || at >= t.ids.length) return
    setActiveId(t.ids[at])
    setRenamingId(null)
    setTrail({ ...t, at })
  }, [])

  const newChat = useCallback(
    (projectId: string | null = null) => {
      // reuse an empty "New chat" instead of piling them up
      const empty = latest.current.chats.find(
        (c) =>
          c.title === NEW_CHAT_TITLE &&
          !c.archived &&
          c.projectId === projectId &&
          !messages.current[c.id]?.length
      )
      if (empty) {
        go(empty.id, true)
        return empty.id
      }
      const id = uid()
      messages.current[id] = []
      setChats((l) => [
        { id, title: NEW_CHAT_TITLE, projectId, pinned: false, archived: false, updatedAt: now() },
        ...l
      ])
      go(id, true)
      return id
    },
    [go]
  )

  const patch = useCallback((id: string, p: Partial<Chat>) => {
    setChats((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }, [])

  const rename = useCallback(
    (id: string, title: string) => {
      const clean = title.trim()
      if (clean) patch(id, { title: clean.slice(0, 80) })
      setRenamingId(null)
    },
    [patch]
  )

  const togglePin = useCallback(
    (id: string) => {
      const c = latest.current.chats.find((x) => x.id === id)
      if (!c) return
      patch(id, { pinned: !c.pinned })
      toast(c.pinned ? 'Unpinned' : 'Pinned to the top')
    },
    [patch]
  )

  /** After a chat disappears from view, open the next one (or a fresh chat). */
  const leave = useCallback(
    (id: string) => {
      if (latest.current.activeId !== id) return
      const next = latest.current.chats.find((c) => c.id !== id && !c.archived)
      if (next) go(next.id, false)
      else newChat()
    },
    [go, newChat]
  )

  const toggleArchive = useCallback(
    (id: string) => {
      const c = latest.current.chats.find((x) => x.id === id)
      if (!c) return
      patch(id, { archived: !c.archived })
      if (!c.archived) {
        leave(id)
        toast('Chat archived', {
          action: { label: 'Undo', onClick: () => patch(id, { archived: false }) }
        })
      } else toast('Chat restored')
    },
    [patch, leave]
  )

  const remove = useCallback(
    (id: string) => {
      const c = latest.current.chats.find((x) => x.id === id)
      if (!c) return
      const saved = messages.current[id]
      leave(id)
      setChats((l) => l.filter((x) => x.id !== id))
      delete messages.current[id]
      toast('Chat deleted', {
        action: {
          label: 'Undo',
          onClick: () => {
            messages.current[id] = saved ?? []
            setChats((l) => [c, ...l])
          }
        }
      })
    },
    [leave]
  )

  const moveTo = useCallback(
    (id: string, projectId: string | null) => {
      patch(id, { projectId })
      const name = latest.current.groups.find((g) => g.id === projectId)?.name
      toast(name ? `Moved to ${name}` : 'Removed from project')
    },
    [patch]
  )

  const addGroup = useCallback((name: string, folder?: string) => {
    const id = uid()
    setGroups((l) => [...l, { id, name: name.trim().slice(0, 40) || 'Untitled', folder }])
    return id
  }, [])

  const renameGroup = useCallback((id: string, name: string) => {
    const clean = name.trim()
    if (clean)
      setGroups((l) => l.map((g) => (g.id === id ? { ...g, name: clean.slice(0, 40) } : g)))
  }, [])

  const removeGroup = useCallback((id: string) => {
    const g = latest.current.groups.find((x) => x.id === id)
    const affected = latest.current.chats.filter((c) => c.projectId === id).map((c) => c.id)
    setGroups((l) => l.filter((x) => x.id !== id))
    setChats((l) => l.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)))
    toast(`Project “${g?.name ?? ''}” removed`, {
      description: 'Its chats are still in your list.',
      action: {
        label: 'Undo',
        onClick: () => {
          if (g) setGroups((l) => [...l, g])
          setChats((l) => l.map((c) => (affected.includes(c.id) ? { ...c, projectId: id } : c)))
        }
      }
    })
  }, [])

  const getMessages = useCallback((id: string) => settle(messages.current[id] ?? []), [])

  const saveMessages = useCallback(
    (id: string, list: Msg[]) => {
      const c = latest.current.chats.find((x) => x.id === id)
      if (!c) return // deleted: do not bring its messages back
      const before = messages.current[id]?.length ?? 0
      messages.current[id] = list
      const firstUser = list.find((m) => m.role === 'user')
      const title =
        c.title === NEW_CHAT_TITLE && firstUser && firstUser.role === 'user'
          ? firstUser.text.replace(/\s+/g, ' ').trim().slice(0, 48) || c.title
          : c.title
      if (list.length !== before || title !== c.title) {
        patch(id, { title, ...(list.length > before ? { updatedAt: now() } : {}) })
      } else persist()
    },
    [patch, persist]
  )

  const deleteAllChats = useCallback(() => {
    const id = uid()
    messages.current = { [id]: [] }
    setChats([{ id, title: NEW_CHAT_TITLE, projectId: null, pinned: false, archived: false, updatedAt: now() }])
    setActiveId(id)
    setRenamingId(null)
    setTrail({ ids: [id], at: 0 })
  }, [])

  const textOf = useCallback(
    (id: string) => (messages.current[id] ?? []).map(textOfMsg).join(' '),
    []
  )

  const value = useMemo<WorkspaceApi>(
    () => ({
      dialog,
      setDialog,
      chats,
      groups,
      activeId: active.id,
      active,
      renamingId,
      searchOpen,
      canBack: trail.at > 0,
      canForward: trail.at < trail.ids.length - 1,
      select,
      back: () => step(-1),
      forward: () => step(1),
      newChat,
      rename,
      startRename: setRenamingId,
      togglePin,
      toggleArchive,
      remove,
      moveTo,
      addGroup,
      renameGroup,
      removeGroup,
      setSearchOpen,
      deleteAllChats,
      getMessages,
      saveMessages,
      textOf
    }),
    [
      dialog,
      chats,
      groups,
      active,
      renamingId,
      searchOpen,
      trail,
      select,
      step,
      newChat,
      rename,
      togglePin,
      toggleArchive,
      remove,
      moveTo,
      addGroup,
      renameGroup,
      removeGroup,
      deleteAllChats,
      getMessages,
      saveMessages,
      textOf
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** The whole chat as Markdown, for copy and share. */
// eslint-disable-next-line react-refresh/only-export-components
export function chatToMarkdown(title: string, list: Msg[]): string {
  const body = list
    .map((m) => {
      if (m.role === 'system') return `_${m.text}_`
      if (m.role === 'user') return `**You**\n\n${m.text}`
      const text = m.parts
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join('\n\n')
      return `**AI**\n\n${text || '_(worked on files)_'}`
    })
    .join('\n\n---\n\n')
  return `# ${title}\n\n${body}\n`
}
