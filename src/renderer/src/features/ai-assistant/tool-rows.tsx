import React, { useState } from 'react'
import { Check, ChevronRight, Circle, CircleDot, ClipboardList, X } from 'lucide-react'
import { DiffView } from '@/components/diff-view'
import { Tip } from '@/components/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRightPanel } from '@/features/right-panel/store'
import { useChatContext } from './chat-context'
import { PermissionCard } from './permission-card'
import { ThinkingBlock } from './thinking-block'
import type { TodoItem, ToolBlock, ToolStatus } from './types'

function Spinner(): React.JSX.Element {
  return (
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-dashed border-muted-foreground" />
  )
}

function Stats({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  return (
    <span className="text-[12px] tabular-nums">
      {added > 0 && <span className="text-[var(--diff-add)]">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-[var(--diff-del)]">-{removed}</span>}
    </span>
  )
}

function Row({
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
        'group flex min-h-6 w-full items-center gap-2 rounded-[4px] px-1 py-0.5 text-left text-[12.5px] text-[#c9c9c6]',
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

const todoIcon: Record<TodoItem['status'], React.ReactNode> = {
  done: <Check className="h-3 w-3 text-[var(--diff-add)]" />,
  active: <CircleDot className="h-3 w-3 text-[#6ea8fe]" />,
  pending: <Circle className="h-3 w-3 text-muted-foreground/60" />
}

/** One tool call as a compact, expandable row (file edit, command, todo list). */
function MiniAction({
  label,
  onClick,
  strong
}: {
  label: string
  onClick: () => void
  strong?: boolean
}): React.JSX.Element {
  // a span, not a button: it sits inside the row's own button
  const act = (e: React.SyntheticEvent): void => {
    e.stopPropagation()
    onClick()
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={act}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && act(e)}
      className={cn(
        'cursor-pointer rounded-[6px] px-2 text-[11.5px] leading-[18px] transition-colors',
        strong
          ? 'border border-[#4a7fe0]/60 bg-[#1d4fb4] text-[#eaf1ff] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-[#6c9aee]/70 hover:bg-[#2359c4] active:bg-[#1a46a0]'
          : 'border border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
      )}
    >
      {label}
    </span>
  )
}

export function ToolRow({ tool }: { tool: ToolBlock }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { openTab } = useRightPanel()
  const { reviewOne } = useChatContext()

  if (tool.kind === 'permission') return <PermissionCard tool={tool} />

  if (tool.kind === 'read') {
    const names = tool.paths.map((p) => p.split('/').pop() ?? p)
    return (
      <Row expandable={false} open={false} onToggle={() => undefined} status={tool.status}>
        <span className="text-muted-foreground">{tool.status === 'running' ? 'Reading' : 'Read'}</span>
        <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
          {names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')}
        </span>
      </Row>
    )
  }

  if (tool.kind === 'thinking') {
    return <ThinkingBlock text={tool.text} status={tool.status} durationMs={tool.durationMs} />
  }

  if (tool.kind === 'plan') {
    return (
      <div className="flex min-h-7 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        <ClipboardList className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[#d6d6d3]">{tool.state === 'approved' ? 'Plan approved' : 'Plan ready'}</span>
        <span className="min-w-0 truncate text-muted-foreground">{tool.title}</span>
        <span className="flex-1" />
        <Button variant="secondary" size="xs" onClick={() => openTab('plan')}>
          {tool.state === 'approved' ? 'View' : 'Review'}
        </Button>
      </div>
    )
  }

  if (tool.kind === 'edit') {
    const name = tool.path.split('/').pop() ?? tool.path
    const discarded = tool.review === 'discarded'
    return (
      <div>
        <Row
          expandable={Boolean(tool.diff) && !discarded}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          status={tool.status}
        >
          <span className="text-muted-foreground">
            {tool.status === 'running' ? 'Editing' : discarded ? 'Discarded' : 'Edited'}
          </span>
          <Tip label={tool.path} side="top" align="start">
            <span
              className={cn(
                'min-w-0 truncate font-medium text-[#e2e2e0] rounded-[4px] bg-white/[0.05] px-1.5 py-0 text-[12px] leading-[18px]',
                discarded && 'text-muted-foreground line-through'
              )}
            >
              {name}
            </span>
          </Tip>
          {!discarded && <Stats added={tool.added} removed={tool.removed} />}
          {tool.review === 'pending' && tool.status === 'done' && (
            <>
              <span className="flex-1" />
              <MiniAction label="Undo" onClick={() => reviewOne(tool.id, 'discarded')} />
              <MiniAction label="Keep" strong onClick={() => reviewOne(tool.id, 'accepted')} />
            </>
          )}
        </Row>
        {open && tool.diff && (
          <div className="my-1 ml-1 overflow-hidden rounded-[6px] border border-white/[0.08] text-[11.5px]">
            <DiffView file={tool.diff} />
          </div>
        )}
      </div>
    )
  }

  if (tool.kind === 'command') {
    return (
      <div>
        <Row
          expandable={Boolean(tool.output)}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          status={tool.status}
        >
          <span className="text-[#d6d6d3]">{tool.label}</span>
        </Row>
        {open && (
          <pre className="my-1 ml-1 overflow-x-auto rounded-[6px] border border-white/[0.08] px-3 py-2 font-mono text-[11.5px] leading-5 text-[#a9a9a6]">
            <span className="text-muted-foreground">$ {tool.command}</span>
            {'\n'}
            {tool.output}
          </pre>
        )}
      </div>
    )
  }

  const done = tool.items.filter((i) => i.status === 'done').length
  return (
    <div>
      <Row expandable open={open} onToggle={() => setOpen((o) => !o)}>
        <span className="text-[#d6d6d3]">Task list</span>
        <span className="text-muted-foreground">
          {done} of {tool.items.length} done
        </span>
      </Row>
      {open && (
        <ul className="my-1 ml-1 space-y-1 px-1 text-[12.5px]">
          {tool.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              {todoIcon[item.status]}
              <span className={cn(item.status === 'done' && 'text-muted-foreground line-through')}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
