import { FileIcon } from '@/components/file-icon'
import React, { useState } from 'react'
import {
  ChevronRight,
  CalendarClock,
  Folder,
  ListFilter,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  SquarePen
} from '@/components/icons'
import { ActionMenu } from '@/components/action-menu'
import { IconButton } from '@/components/layout/icon-button'
import { cn } from '@/lib/utils'
import { ProfileMenu } from '@/features/account/profile-menu'
import { InlineRename } from '@/features/workspace/dialogs'
import { useChatMenu } from '@/features/workspace/chat-menu'
import { useWorkspace, type Chat } from '@/features/workspace/workspace-store'
import { useWorkspaceFiles } from '@/features/ai-assistant/workspace-files'
import { buildTree, type TreeNode } from '@/features/right-panel/tabs/file-tree'
import { requestFilePreview } from '@/features/right-panel/file-preview-request'
import { useRightPanel } from '@/features/right-panel/store'

const SMALL = 'h-[14px] w-[14px] stroke-[1.7]'
const NAV =
  'flex h-7 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-[#d4d4d2] transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** A chat in the list. The "…" shows on hover and holds the chat's actions. */
function ChatRow({
  chat,
  indent,
  suppressSelection = false,
  onSelect
}: {
  chat: Chat
  indent?: boolean
  suppressSelection?: boolean
  onSelect?: () => void
}): React.JSX.Element {
  const ws = useWorkspace()
  const menu = useChatMenu()
  const selected = !suppressSelection && chat.id === ws.activeId
  const renaming = ws.renamingId === chat.id

  return (
    <li className="group/row relative">
      {renaming ? (
        <div className={cn('flex h-7 items-center px-1', indent && 'pl-5')}>
          <InlineRename
            value={chat.title}
            onSave={(v) => ws.rename(chat.id, v)}
            onCancel={() => ws.startRename(null)}
            className="h-6 w-full text-[13px]"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            ws.select(chat.id)
            onSelect?.()
          }}
          onDoubleClick={() => ws.startRename(chat.id)}
          title={chat.title}
          aria-current={selected ? 'true' : undefined}
          className={cn(
            'flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-7 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            indent ? 'pl-6' : 'pl-2',
            selected
              ? 'bg-white/[0.09] text-foreground'
              : 'text-[#b9b9b6] hover:bg-white/[0.05] hover:text-foreground'
          )}
        >
          {chat.pinned && <Pin className="h-3 w-3 shrink-0 -rotate-45 text-muted-foreground" />}
          <span className="truncate">{chat.title}</span>
        </button>
      )}
      {!renaming && (
        <div className="absolute right-0.5 top-0.5">
          <ActionMenu
            align="start"
            side="bottom"
            items={menu(chat)}
            trigger={(open) => (
              <button
                type="button"
                aria-label={`Actions for ${chat.title}`}
                className={cn(
                  'grid h-6 w-6 cursor-pointer place-items-center rounded text-muted-foreground transition-opacity hover:bg-white/[0.08] hover:text-foreground focus-visible:opacity-100',
                  open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          />
        </div>
      )}
    </li>
  )
}

function SectionLabel({
  children,
  action
}: {
  children: React.ReactNode
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mt-3 flex h-6 items-center justify-between pl-2 pr-0.5">
      <span className="text-[11.5px] text-muted-foreground">{children}</span>
      {action}
    </div>
  )
}

function SidebarFileTree({
  nodes,
  onFile,
  depth = 0
}: {
  nodes: TreeNode<{ path: string }>[]
  onFile: (path: string) => void
  depth?: number
}): React.JSX.Element {
  // A project tree can be thousands of rows deep. Start folded and let people reveal only the
  // branch they need, rather than opening every directory on entry to Code mode.
  const [closed, setClosed] = useState<Set<string>>(() =>
    new Set(nodes.filter((node) => node.kind === 'dir').map((node) => node.path))
  )
  const toggle = (path: string): void =>
    setClosed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <ul className={cn('space-y-px', depth > 0 && 'ml-2 border-l border-white/[0.07] pl-1.5')}>
      {nodes.map((node) => {
        if (node.kind === 'file') {
          return (
            <li key={node.path}>
              <button
                type="button"
                title={node.path}
                onClick={() => onFile(node.path)}
                className="flex h-6 w-full cursor-pointer items-center gap-1.5 px-1.5 pl-4 text-left text-[12px] text-[#aaa9a5] hover:bg-white/[0.05] hover:text-foreground"
              >
                <FileIcon name={node.name} />
                <span className="truncate">{node.name}</span>
              </button>
            </li>
          )
        }
        const open = !closed.has(node.path)
        return (
          <li key={node.path}>
            <button
              type="button"
              title={node.path}
              aria-expanded={open}
              onClick={() => toggle(node.path)}
              className="flex h-6 w-full cursor-pointer items-center gap-1 px-1.5 text-left text-[12px] text-[#cacac6] hover:bg-white/[0.05] hover:text-foreground"
            >
              <ChevronRight strokeWidth={2.35} className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
              <span className="truncate">{node.name}</span>
            </button>
            {open && <SidebarFileTree nodes={node.children} onFile={onFile} depth={depth + 1} />}
          </li>
        )
      })}
    </ul>
  )
}

function FilesSection(): React.JSX.Element {
  const ws = useWorkspace()
  const project = ws.groups.find((group) => group.id === ws.active.projectId)
  const files = useWorkspaceFiles(project?.folder ?? '')
  const { openTab } = useRightPanel()
  // The explorer deliberately keeps each directory visible and starts every one open.
  const tree = buildTree(files.map((path) => ({ path })), false)
  const openFile = (path: string): void => {
    requestFilePreview(path)
    openTab('file')
  }
  return (
    <section className="flex min-h-0 flex-1 flex-col px-2 pt-2">
      <div className="flex h-6 shrink-0 items-center px-2 text-[12px] font-medium text-muted-foreground">Explorer</div>
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-0.5 pb-2">
        {!project?.folder ? (
          <p className="px-2 py-2 text-[12px] leading-5 text-[#77776f]">
            Add this chat to a project to browse its files.
          </p>
        ) : tree.length ? <SidebarFileTree nodes={tree} onFile={openFile} /> : <p className="px-2 py-1.5 text-[12px] text-[#77776f]">No files found.</p>}
      </div>
    </section>
  )
}

/** Body of the left sidebar (below the title-bar row). */
export function LeftSidebar({
  mode,
  onOpenRoutines,
  onOpenChat,
  routinesActive
}: {
  mode: 'chat' | 'code'
  onOpenRoutines: () => void
  onOpenChat: () => void
  routinesActive: boolean
}): React.JSX.Element {
  const ws = useWorkspace()
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [shut, setShut] = useState<Set<string>>(new Set())

  const visible = ws.chats.filter((c) => (view === 'archived' ? c.archived : !c.archived))
  const byRecent = (a: Chat, b: Chat): number => b.updatedAt - a.updatedAt
  const pinned = visible.filter((c) => c.pinned && !c.projectId).sort(byRecent)
  const loose = visible.filter((c) => !c.pinned && !c.projectId).sort(byRecent)
  const inGroup = (id: string): Chat[] =>
    visible
      .filter((c) => c.projectId === id)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byRecent(a, b))

  const toggle = (id: string): void =>
    setShut((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })

  return (
    <div data-tour="sidebar" className="flex min-h-0 flex-1 flex-col">
      {mode === 'code' ? (
        <FilesSection />
      ) : (
        <>
          <nav className="flex flex-col gap-px px-2 pt-1">
            <button type="button" onClick={() => { ws.newChat(); onOpenChat() }} className={NAV}>
              <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                <SquarePen className={SMALL} />
              </span>
              New chat
            </button>
            <button
              type="button"
              onClick={onOpenRoutines}
              aria-current={routinesActive ? 'page' : undefined}
              className={cn(NAV, routinesActive && 'bg-white/[0.09] text-foreground')}
            >
              <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                <CalendarClock className={SMALL} />
              </span>
              Routines
            </button>
            <button type="button" onClick={() => ws.setSearchOpen(true)} className={NAV}>
              <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                <Search className={SMALL} />
              </span>
              Search
            </button>
          </nav>

          <div className="slim-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {view === 'active' && (
          <>
            <SectionLabel
              action={
                <IconButton
                  title="New project"
                  className="p-1"
                  onClick={() => ws.setDialog({ kind: 'new-project' })}
                >
                  <Plus className={SMALL} />
                </IconButton>
              }
            >
              Projects
            </SectionLabel>
            {ws.groups.length === 0 && (
              <button
                type="button"
                onClick={() => ws.setDialog({ kind: 'new-project' })}
                className="mt-0.5 flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[12.5px] text-[#77776f] hover:text-foreground"
              >
                Group chats by project
              </button>
            )}
            {ws.groups.map((g) => {
              const open = !shut.has(g.id)
              const items = inGroup(g.id)
              return (
                <div key={g.id} className="mt-px">
                  <div className="group/row relative">
                    <button
                      type="button"
                      onClick={() => toggle(g.id)}
                      aria-expanded={open}
                      title={g.folder ?? g.name}
                      className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md pl-1.5 pr-14 text-left text-[13px] text-[#d4d4d2] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                          open && 'rotate-90'
                        )}
                      />
                      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{g.name}</span>
                    </button>
                    <div className="absolute right-0.5 top-0.5 flex opacity-0 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
                      <IconButton
                        title="New chat in project"
                        className="p-1"
                        onClick={() => ws.newChat(g.id)}
                      >
                        <Plus className={SMALL} />
                      </IconButton>
                      <ActionMenu
                        align="start"
                        items={[
                          {
                            id: 'rename',
                            label: 'Rename',
                            onClick: () => ws.setDialog({ kind: 'rename-project', id: g.id })
                          },
                          {
                            id: 'remove',
                            label: 'Remove project',
                            danger: true,
                            onClick: () => ws.removeGroup(g.id)
                          }
                        ]}
                        trigger={
                          <button
                            type="button"
                            aria-label={`Actions for ${g.name}`}
                            className="grid h-6 w-6 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    </div>
                  </div>
                  {open && (
                    <ul className="flex flex-col gap-px">
                      {items.length === 0 && (
                        <li className="pl-8 text-[12px] leading-6 text-[#77776f]">No chats yet</li>
                      )}
                      {items.map((c) => (
                        <ChatRow key={c.id} chat={c} indent suppressSelection={routinesActive} onSelect={onOpenChat} />
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {pinned.length > 0 && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                <ul className="flex flex-col gap-px">
                  {pinned.map((c) => (
                    <ChatRow key={c.id} chat={c} suppressSelection={routinesActive} onSelect={onOpenChat} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <SectionLabel
          action={
            <ActionMenu
              align="start"
              items={[
                {
                  id: 'active',
                  label: 'Chats',
                  checked: view === 'active',
                  onClick: () => setView('active')
                },
                {
                  id: 'archived',
                  label: 'Archived',
                  checked: view === 'archived',
                  onClick: () => setView('archived')
                }
              ]}
              trigger={
                <IconButton title="Filter" className="p-1">
                  <ListFilter className={SMALL} />
                </IconButton>
              }
            />
          }
        >
          {view === 'archived' ? 'Archived' : 'Chats'}
        </SectionLabel>
        <ul className="flex flex-col gap-px">
          {(view === 'archived' ? visible.sort(byRecent) : loose).map((c) => (
            <ChatRow key={c.id} chat={c} suppressSelection={routinesActive} onSelect={onOpenChat} />
          ))}
        </ul>
        {view === 'archived' && visible.length === 0 && (
          <p className="px-2 pt-1 text-[12px] text-[#77776f]">Nothing archived.</p>
        )}
        {view === 'active' &&
          loose.length === 0 &&
          pinned.length === 0 &&
          ws.groups.length === 0 && (
            <p className="px-2 pt-1 text-[12px] text-[#77776f]">No chats yet.</p>
          )}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-white/[0.08] px-2 py-2">
        <ProfileMenu />
      </div>
    </div>
  )
}
