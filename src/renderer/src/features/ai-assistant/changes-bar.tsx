import React from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Minimal floating bar above the composer while edits are waiting for review. */
export function ChangesBar({
  files,
  added,
  removed,
  onAccept,
  onDiscard
}: {
  files: number
  added: number
  removed: number
  onAccept: () => void
  onDiscard: () => void
}): React.JSX.Element {
  return (
    <div className="mb-1.5 flex h-7 items-center justify-between rounded-lg border border-white/[0.08] bg-[#272726] px-2.5 text-[11.5px] shadow-sm">
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
