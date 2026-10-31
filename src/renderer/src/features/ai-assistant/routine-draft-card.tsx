import React, { useEffect, useRef, useState } from 'react'
import { CalendarClock, Check, ChevronRight } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRoutines } from '@/features/routines/routines-store'
import { useSettings } from '@/features/settings/settings-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { describeSchedule } from '../../../../shared/routine-draft'
import { useChatContext } from './chat-context'
import type { ToolBlock } from './types'

type Tool = Extract<ToolBlock, { kind: 'routine-draft' }>

/**
 * A routine the AI proposed. When the person lets the AI apply things without review (Auto-accept),
 * it is saved the moment it appears and can be undone; otherwise it waits here, editable, for Save.
 */
export function RoutineDraftCard({ tool }: { tool: Tool }): React.JSX.Element {
  const { routines, add, remove } = useRoutines()
  const { active } = useWorkspace()
  const { settings } = useSettings()
  const { running, markRoutine } = useChatContext()

  const [title, setTitle] = useState(tool.draft.title)
  const [prompt, setPrompt] = useState(tool.draft.prompt)
  const { cadence, time, weekday } = tool.draft
  const [full, setFull] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [auto, setAuto] = useState(false)

  const saved = tool.savedId ? routines.find((r) => r.id === tool.savedId) : undefined
  const ready = title.trim() !== '' && prompt.trim() !== ''

  const save = (byAuto = false): void => {
    if (!ready) return
    const id = add({
      title: title.trim(),
      prompt: prompt.trim(),
      cadence,
      time,
      weekday,
      projectId: active.projectId ?? null
    })
    markRoutine(tool.id, id)
    setAuto(byAuto)
  }

  // Auto-accept on: save once, only while the AI is still working (an old chat opened later must not schedule anything)
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current) return
    tried.current = true
    if (!tool.savedId && settings.autoAccept && running) save(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schedule = describeSchedule({ cadence, time, weekday })

  if (dismissed)
    return (
      <div className="px-1 py-1 text-[12px] text-muted-foreground">Routine draft dismissed</div>
    )

  if (tool.savedId) {
    return (
      <div className="flex min-h-7 min-w-0 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        {saved ? (
          <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />
        ) : (
          <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 text-muted-foreground">
          {saved ? (auto ? 'Routine saved' : 'Saved routine') : 'Routine removed'}
        </span>
        <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
          {saved?.title ?? title}
        </span>
        {saved && (
          <span className="hidden shrink-0 text-[11.5px] text-muted-foreground/80 sm:inline">
            {describeSchedule(saved)}
          </span>
        )}
        <span className="flex-1" />
        {saved && (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => window.dispatchEvent(new CustomEvent('app:open-routines'))}
            >
              View
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                remove(saved.id)
                markRoutine(tool.id, undefined)
                tried.current = true
              }}
            >
              Undo
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="my-1 rounded-[10px] border border-white/[0.08] p-3">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          aria-label="Routine name"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 truncate rounded-[4px] bg-transparent text-[13px] font-medium text-[#ededeb] outline-none focus:bg-white/[0.05]"
        />
      </div>

      <div className="mt-2.5 pl-[22px]">
        {full ? (
          <textarea
            aria-label="What it does each time"
            value={prompt}
            maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)}
            rows={Math.min(10, Math.max(4, Math.ceil(prompt.length / 70)))}
            className="slim-scroll w-full resize-none rounded-[8px] border border-white/[0.09] bg-black/25 px-2.5 py-2 text-[12px] leading-[18px] text-[#d6d6d3] outline-none focus:border-[#3b82f6]/60"
          />
        ) : (
          <p className="line-clamp-2 text-[12px] leading-[18px] text-muted-foreground">{prompt}</p>
        )}
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="mt-1 flex cursor-pointer items-center gap-0.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', full && 'rotate-90')} />
          {full ? 'Collapse' : 'Show and edit what it does'}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate pl-[22px] text-[11.5px] text-muted-foreground/70">
          {schedule}
        </span>
        <Button variant="ghost" size="xs" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
        <Button size="xs" disabled={!ready} onClick={() => save(false)}>
          Save routine
        </Button>
      </div>
    </div>
  )
}
