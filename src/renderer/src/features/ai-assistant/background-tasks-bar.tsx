import React, { useEffect, useState } from 'react'
import { ChevronDown, X } from '@/components/icons'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BgJob } from '../../../../preload'

export interface HelperTask {
  id: string
  task: string
  steps: number
}

const STACK_STYLES = [
  'mx-5 bg-[#323231] border-white/[0.1] z-[3]',
  'mx-7 bg-[#2c2c2b] border-white/[0.09] z-[2]',
  'mx-9 bg-[#262625] border-white/[0.08] z-[1]'
] as const

export function stackTabClass(stackIndex = 0): string {
  return STACK_STYLES[Math.min(stackIndex, STACK_STYLES.length - 1)]
}

function formatElapsed(startedAt: number, now: number): string {
  const s = Math.max(1, Math.floor((now - startedAt) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/**
 * Background tasks (detached shell commands like dev servers/watchers, plus active research helpers).
 * Renders as a folder-tab above the composer and coexists in a stepped stack with QueueBar and ChangesBar.
 */
export function BackgroundTasksBar({
  jobs,
  helpers = [],
  stackIndex = 0,
  onStopJob,
  onDismissJob
}: {
  jobs: BgJob[]
  helpers?: HelperTask[]
  stackIndex?: number
  onStopJob: (id: string) => void
  onDismissJob: (id: string) => void
}): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const anyRunning = jobs.some((j) => !j.exited) || helpers.length > 0

  useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [anyRunning])

  const expandedJob = jobs.find((j) => j.id === expandedId)

  return (
    <div
      className={cn(
        'relative -mb-3 rounded-t-2xl border border-b-0 px-3 pb-3.5 pt-1 text-[11.5px]',
        stackTabClass(stackIndex)
      )}
    >
      <ul className="slim-scroll max-h-[96px] space-y-0.5 overflow-y-auto">
        {jobs.map((job) => {
          const isExpanded = expandedJob?.id === job.id
          const running = !job.exited
          return (
            <li key={job.id} className="flex h-6 items-center gap-2 rounded-md px-1 hover:bg-white/[0.04]">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  running
                    ? 'animate-pulse bg-[#4cc38a]'
                    : job.exitCode === 0
                      ? 'bg-[#8e8e8a]'
                      : 'bg-[var(--diff-del)]'
                )}
              />
              <span className="shrink-0 rounded bg-white/[0.07] px-1 py-px font-mono text-[10px] text-[#a8a8a3]">
                {job.id}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#d6d6d3]" title={job.command}>
                {job.command}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[#8e8e8a]">
                {running
                  ? formatElapsed(job.startedAt, now)
                  : job.stopped
                    ? 'Stopped'
                    : `Exit ${job.exitCode ?? 0}`}
              </span>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : job.id)}
                className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-0.5 rounded-[5px] px-1.5 text-[10.5px] text-[#a8a8a3] transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Output
                <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
              </button>
              {running ? (
                <button
                  type="button"
                  onClick={() => onStopJob(job.id)}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    'h-5 rounded-[5px] px-1.5 text-[10.5px] text-[#f29b96] hover:bg-white/[0.08] hover:text-[#ffb4b0]'
                  )}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  title="Dismiss"
                  aria-label="Dismiss background task"
                  onClick={() => onDismissJob(job.id)}
                  className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded text-[#8e8e8a] hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          )
        })}

        {helpers.map((h) => (
          <li key={h.id} className="flex h-6 items-center gap-2 rounded-md px-1">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#6b9eff]" />
            <span className="shrink-0 rounded bg-white/[0.07] px-1 py-px text-[10px] font-medium text-[#adc8ff]">
              Helper
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-[#d6d6d3]" title={h.task}>
              {h.task}
            </span>
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[#8e8e8a]">
              {h.steps > 0 ? `Step ${h.steps}` : 'Starting…'}
            </span>
          </li>
        ))}
      </ul>

      {expandedJob && (
        <div className="mt-1.5 overflow-hidden rounded-[7px] border border-white/[0.08] bg-[#1b1b1a]">
          <pre className="slim-scroll max-h-[110px] overflow-y-auto whitespace-pre-wrap break-all px-2.5 py-1.5 font-mono text-[10.5px] leading-4 text-[#c9c9c4]">
            {expandedJob.output.trim() || '(no output yet)'}
          </pre>
        </div>
      )}
    </div>
  )
}

