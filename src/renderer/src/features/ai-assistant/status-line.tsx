import React from 'react'
import { ArrowLeft, GitBranch } from '@/components/icons'
import { Tip } from '@/components/tooltip'

export interface GitInfo {
  base: string
  branch: string
}

/** The strip on top of the composer: branch → base, diff totals, Create PR. */
export function StatusLine({
  git,
  added,
  removed,
  onCreatePr
}: {
  git: GitInfo
  added: number
  removed: number
  onCreatePr: () => void
}): React.JSX.Element {
  const hasChanges = added + removed > 0
  return (
    <div className="flex h-8 items-center gap-2 border-b border-white/[0.1] px-3 text-[12px] text-muted-foreground">
      <GitBranch className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 font-mono text-[11.5px] text-[#d6d6d3]">{git.base}</span>
      <ArrowLeft className="h-3 w-3 shrink-0" />
      <Tip label={git.branch} side="top">
        <span className="min-w-0 truncate font-mono text-[11.5px]">{git.branch}</span>
      </Tip>
      <span className="flex-1" />
      {hasChanges && (
        <span className="shrink-0 font-mono text-[11.5px]">
          <span className="text-[var(--diff-add)]">+{added}</span>{' '}
          <span className="text-[var(--diff-del)]">-{removed}</span>
        </span>
      )}
      <button
        type="button"
        disabled={!hasChanges}
        onClick={onCreatePr}
        className="shrink-0 rounded-[4px] border border-white/[0.14] px-2 py-0.5 text-[11.5px] text-[#d6d6d3] transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Create PR
      </button>
    </div>
  )
}
