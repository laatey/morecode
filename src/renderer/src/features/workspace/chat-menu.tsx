import {
  Archive,
  ArchiveRestore,
  Copy,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  FolderInput,
  Link2,
  Link2Off
} from 'lucide-react'
import { toast } from 'sonner'
import type { ActionMenuItem } from '@/components/action-menu'
import { HOSTED, hostedRequest } from '@/features/auth/http-auth-service'
import { toHistory } from '@/features/ai-assistant/use-chat'
import { chatToMarkdown, useWorkspace, type Chat } from './workspace-store'

const ICON = 'h-[13px] w-[13px] stroke-[1.8]'

/** Copy a whole chat to the clipboard as Markdown. */
export function useCopyChat(): (chat: Chat) => void {
  const ws = useWorkspace()
  return (chat) => {
    const md = chatToMarkdown(chat.title, ws.getMessages(chat.id))
    navigator.clipboard
      .writeText(md)
      .then(() => toast('Chat copied'))
      .catch(() => toast.error('Could not copy'))
  }
}

const SHARES = 'morecode:shares:v1'
const sharedMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SHARES) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}
const setShared = (id: string, token: string | null): void => {
  const map = sharedMap()
  if (token) map[id] = token
  else delete map[id]
  try {
    localStorage.setItem(SHARES, JSON.stringify(map))
  } catch {
    // the link still works; we just will not remember it is shared
  }
}

/**
 * Public read-only link for a chat, hosted on the MoreCode server. Sharing again refreshes the page
 * with the latest messages and keeps the same link.
 */
export function useShareChat(): { share: (chat: Chat) => void; unshare: (chat: Chat) => void } {
  const ws = useWorkspace()
  return {
    share: (chat) => {
      const history = toHistory(ws.getMessages(chat.id))
      if (!history.length) return void toast('There is nothing in this chat to share yet.')
      hostedRequest<{ token: string; url: string }>('POST', '/v1/shares', { chatId: chat.id, title: chat.title, access: 'view', messages: history })
        .then((r) => {
          setShared(chat.id, r.token)
          return navigator.clipboard.writeText(r.url).then(() => toast('Share link copied', { description: 'Anyone with the link can read this chat.' }))
        })
        .catch((e: Error) => toast.error(e.message || 'Could not create the link.'))
    },
    unshare: (chat) => {
      const token = sharedMap()[chat.id]
      if (!token) return
      hostedRequest('DELETE', `/v1/shares/${token}`)
        .then(() => {
          setShared(chat.id, null)
          toast('This chat is no longer shared')
        })
        .catch(() => toast.error('Could not stop sharing. Try again.'))
    }
  }
}

/** The same actions in the sidebar row menu and in the title bar menu. */
export function useChatMenu(): (chat: Chat) => ActionMenuItem[] {
  const ws = useWorkspace()
  const copy = useCopyChat()
  const { share, unshare } = useShareChat()
  return (chat) => [
    {
      id: 'pin',
      label: chat.pinned ? 'Unpin' : 'Pin to top',
      icon: chat.pinned ? <PinOff className={ICON} /> : <Pin className={ICON} />,
      onClick: () => ws.togglePin(chat.id)
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil className={ICON} />,
      onClick: () => ws.startRename(chat.id)
    },
    {
      id: 'project',
      label: 'Add to project',
      icon: <FolderInput className={ICON} />,
      separatorBefore: true,
      onClick: () => ws.setDialog({ kind: 'move', chatId: chat.id })
    },
    {
      id: 'copy',
      label: 'Copy as Markdown',
      icon: <Copy className={ICON} />,
      onClick: () => copy(chat)
    },
    ...(HOSTED
      ? [
          {
            id: 'share',
            label: 'Copy share link',
            icon: <Link2 className={ICON} />,
            onClick: () => share(chat)
          },
          ...(sharedMap()[chat.id]
            ? [{ id: 'unshare', label: 'Stop sharing', icon: <Link2Off className={ICON} />, onClick: () => unshare(chat) }]
            : [])
        ]
      : []),
    {
      id: 'archive',
      label: chat.archived ? 'Restore' : 'Archive',
      icon: chat.archived ? <ArchiveRestore className={ICON} /> : <Archive className={ICON} />,
      separatorBefore: true,
      onClick: () => ws.toggleArchive(chat.id)
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className={ICON} />,
      danger: true,
      onClick: () => ws.remove(chat.id)
    }
  ]
}
