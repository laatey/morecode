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
} from '@/components/icons'
import { toast } from 'sonner'
import type { ActionMenuItem } from '@/components/action-menu'
import { HOSTED, hostedRequest } from '@/features/auth/http-auth-service'
import { toHistory } from '@/features/ai-assistant/use-chat'
import { chatToMarkdown, chatToTranscript, useWorkspace, type Chat } from './workspace-store'

const ICON = 'h-[13px] w-[13px] stroke-[1.8]'

/** Copy a whole chat to the clipboard as Markdown. */
export function useCopyChat(): (chat: Chat) => void {
  const ws = useWorkspace()
  return (chat) => {
    const md = chatToMarkdown(chat.title, ws.getMessages(chat.id))
    navigator.clipboard
      .writeText(md)
      .then(() => toast.success('Chat copied'))
      .catch(() => toast.error('Could not copy'))
  }
}

/** Copy a whole chat for debugging: every message, tool call input and result, and error. */
export function useCopyTranscript(): (chat: Chat) => void {
  const ws = useWorkspace()
  return (chat) => {
    const text = chatToTranscript(chat.title, ws.getMessages(chat.id))
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Full transcript copied'))
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
const SHARE_URLS = 'morecode:share-urls:v1'
const urlMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SHARE_URLS) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}
const setShared = (id: string, token: string | null, url?: string): void => {
  const map = sharedMap()
  const urls = urlMap()
  if (token) {
    map[id] = token
    if (url) urls[id] = url
  } else {
    delete map[id]
    delete urls[id]
  }
  try {
    localStorage.setItem(SHARES, JSON.stringify(map))
    localStorage.setItem(SHARE_URLS, JSON.stringify(urls))
  } catch {
    // the link still works; we just will not remember it is shared
  }
}

/** The link this chat is already shared at, if any (remembered on this computer). */
export function sharedLink(chatId: string): { token: string; url: string } | null {
  const token = sharedMap()[chatId]
  const url = urlMap()[chatId]
  return token && url ? { token, url } : null
}

/**
 * Public read-only link for a chat, hosted on the MoreCode server. Sharing again refreshes the page
 * with the latest messages and keeps the same link.
 */
export function useShareChat(): {
  create: (chat: Chat, access: 'view' | 'comment') => Promise<{ token: string; url: string }>
  share: (chat: Chat) => void
  unshare: (chat: Chat) => Promise<void>
} {
  const ws = useWorkspace()
  const create = (chat: Chat, access: 'view' | 'comment'): Promise<{ token: string; url: string }> => {
    const history = toHistory(ws.getMessages(chat.id))
    if (!history.length) return Promise.reject(new Error('There is nothing in this chat to share yet.'))
    return hostedRequest<{ token: string; url: string }>('POST', '/v1/shares', { chatId: chat.id, title: chat.title, access, messages: history }).then((r) => {
      setShared(chat.id, r.token, r.url)
      return r
    })
  }
  return {
    create,
    share: (chat) => {
      create(chat, 'view')
        .then((r) => navigator.clipboard.writeText(r.url).then(() => toast.success('Share link copied', { description: 'Anyone with the link can read this chat.' })))
        .catch((e: Error) => toast.error(e.message || 'Could not create the link.'))
    },
    unshare: (chat) => {
      const token = sharedMap()[chat.id]
      if (!token) return Promise.resolve()
      return hostedRequest('DELETE', `/v1/shares/${token}`)
        .then(() => {
          setShared(chat.id, null)
          toast.success('This chat is no longer shared')
        })
        .catch(() => void toast.error('Could not stop sharing. Try again.'))
    }
  }
}

/** The same actions in the sidebar row menu and in the title bar menu. */
export function useChatMenu(): (chat: Chat) => ActionMenuItem[] {
  const ws = useWorkspace()
  const copy = useCopyChat()
  const copyTranscript = useCopyTranscript()
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
    {
      id: 'copy-transcript',
      label: 'Copy full transcript',
      description: 'Every message, tool call and result',
      icon: <Copy className={ICON} />,
      onClick: () => copyTranscript(chat)
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
            ? [{ id: 'unshare', label: 'Stop sharing', icon: <Link2Off className={ICON} />, onClick: () => void unshare(chat) }]
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
