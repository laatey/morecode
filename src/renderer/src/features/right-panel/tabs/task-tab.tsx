import React, { useState } from 'react'
import { Check, ChevronRight, ListTodo, Terminal, X } from '@/components/icons'
import { useChatContext, useChatInsights } from '@/features/ai-assistant/chat-context'
import { cn } from '@/lib/utils'
import { useRightPanel } from '../store'
import { Chip, TabButton, TabEmpty } from './tab-kit'

function StepIcon({ status }: { status: 'pending' | 'active' | 'done' }): React.JSX.Element {
  if (status === 'done') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full bg-success/20 text-success">
        <Check className="h-2.5 w-2.5 stroke-[3]" />
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full border border-primary/60">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      </span>
    )
  }
  return <span className="block h-4 w-4 rounded-full border border-border-strong" />
}

/** "Tasks": the AI's to-do list for this chat, plus the checks it has run. */
export function TaskTab(): React.JSX.Element {
  const { running } = useChatContext()
  const { todos, commands, edits } = useChatInsights()
  const { openTab } = useRightPanel()
  const [openCmd, setOpenCmd] = useState<string | null>(null)

  if (!todos.length && !commands.length) {
    return (
      <TabEmpty icon={ListTodo} title="No tasks yet">
        When you ask the AI to build or fix something, its to-do list appears here and ticks off as it
        goes.
      </TabEmpty>
    )
  }

  const done = todos.filter((t) => t.status === 'done').length
  const percent = todos.length ? Math.round((done / todos.length) * 100) : 0
  const finished = todos.length > 0 && done === todos.length
  const changed = new Set(edits.map((e) => e.path)).size

  return (
    <div className="slim-scroll h-full overflow-y-auto">
      <div className="space-y-5 p-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-foreground">
              {finished ? 'All done' : running ? 'Working on it' : 'Progress'}
            </h2>
            <Chip tone={finished ? 'good' : running ? 'warn' : 'neutral'}>
              {finished ? 'Finished' : running ? 'In progress' : 'Paused'}
            </Chip>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-foreground/[0.08]">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', finished ? 'bg-success' : 'bg-primary')}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
            {done} of {todos.length} steps done
            {changed > 0 && ` · ${changed} ${changed === 1 ? 'file' : 'files'} changed`}
          </p>
        </section>

        {todos.length > 0 && (
          <ol className="divide-y divide-border/50 overflow-hidden rounded-[8px] border border-border">
            {todos.map((t, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-start gap-2.5 px-3 py-2 text-[12.5px] leading-5',
                  t.status === 'active' && 'bg-foreground/[0.045]'
                )}
              >
                <span className="mt-[2px] flex shrink-0">
                  <StepIcon status={t.status} />
                </span>
                <span
                  className={cn(
                    'min-w-0 break-words',
                    t.status === 'done' && 'text-muted-foreground',
                    t.status === 'active' && 'text-foreground',
                    t.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {t.text}
                </span>
              </li>
            ))}
          </ol>
        )}

        {commands.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[12px] font-medium text-muted-foreground">
                Checks it ran <span className="ml-1 tabular-nums text-faint-foreground">{commands.length}</span>
              </h3>
              <TabButton onClick={() => openTab('terminal')} className="h-6 px-1.5 text-[11.5px]">
                <Terminal className="h-3 w-3" /> Open terminal
              </TabButton>
            </div>
            <ul className="space-y-1">
              {commands.map((c) => {
                const open = openCmd === c.id
                return (
                  <li key={c.id} className="rounded-[6px] border border-border/50">
                    <button
                      type="button"
                      onClick={() => setOpenCmd(open ? null : c.id)}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-1.5 text-left text-[12.5px]"
                    >
                      <span
                        className="mt-[3px] flex shrink-0"
                        title={c.status === 'done' ? 'Passed' : c.status === 'error' ? 'Failed' : 'Running'}
                        role="img"
                        aria-label={c.status === 'done' ? 'Passed' : c.status === 'error' ? 'Failed' : 'Running'}
                      >
                        {c.status === 'done' ? (
                          <Check className="h-3.5 w-3.5 stroke-[2.5] text-success" />
                        ) : c.status === 'error' ? (
                          <X className="h-3.5 w-3.5 stroke-[2.5] text-destructive" />
                        ) : (
                          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-warning/30 border-t-warning" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 break-words leading-5 text-soft-foreground">{c.label}</span>
                      <ChevronRight
                        className={cn('mt-1 h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
                      />
                    </button>
                    {open && (
                      <pre className="slim-scroll overflow-x-auto border-t border-border/50 px-3 py-2 font-mono text-[11.5px] leading-5 text-muted-foreground">
                        <span className="text-muted-foreground">$ {c.command}</span>
                        {c.output ? `\n${c.output}` : ''}
                      </pre>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
