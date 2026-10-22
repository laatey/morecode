import React, { useEffect, useRef, useState } from 'react'
import { History, Pencil } from 'lucide-react'
import { AttachmentChip } from './attachments'
import { useChatContext } from './chat-context'
import { CopyButton, IconAction } from './message-actions'
import { ATTACH_ONLY, UserBubble } from './message-parts'
import type { Msg } from './types'
import { buttonVariants } from '@/components/ui/button'

type UserMsg = Extract<Msg, { role: 'user' }>

/** A sent message with copy, edit and "rewind to here" on hover. */
export function UserMessage({
  msg,
  onRewound
}: {
  msg: UserMsg
  /** Called with the message's text after rewinding, so it can go back in the message box. */
  onRewound: (text: string) => void
}): React.JSX.Element {
  const { running, edit, rewind } = useChatContext()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [draft, setDraft] = useState(msg.text)
  const box = useRef<HTMLTextAreaElement>(null)
  const hasText = msg.text.trim() && !ATTACH_ONLY.includes(msg.text)

  useEffect(() => {
    if (!editing) return
    const el = box.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft, editing])

  const save = (): void => {
    const text = draft.trim()
    if (!text) return
    setEditing(false)
    edit(msg.id, text)
  }

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[88%] rounded-[10px] border border-white/[0.14] bg-white/[0.05] p-2">
        <textarea
          ref={box}
          rows={1}
          aria-label="Edit message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
          className="block w-full resize-none bg-transparent px-1 py-0.5 text-[13px] leading-6 outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="px-1 text-[11.5px] text-muted-foreground">
            Sending again replaces everything after this message.
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonVariants({ variant: 'ghost', size: 'xs' })}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={save}
              className={buttonVariants({ size: 'xs' })}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group/msg">
      <div className="flex items-start justify-end gap-1">
        <div className="mt-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
          {hasText && <CopyButton text={msg.text} />}
          {hasText && (
            <IconAction
              label="Edit"
              disabled={running}
              onClick={() => {
                setDraft(msg.text)
                setEditing(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </IconAction>
          )}
          <IconAction label="Rewind to before this message" disabled={running} onClick={() => setConfirm((c) => !c)}>
            <History className="h-3.5 w-3.5" />
          </IconAction>
        </div>
        <UserBubble text={msg.text} images={msg.images}>
          {msg.attachments?.length ? (
            <div className="flex flex-wrap justify-end gap-1">
              {msg.attachments.map((a, i) => (
                <AttachmentChip key={i} item={a} />
              ))}
            </div>
          ) : null}
        </UserBubble>
      </div>
      {confirm && (
        <div className="ml-auto mt-1.5 flex max-w-[88%] items-center justify-end gap-2 text-[12px]">
          <span className="text-muted-foreground">Go back to before this message? Later changes are undone.</span>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className={buttonVariants({ variant: 'ghost', size: 'xs', className: 'h-6 px-2' })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const u = rewind(msg.id)
              setConfirm(false)
              if (u) onRewound(u.text)
            }}
            className={buttonVariants({ variant: 'secondary', size: 'xs', className: 'h-6 px-2' })}
          >
            Rewind
          </button>
        </div>
      )}
    </div>
  )
}
