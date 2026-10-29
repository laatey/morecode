import React, { useState } from 'react'
import { Check, ChevronRight, ListTodo, Terminal } from '@/components/icons'
import { useChatContext, useChatInsights } from '@/features/ai-assistant/chat-context'
import { cn } from '@/lib/utils'
import { useRightPanel } from '../store'
import { Chip, TabButton, TabEmpty } from './tab-kit'

function StepIcon({ status }: { status: 'pending' | 'active' | 'done' }): React.JSX.Element {
  if (status === 'done') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full bg-[#3fb950]/20 text-[#5fd17a]">
        <Check className="h-2.5 w-2.5 stroke-[3]" />
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full border border-[#3b82f6]/60">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5aa6ff]" />
      </span>
    )
  }
  return <span className="h-4 w-4 rounded-full border border-white/[0.18]" />
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
            <h2 className="text-[13px] font-medium text-[#ececea]">
              {finished ? 'All done' : running ? 'Working on it' : 'Progress'}
            </h2>
            <Chip tone={finished ? 'good' : running ? 'warn' : 'neutral'}>
              {finished ? 'Finished' : running ? 'In progress' : 'Paused'}
            </Chip>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', finished ? 'bg-[#3fb950]' : 'bg-[#3b82f6]')}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            {done} of {todos.length} steps done
            {changed > 0 && ` · ${changed} ${changed === 1 ? 'file' : 'files'} changed`}
          </p>
        </section>

        {todos.length > 0 && (
          <ol className="space-y-0.5">
            {todos.map((t, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-start gap-2.5 rounded-[6px] px-2 py-1.5 text-[12.5px] leading-5',
                  t.status === 'active' && 'bg-white/[0.05]'
                )}
              >
                <span className="mt-[2px]">
                  <StepIcon status={t.status} />
                </span>
                <span
                  className={cn(
                    t.status === 'done' && 'text-muted-foreground',
                    t.status === 'active' && 'text-[#ececea]',
                    t.status === 'pending' && 'text-[#a8a8a6]'
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
              <h3 className="text-[12px] font-medium text-[#a8a8a6]">Checks it ran</h3>
              <TabButton onClick={() => openTab('terminal')} className="h-6 px-1.5 text-[11.5px]">
                <Terminal className="h-3 w-3" /> Open terminal
              </TabButton>
            </div>
            <ul className="space-y-1">
              {commands.map((c) => {
                const open = openCmd === c.id
                return (
                  <li key={c.id} className="rounded-[6px] border border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => setOpenCmd(open ? null : c.id)}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[#d6d6d3]">{c.label}</span>
                      <Chip tone={c.status === 'done' ? 'good' : c.status === 'error' ? 'bad' : 'warn'}>
                        {c.status === 'done' ? 'Passed' : c.status === 'error' ? 'Failed' : 'Running'}
                      </Chip>
                      <ChevronRight
                        className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
                      />
                    </button>
                    {open && (
                      <pre className="slim-scroll overflow-x-auto border-t border-white/[0.06] px-3 py-2 font-mono text-[11.5px] leading-5 text-[#a9a9a6]">
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
