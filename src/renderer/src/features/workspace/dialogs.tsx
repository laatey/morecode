import { ModalOverlay } from '@/components/modal-overlay'
import React, { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/features/settings/settings-store'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, FolderPlus, Laptop, X } from '@/components/icons'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useWorkspace } from './workspace-store'
import { CommandPalette } from '@/features/palette/command-palette'

const SURFACE =
  'fixed left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[11px] border border-border bg-card shadow-[0_16px_50px_rgba(0,0,0,0.55)] outline-none'

const Overlay = (): React.JSX.Element => (
  <ModalOverlay tone="light" />
)

/** One-line text prompt: new project, rename project. */
export function NameDialog({
  open,
  title,
  initial = '',
  confirm,
  onClose,
  onSubmit,
  chooseFolder,
  initialFolder,
  initialName
}: {
  open: boolean
  title: string
  initialFolder?: string
  initialName?: string
  initial?: string
  confirm: string
  onClose: () => void
  onSubmit: (name: string, folder?: string) => void
  /** Show a "Choose a folder" shortcut (desktop only). */
  chooseFolder?: boolean
}): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content
          className={cn(
            SURFACE,
            title === 'New project'
              ? 'top-1/2 w-[min(420px,calc(100vw-32px))] -translate-y-1/2 p-3.5'
              : 'top-[22vh] p-4'
          )}
          aria-describedby={undefined}
        >
          <Dialog.Title className={cn('mb-2 font-medium text-foreground', title === 'New project' ? 'text-[15px]' : 'text-[13.5px]')}>
            {title}
          </Dialog.Title>
          {title === 'New project' ? (
            <ProjectForm confirm={confirm} onClose={onClose} onSubmit={onSubmit} initialFolder={initialFolder} initialName={initialName} />
          ) : (
            <NameForm
              initial={initial}
              confirm={confirm}
              onClose={onClose}
              onSubmit={onSubmit}
              chooseFolder={chooseFolder}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ProjectForm({
  confirm,
  onClose,
  onSubmit,
  initialFolder,
  initialName
}: {
  initialFolder?: string
  initialName?: string
  confirm: string
  onClose: () => void
  onSubmit: (name: string, folder?: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(initialName ?? '')
  const [folder, setFolder] = useState<string | undefined>(initialFolder)

  const browse = async (): Promise<void> => {
    const chosen = await window.api?.workspace?.choose()
    if (chosen) {
      setFolder(chosen.root)
      setName((current) => current || chosen.name)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name, folder)
      }}
    >
      <div className="flex h-9 items-center overflow-hidden rounded-[8px] border border-border bg-foreground/[0.035] focus-within:border-primary/80">
        <span className="grid h-full w-9 shrink-0 place-items-center border-r border-border text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Project name"
          placeholder="Project name"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mb-1 mt-2.5 flex items-center justify-between">
        <h3 className="text-[11.5px] font-semibold text-foreground">Source folder</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Laptop className="h-3 w-3" /> This computer
        </span>
      </div>
      <div className="overflow-hidden rounded-[8px] border border-border bg-foreground/[0.015]">
        {folder ? (
          <div className="flex h-9 items-center gap-2 px-2.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={folder}>
              {folder.split(/[\\/]/).filter(Boolean).at(-1) || folder}
            </span>
            <button
              type="button"
              aria-label="Remove source folder"
              onClick={() => setFolder(undefined)}
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex min-h-[44px] items-center justify-center px-2">
            <button
              type="button"
              onClick={() => void browse()}
              className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
            >
              <FolderPlus className="h-4 w-4" /> Add a folder on this computer
            </button>
          </div>
        )}
        {folder && (
          <button
            type="button"
            onClick={() => void browse()}
            className="flex h-8 w-full cursor-pointer items-center gap-2 border-t border-border px-2.5 text-left text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" /> Change folder
          </button>
        )}
      </div>

      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-7 cursor-pointer rounded-md px-2.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-7 cursor-pointer rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirm} project
        </button>
      </div>
    </form>
  )
}

function NameForm({
  initial,
  confirm,
  onClose,
  onSubmit,
  chooseFolder
}: {
  initial: string
  confirm: string
  onClose: () => void
  onSubmit: (name: string, folder?: string) => void
  chooseFolder?: boolean
}): React.JSX.Element {
  // mounted fresh each time the dialog opens, so it always starts clean
  const [name, setName] = useState(initial)
  const [folder, setFolder] = useState<string | undefined>()

  const browse = async (): Promise<void> => {
    const chosen = await window.api?.workspace?.choose()
    if (chosen) {
      setFolder(chosen.root)
      setName((n) => n || chosen.name)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name, folder)
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Name"
        placeholder="Name"
        className="h-9 w-full rounded-md border border-border bg-foreground/[0.04] px-3 text-[13px] outline-none placeholder:text-faint-foreground focus:border-border-strong"
      />
      {chooseFolder && (
        <button
          type="button"
          onClick={() => void browse()}
          className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] text-muted-foreground hover:text-foreground"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{folder ?? 'Link a folder on this computer'}</span>
        </button>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-8 cursor-pointer rounded-md px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-8 cursor-pointer rounded-md bg-foreground/[0.12] px-3 text-[12.5px] text-foreground hover:bg-foreground/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirm}
        </button>
      </div>
    </form>
  )
}

/** Pick which project a chat belongs to. */
export function MoveDialog({
  chatId,
  onClose,
  onNewProject
}: {
  chatId: string | null
  onClose: () => void
  onNewProject: () => void
}): React.JSX.Element {
  const ws = useWorkspace()
  const chat = ws.chats.find((c) => c.id === chatId)
  const row =
    'flex h-8 w-full cursor-pointer items-center rounded-md px-2.5 text-left text-[13px] hover:bg-foreground/[0.07]'
  return (
    <Dialog.Root open={Boolean(chatId)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={cn(SURFACE, 'top-[22vh] p-1.5')} aria-describedby={undefined}>
          <Dialog.Title className="px-2.5 pb-1 pt-2 text-[12px] text-faint-foreground">
            Add to project
          </Dialog.Title>
          {ws.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={cn(row, chat?.projectId === g.id && 'text-link')}
              onClick={() => {
                if (chatId) ws.moveTo(chatId, g.id)
                onClose()
              }}
            >
              <span className="truncate">{g.name}</span>
            </button>
          ))}
          {chat?.projectId && (
            <button
              type="button"
              className={cn(row, 'text-muted-foreground')}
              onClick={() => {
                if (chatId) ws.moveTo(chatId, null)
                onClose()
              }}
            >
              Remove from project
            </button>
          )}
          <button
            type="button"
            className={cn(row, 'text-muted-foreground')}
            onClick={() => {
              onClose()
              onNewProject()
            }}
          >
            New project…
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Title that turns into a text box while renaming. Enter saves, Esc cancels. */
export function InlineRename({
  value,
  onSave,
  onCancel,
  className
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  className?: string
}): React.JSX.Element {
  const [v, setV] = useState(value)
  const done = useRef(false)
  const finish = (save: boolean): void => {
    if (done.current) return
    done.current = true
    if (save) onSave(v)
    else onCancel()
  }
  return (
    <input
      autoFocus
      value={v}
      aria-label="Chat name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      className={cn(
        'min-w-0 rounded bg-foreground/[0.08] px-1.5 outline-none ring-1 ring-border-strong',
        className
      )}
    />
  )
}

/** Mount once: renders whichever dialog the workspace asked for. */
export function WorkspaceDialogs(): React.JSX.Element {
  const ws = useWorkspace()
  const { dialog } = ws
  const close = (): void => ws.setDialog(null)
  const desktop = Boolean(window.api?.workspace)
  const renaming =
    dialog?.kind === 'rename-project' ? ws.groups.find((g) => g.id === dialog.id) : null
  const { openSettings } = useSettings()

  // things that start or re-focus the app from outside: right-click a folder → Open with MoreCode, the jump list
  const latest = useRef({ ws, openSettings })
  latest.current = { ws, openSettings }
  useEffect(() => {
    const api = window.api?.app
    if (!api?.onOpenAction) return
    const same = (a: string, b: string): boolean => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()
    const handle = (a: { kind: string; path?: string }): void => {
      const { ws: w, openSettings: openSet } = latest.current
      if (a.kind === 'new-chat') w.newChat()
      else if (a.kind === 'new-project') w.setDialog({ kind: 'new-project' })
      else if (a.kind === 'settings') openSet()
      else if (a.kind === 'folder' && a.path) {
        const group = w.groups.find((g) => g.folder && same(g.folder, a.path as string))
        if (group) {
          // the project already exists: go to its latest chat, or start one
          const chats = w.chats.filter((c) => c.projectId === group.id && !c.archived)
          const recent = chats.sort((x, y) => y.updatedAt - x.updatedAt)[0]
          if (recent) w.select(recent.id)
          else w.newChat(group.id)
        } else {
          // not a project yet: the New project dialog, already filled in with this folder
          const name = a.path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
          w.setDialog({ kind: 'new-project', folder: a.path, name })
        }
      }
    }
    const off = api.onOpenAction(handle)
    void api.takePendingAction().then((a) => a && handle(a))
    return off
  }, [])

  // keep the jump list's "Recent projects" in step with the projects in the sidebar
  const projectList = ws.groups
    .filter((g) => g.folder)
    .map((g) => ({ name: g.name, path: g.folder as string }))
    .slice(-8)
    .reverse()
  const projectKey = JSON.stringify(projectList)
  useEffect(() => {
    window.api?.app?.setRecentProjects?.(JSON.parse(projectKey))
  }, [projectKey])

  return (
    <>
      <CommandPalette />
      <MoveDialog
        chatId={dialog?.kind === 'move' ? dialog.chatId : null}
        onClose={close}
        onNewProject={() =>
          dialog?.kind === 'move' &&
          ws.setDialog({ kind: 'new-project', moveChatId: dialog.chatId })
        }
      />
      <NameDialog
        open={dialog?.kind === 'new-project'}
        title="New project"
        confirm="Create"
        initialFolder={dialog?.kind === 'new-project' ? dialog.folder : undefined}
        initialName={dialog?.kind === 'new-project' ? dialog.name : undefined}
        chooseFolder={desktop}
        onClose={close}
        onSubmit={(name, folder) => {
          void (async () => {
            const created = folder ? null : await window.api?.workspace?.createProject(name)
            const projectFolder = folder ?? created?.root
            if (!projectFolder) {
              toast.error('Could not create a project folder in Documents')
              return
            }
            const id = ws.addGroup(name, projectFolder)
            if (dialog?.kind === 'new-project' && dialog.moveChatId) ws.moveTo(dialog.moveChatId, id)
            else ws.newChat(id)
            close()
          })()
        }}
      />
      <NameDialog
        open={Boolean(renaming)}
        title="Rename project"
        initial={renaming?.name ?? ''}
        confirm="Save"
        onClose={close}
        onSubmit={(name) => {
          if (renaming) ws.renameGroup(renaming.id, name)
          close()
        }}
      />
    </>
  )
}
