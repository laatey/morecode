import React from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { stackTabClass } from './background-tasks-bar'

/**
 * Edits waiting for review. It is a tab attached to the top of the message box (slightly lighter,
 * rounded, and narrower than the box so it never touches the edges), not a separate floating bar.
 */
export function ChangesBar({
  files,
  added,
  removed,
  stackIndex = 0,
  onAccept,
  onDiscard
}: {
  files: number
  added: number
  removed: number
  stackIndex?: number
  onAccept: () => void
  onDiscard: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative -mb-3 flex h-10 items-center justify-between rounded-t-2xl border border-b-0 px-3.5 pb-3 text-[11.5px]',
        stackTabClass(stackIndex)
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-[#d6d6d3]">
          {files} {files === 1 ? 'file' : 'files'} changed
        </span>
        <span className="font-mono text-[10.5px] tabular-nums">
          <span className="text-[var(--diff-add)]">+{added}</span>{' '}
          <span className="text-[var(--diff-del)]">−{removed}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDiscard}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'h-5 px-1.5 text-[11px] rounded-[6px]'
          )}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onAccept}
          className={cn(
            buttonVariants({ variant: 'default' }),
            'h-5 px-2 text-[11px] rounded-[6px]'
          )}
        >
          Keep
        </button>
      </div>
    </div>
  )
}
