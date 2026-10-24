import React, { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useWorkspace } from './workspace-store'
import { CommandPalette } from '@/features/palette/command-palette'

const SURFACE =
  'fixed left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.09] bg-[#262625] shadow-[0_16px_50px_rgba(0,0,0,0.55)] outline-none'

const Overlay = (): React.JSX.Element => (
  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
)

/** One-line text prompt: new project, rename project. */
export function NameDialog({
  open,
  title,
  initial = '',
  confirm,
  onClose,
  onSubmit,
  chooseFolder
}: {
  open: boolean
  title: string
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
        <Dialog.Content className={cn(SURFACE, 'top-[22vh] p-4')} aria-describedby={undefined}>
          <Dialog.Title className="mb-3 text-[13.5px] font-medium text-[#ececea]">
            {title}
          </Dialog.Title>
          <NameForm
            initial={initial}
            confirm={confirm}
            onClose={onClose}
            onSubmit={onSubmit}
            chooseFolder={chooseFolder}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
        className="h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 text-[13px] outline-none placeholder:text-[#77776f] focus:border-white/[0.25]"
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
          className="h-8 cursor-pointer rounded-md bg-white/[0.12] px-3 text-[12.5px] text-[#ececea] hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
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
    'flex h-8 w-full cursor-pointer items-center rounded-md px-2.5 text-left text-[13px] hover:bg-white/[0.07]'
  return (
    <Dialog.Root open={Boolean(chatId)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={cn(SURFACE, 'top-[22vh] p-1.5')} aria-describedby={undefined}>
          <Dialog.Title className="px-2.5 pb-1 pt-2 text-[12px] text-[#77776f]">
            Add to project
          </Dialog.Title>
          {ws.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={cn(row, chat?.projectId === g.id && 'text-[#7db1ff]')}
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
        'min-w-0 rounded bg-white/[0.08] px-1.5 outline-none ring-1 ring-white/[0.2]',
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
        chooseFolder={desktop}
        onClose={close}
        onSubmit={(name, folder) => {
          void (async () => {
            const created = folder ? null : await window.api?.workspace?.createProject(name)
            const projectFolder = folder ?? created?.root
            if (!projectFolder) {
              toast('Could not create a project folder in Documents')
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
