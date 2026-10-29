import React, { useState } from 'react'
import { CornerDownRight, Pencil, SendHorizontal, Trash2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { stackTabClass } from './background-tasks-bar'

export interface QueueItem {
  id: string
  /** What the person typed (a command stays a command until it is sent). */
  raw: string
}

const icon =
  'grid h-5 w-5 cursor-pointer place-items-center rounded text-[#8e8e8a] transition-colors hover:bg-white/[0.08] hover:text-foreground'

/**
 * Messages typed while the AI is busy. It is a tab on the message box, like the changes bar, and the
 * two stack: the queue sits behind the changes bar, which sits behind the box.
 */
export function QueueBar({
  items,
  running,
  stackIndex = 0,
  onSendNow,
  onEdit,
  onDelete
}: {
  items: QueueItem[]
  running: boolean
  stackIndex?: number
  onSendNow: (id: string) => void
  onEdit: (id: string, raw: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const save = (): void => {
    if (editing && draft.trim()) onEdit(editing, draft.trim())
    setEditing(null)
  }

  return (
    <div
      className={cn(
        'relative -mb-3 rounded-t-2xl border border-b-0 px-2.5 pb-3.5 pt-1 text-[11.5px]',
        stackTabClass(stackIndex)
      )}
    >
      <ul className="slim-scroll max-h-[96px] space-y-0.5 overflow-y-auto">
        {items.map((it, idx) =>
          editing === it.id ? (
            <li key={it.id} className="flex h-6 items-center gap-1 px-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') setEditing(null)
                }}
                className="h-5 min-w-0 flex-1 rounded border border-white/[0.14] bg-black/20 px-1.5 text-[11.5px] text-foreground outline-none focus:border-primary/60"
              />
              <button type="button" onClick={save} className="h-5 cursor-pointer rounded bg-white/[0.1] px-1.5 text-[10.5px] hover:bg-white/[0.16]">
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)} className="h-5 cursor-pointer rounded px-1 text-[10.5px] text-[#8e8e8a] hover:text-foreground">
                Cancel
              </button>
            </li>
          ) : (
            <li key={it.id} className="group flex h-6 items-center gap-1.5 rounded-md px-1 hover:bg-white/[0.04]">
              <CornerDownRight className="h-3 w-3 shrink-0 text-[#6f6f6b]" />
              <span className="shrink-0 text-[10.5px] text-[#8e8e8a]">
                {items.length > 1 ? `${idx + 1}/${items.length} queued` : `Queued${running ? '' : ' · paused'}`}
              </span>
              <span className="text-[#555552]">·</span>
              <span className="min-w-0 flex-1 truncate text-[#d6d6d3]" title={it.raw}>
                {it.raw}
              </span>
              <button type="button" title="Send now" aria-label="Send now" className={icon} onClick={() => onSendNow(it.id)}>
                <SendHorizontal className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Edit"
                aria-label="Edit queued message"
                className={icon}
                onClick={() => {
                  setDraft(it.raw)
                  setEditing(it.id)
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button type="button" title="Delete" aria-label="Delete queued message" className={icon} onClick={() => onDelete(it.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  )
}
