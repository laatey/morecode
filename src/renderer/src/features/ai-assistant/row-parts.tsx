import React from 'react'
import { ChevronRight, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { ToolStatus } from './types'

export function Spinner(): React.JSX.Element {
  return (
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-dashed border-muted-foreground" />
  )
}

export function Stats({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  return (
    <span className="text-[12px] tabular-nums">
      {added > 0 && <span className="text-[var(--diff-add)]">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-[var(--diff-del)]">-{removed}</span>}
    </span>
  )
}

export function Row({
  expandable,
  open,
  onToggle,
  status,
  children
}: {
  expandable: boolean
  open: boolean
  onToggle: () => void
  status?: ToolStatus
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={expandable ? onToggle : undefined}
      className={cn(
        'group flex min-h-6 min-w-0 w-full items-center gap-2 rounded-[4px] px-1 py-0.5 text-left text-[12.5px] text-[#c9c9c6] [overflow-wrap:normal]',
        expandable ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
      )}
    >
      {status === 'running' && <Spinner />}
      {status === 'error' && <X className="h-3 w-3 shrink-0 text-[var(--diff-del)]" />}
      {children}
      {expandable && (
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
            open && 'rotate-90'
          )}
        />
      )}
    </button>
  )
}
