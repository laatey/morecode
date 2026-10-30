import { FileIcon } from '@/components/file-icon'
import React, { useMemo, useState } from 'react'
import { Check, ChevronRight, GitCompare, List, ListTree, Undo2 } from '@/components/icons'
import { SegmentedSwitch } from '@/components/segmented-switch'
import { DiffView, type FileDiff } from '@/components/diff-view'
import { useChatContext, useChatInsights } from '@/features/ai-assistant/chat-context'
import { cn } from '@/lib/utils'
import { FileActions, FileTree } from './file-tree'
import { GitPanel } from './git-panel'
import { Chip, Stats, TabButton, TabEmpty, TabToolbar } from './tab-kit'

type Review = 'pending' | 'accepted' | 'discarded'

interface FileChange {
  path: string
  diff: FileDiff
  review: Review
  /** Every edit that touched this file, so one button can keep or undo them all. */
  editIds: string[]
}

const STATUS: Record<Review, { label: string; tone: 'warn' | 'good' | 'neutral' }> = {
  pending: { label: 'Needs review', tone: 'warn' },
  accepted: { label: 'Kept', tone: 'good' },
  discarded: { label: 'Undone', tone: 'neutral' }
}

function FileCard({
  file,
  onKeep,
  onUndo,
  showFolder = true
}: {
  file: FileChange
  onKeep: () => void
  onUndo: () => void
  /** In the tree view the folder is already shown above, so the card drops it. */
  showFolder?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(file.review === 'pending')
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length)
  const status = STATUS[file.review]
  const undone = file.review === 'discarded'

  return (
    <section className="group overflow-hidden rounded-[8px] border border-white/[0.08] bg-white/[0.02]">
      <header className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
          <FileIcon name={name} />
          <span className="min-w-0 truncate text-[12.5px]">
            <span className={cn('font-medium text-[#ececea]', undone && 'text-muted-foreground line-through')}>
              {name}
            </span>
            {showFolder && <span className="ml-1.5 text-[11.5px] text-muted-foreground">{dir}</span>}
          </span>
        </button>
        <FileActions
          path={file.path}
          canOpen={!undone}
          className="opacity-0 focus-within:opacity-100 group-hover:opacity-100"
        />
        {!undone && <Stats added={file.diff.additions} removed={file.diff.deletions} />}
        <Chip tone={status.tone}>{status.label}</Chip>
      </header>

      {file.review === 'pending' && (
        <div className="flex items-center justify-end gap-1 border-t border-white/[0.06] px-2 py-1">
          <TabButton onClick={onUndo}>
            <Undo2 className="h-3 w-3" /> Undo
          </TabButton>
          <TabButton tone="primary" onClick={onKeep}>
            <Check className="h-3 w-3" /> Keep
          </TabButton>
        </div>
      )}

      {open && !undone && (
        <div className="border-t border-white/[0.06] text-[11.5px]">
          <DiffView file={file.diff} />
        </div>
      )}
    </section>
  )
}

type Mode = 'review' | 'save'

/** The AI's edits to review, one card per file. `tree` groups them by folder. */
function ReviewView({ tree }: { tree: boolean }): React.JSX.Element {
  const { reviewOne, acceptAll, discardAll } = useChatContext()
  const { edits } = useChatInsights()
  const [filter, setFilter] = useState<'review' | 'all'>('all')

  const files = useMemo<FileChange[]>(() => {
    const byPath = new Map<string, FileChange>()
    for (const e of edits) {
      if (!e.diff || e.status === 'running') continue
      const review: Review = e.review ?? 'accepted'
      const seen = byPath.get(e.path)
      if (!seen) {
        byPath.set(e.path, { path: e.path, diff: e.diff, review, editIds: [e.id] })
        continue
      }
      // several edits to one file read as a single set of changes
      seen.diff = {
        ...seen.diff,
        additions: seen.diff.additions + e.diff.additions,
        deletions: seen.diff.deletions + e.diff.deletions,
        hunks: [...seen.diff.hunks, ...e.diff.hunks]
      }
      seen.editIds.push(e.id)
      if (review === 'pending') seen.review = 'pending'
      else if (seen.review !== 'pending' && review === 'accepted') seen.review = 'accepted'
    }
    return [...byPath.values()]
  }, [edits])

  const pending = files.filter((f) => f.review === 'pending')
  const shown = filter === 'review' ? pending : files
  const added = files.filter((f) => f.review !== 'discarded').reduce((n, f) => n + f.diff.additions, 0)
  const removed = files.filter((f) => f.review !== 'discarded').reduce((n, f) => n + f.diff.deletions, 0)

  if (!files.length) {
    return (
      <TabEmpty icon={GitCompare} title="No changes yet">
        When the AI edits your files, they show up here so you can look them over and decide whether
        to keep them.
      </TabEmpty>
    )
  }

  const each = (f: FileChange, to: 'accepted' | 'discarded'): void =>
    f.editIds.forEach((id) => reviewOne(id, to))
  const card = (f: FileChange): React.JSX.Element => (
    <FileCard
      key={f.path}
      file={f}
      showFolder={!tree}
      onKeep={() => each(f, 'accepted')}
      onUndo={() => each(f, 'discarded')}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-3 pt-2">
        {(
          [
            ['all', `All (${files.length})`],
            ['review', `Needs review (${pending.length})`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'cursor-pointer rounded-[6px] px-2 py-0.5 text-[12px] transition-colors',
              filter === id
                ? 'bg-white/[0.09] text-[#ececea]'
                : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <Stats added={added} removed={removed} />
        {pending.length > 0 && (
          <>
            <TabButton onClick={discardAll} className="ml-1 h-6 text-[11.5px]">
              Undo all
            </TabButton>
            <TabButton tone="primary" onClick={acceptAll} className="h-6 text-[11.5px]">
              Keep all
            </TabButton>
          </>
        )}
      </div>

      <div className="slim-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
            Everything has been reviewed. Nice.
          </p>
        ) : tree ? (
          <FileTree items={shown} render={card} />
        ) : (
          shown.map(card)
        )}
      </div>
    </div>
  )
}

/**
 * "Changes": review what the AI edited (as a list or a folder tree), then save a version of the
 * project and send it for review.
 */
export function DiffTab(): React.JSX.Element {
  const { edits } = useChatInsights()
  const [mode, setMode] = useState<Mode>('review')
  const [tree, setTree] = useState(false)
  const count = new Set(edits.filter((e) => e.diff && e.status !== 'running').map((e) => e.path)).size

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar className="py-1">
        <div className="flex items-center gap-0.5">
          {(
            [
              ['review', count ? `Review (${count})` : 'Review'],
              ['save', 'Save and share']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                'cursor-pointer rounded-[6px] px-2 py-0.5 text-[12px] transition-colors',
                mode === id ? 'bg-white/[0.09] text-[#ececea]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {mode === 'review' && (
          <SegmentedSwitch
            options={[
              { value: 'list', icon: <List className="h-3.5 w-3.5" />, title: 'Show as a list' },
              { value: 'tree', icon: <ListTree className="h-3.5 w-3.5" />, title: 'Group by folder' }
            ]}
            value={tree ? 'tree' : 'list'}
            onChange={(v) => setTree(v === 'tree')}
            itemWidth={30}
            height={24}
          />
        )}
      </TabToolbar>
      <div className="min-h-0 flex-1">{mode === 'review' ? <ReviewView tree={tree} /> : <GitPanel />}</div>
    </div>
  )
}
