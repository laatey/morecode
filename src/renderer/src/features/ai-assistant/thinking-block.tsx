import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
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
          className="think-line block h-px rounded-full bg-[#a8a8a6]"
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
  durationMs
}: {
  text: string
  status: 'running' | 'done' | 'error'
  durationMs?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const active = status === 'running'
  const hasText = text.trim().length > 0

  return (
    <div>
      <button
        type="button"
        onClick={hasText ? () => setOpen((o) => !o) : undefined}
        aria-expanded={hasText ? open : undefined}
        className={cn(
          'flex min-h-6 w-full items-center gap-2 rounded-[4px] px-1 py-0.5 text-left text-[12.5px]',
          hasText ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
        )}
      >
        <ThinkingGlyph active={active} />
        {active ? (
          <span className="text-shimmer">Thinking…</span>
        ) : (
          <span className="text-muted-foreground">
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
        <p className="my-1 ml-[7px] border-l border-white/[0.1] pl-3.5 text-[12.5px] leading-5 text-[#8d8d8a] [overflow-wrap:anywhere]">
          {text}
        </p>
      )}
    </div>
  )
}
