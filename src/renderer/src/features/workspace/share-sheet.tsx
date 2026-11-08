import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Check, Copy, Download, Link2, Link2Off, Mail } from '@/components/icons'
import { IconButton } from '@/components/layout/icon-button'
import { ShareIcon } from '@/components/layout/icons'
import { HOSTED } from '@/features/auth/http-auth-service'
import { chatToMarkdown, useWorkspace } from './workspace-store'
import { sharedLink, useCopyTranscript, useShareChat } from './chat-menu'

const ICON = 'h-[14px] w-[14px] stroke-[1.8]'
const enc = encodeURIComponent

/** A row in the sheet: icon, label, optional hint, one action. */
function Item({ icon, label, hint, onClick, disabled }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-foreground/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  )
}

/**
 * The title bar's Share button: a sheet that drops down with the ways to get this chat to someone. A link anyone can
 * open (view only, or with comments), quick sends by email and WhatsApp, the system's own share sheet where there is one,
 * and a copy or download of the text. The link needs a MoreCode server; the text options always work.
 */
export function ShareSheet(): React.JSX.Element {
  const ws = useWorkspace()
  const chat = ws.active
  const { create, unshare } = useShareChat()
  const copyTranscript = useCopyTranscript()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState(() => sharedLink(chat.id))
  const [access, setAccess] = useState<'view' | 'comment'>('view')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const empty = ws.getMessages(chat.id).length === 0

  // read what this chat is already shared as each time the sheet opens, or the chat changes
  useEffect(() => {
    if (open) setLink(sharedLink(chat.id))
    setCopied(false)
  }, [open, chat.id])

  const make = (): void => {
    setBusy(true)
    create(chat, access)
      .then((r) => setLink(r))
      .catch((e: Error) => toast.error(e.message || 'Could not create the link.'))
      .finally(() => setBusy(false))
  }
  const copyLink = (): void => {
    if (!link) return
    navigator.clipboard
      .writeText(link.url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => toast.error('Could not copy'))
  }
  const stop = (): void => {
    setBusy(true)
    void unshare(chat).then(() => {
      setLink(sharedLink(chat.id))
      setBusy(false)
    })
  }
  const text = (): string => chatToMarkdown(chat.title, ws.getMessages(chat.id))
  const copyMarkdown = (): void => {
    navigator.clipboard
      .writeText(text())
      .then(() => toast.success('Chat copied as Markdown'))
      .catch(() => toast.error('Could not copy'))
  }
  const download = (): void => {
    const file = new Blob([text()], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = `${(chat.title || 'chat').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'chat'}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton title="Share" aria-pressed={open}>
          <ShareIcon />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[320px] select-none p-1.5">
        <div className="px-2 pb-1 pt-1.5 text-[13px] font-medium text-foreground">Share this chat</div>

        {HOSTED ? (
          <div className="mx-1 mb-1.5 rounded-lg border border-border bg-foreground/[0.03] p-2.5">
            {link ? (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={link.url}
                    aria-label="Share link"
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 text-[12px] text-muted-foreground outline-none focus:text-foreground"
                  />
                  <Button size="xs" onClick={copyLink} className="h-7 shrink-0 gap-1 px-2.5 text-[12px]">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Anyone with the link can open this chat. It shows the chat as it was when you last updated the link.</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button size="xs" variant="secondary" disabled={busy || empty} onClick={make} className="h-6 px-2 text-[11.5px]">
                    Update link
                  </Button>
                  <Button size="xs" variant="ghost" disabled={busy} onClick={stop} className="h-6 gap-1 px-2 text-[11.5px] text-muted-foreground">
                    <Link2Off className="h-3 w-3" /> Stop sharing
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex gap-1 rounded-md bg-foreground/[0.06] p-0.5" role="radiogroup" aria-label="Who can do what">
                  {(['view', 'comment'] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={access === a}
                      onClick={() => setAccess(a)}
                      className={`flex-1 cursor-pointer rounded-[5px] px-2 py-1 text-[12px] transition-colors ${access === a ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {a === 'view' ? 'Can view' : 'Can comment'}
                    </button>
                  ))}
                </div>
                <Button size="xs" disabled={busy || empty} onClick={make} className="h-7 w-full gap-1.5 text-[12px]">
                  <Link2 className="h-3.5 w-3.5" /> {busy ? 'Creating…' : 'Create link'}
                </Button>
                <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{empty ? 'Send a message first: there is nothing in this chat to share yet.' : 'Anyone you send the link to can open it. You can stop sharing at any time.'}</p>
              </>
            )}
          </div>
        ) : (
          <p className="mx-2 mb-1.5 text-[11.5px] leading-4 text-muted-foreground">Share links need you to be signed in to a MoreCode server. You can still copy or download the chat below.</p>
        )}

        {link && (
          <>
            <Item icon={<Mail className={ICON} />} label="Send by email" onClick={() => window.open(`mailto:?subject=${enc(chat.title)}&body=${enc(`Have a look at this chat: ${link.url}`)}`)} />
            <Item
              icon={<span className="text-[13px] font-semibold leading-none">W</span>}
              label="Send on WhatsApp"
              onClick={() => window.open(`https://wa.me/?text=${enc(`${chat.title}\n${link.url}`)}`, '_blank', 'noopener')}
            />
            {nativeShare && (
              <Item
                icon={<ShareIcon />}
                label="More apps…"
                hint="Use your system's share sheet"
                onClick={() => void navigator.share({ title: chat.title, url: link.url }).catch(() => {})}
              />
            )}
            <div className="mx-2 my-1 border-t border-border/60" />
          </>
        )}

        <Item icon={<Copy className={ICON} />} label="Copy as Markdown" disabled={empty} onClick={copyMarkdown} />
        <Item icon={<Download className={ICON} />} label="Download as Markdown" disabled={empty} onClick={download} />
        <Item icon={<Copy className={ICON} />} label="Copy full transcript" hint="Every message, tool call and result" disabled={empty} onClick={() => copyTranscript(chat)} />
      </PopoverContent>
    </Popover>
  )
}
