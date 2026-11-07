import React, { useEffect, useState } from 'react'
import { ChevronRight } from '@/components/icons'
import { cn } from '@/lib/utils'

/**
 * The little stack of lines in front of the AI's reasoning. Lines breathe while it is thinking
 * and sit still once it is done. Click the row to read what it was thinking.
 */
export function ThinkingGlyph({
  active,
  className
}: {
  active: boolean
  className?: string
}): React.JSX.Element {
  const widths = [6, 11, 11, 8]
  return (
    <span
      data-active={active}
      aria-hidden
      className={cn('think-glyph inline-flex w-[13px] shrink-0 flex-col gap-[2.5px]', className)}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          className="think-line block h-px rounded-full bg-muted-foreground"
          style={{ width: `${(w / 11) * 100}%` }}
        />
      ))}
    </span>
  )
}

const seconds = (ms?: number): string => {
  const s = Math.max(1, Math.round((ms ?? 0) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ThinkingBlock({
  text,
  status,
  durationMs,
  startedAt
}: {
  text: string
  status: 'running' | 'done' | 'error'
  durationMs?: number
  startedAt?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const active = status === 'running'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active, startedAt])
  const hasText = text.trim().length > 0

  return (
    <div>
      <button
        type="button"
        onClick={hasText ? () => setOpen((o) => !o) : undefined}
        aria-expanded={hasText ? open : undefined}
        className={cn(
          'flex min-h-5 w-full items-center gap-1.5 rounded-[4px] px-1 text-left text-[11.5px]',
          hasText ? 'cursor-pointer hover:bg-foreground/[0.04]' : 'cursor-default'
        )}
      >
        {active ? (
          <span className="text-shimmer">
            {startedAt ? `Thinking ${seconds(now - startedAt)}` : 'Thinking…'}
          </span>
        ) : (
          <span className="text-muted-foreground/60">
            {durationMs ? `Thought for ${seconds(durationMs)}` : 'Thought it through'}
          </span>
        )}
        {hasText && (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
              open && 'rotate-90'
            )}
          />
        )}
      </button>
      {open && hasText && (
        <p className="my-1 ml-[7px] border-l border-border pl-3.5 text-[12.5px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {text}
        </p>
      )}
    </div>
  )
}
