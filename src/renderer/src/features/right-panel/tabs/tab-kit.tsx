import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

/** Friendly empty state used by every tab: what this is, and what to do next. */
export function TabEmpty({
  icon: Icon,
  title,
  children,
  action
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-[280px] flex-col items-center text-center">
        <span className="mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-white/[0.05] text-[#a8a8a6]">
          <Icon className="h-[18px] w-[18px] stroke-[1.5]" />
        </span>
        <h2 className="text-[13px] font-medium text-[#ececea]">{title}</h2>
        <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">{children}</p>
        {action && <div className="mt-3.5">{action}</div>}
      </div>
    </div>
  )
}

/** Thin bar at the top of a tab (summary on the left, actions on the right). */
export function TabToolbar({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-[38px] shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-1.5',
        className
      )}
    >
      {children}
    </div>
  )
}

type Tone = 'primary' | 'quiet'

export function TabButton({
  tone = 'quiet',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }): React.JSX.Element {
  return (
    <button
      type="button"
      {...props}
      className={buttonVariants({ variant: tone === 'primary' ? 'default' : 'ghost', size: 'xs', className })}
    />
  )
}

export function Chip({
  tone = 'neutral',
  children
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
  children: React.ReactNode
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-white/[0.07] text-[#a8a8a6]',
    good: 'bg-[#3fb950]/15 text-[#5fd17a]',
    warn: 'bg-[#e5a54b]/15 text-[#e8b365]',
    bad: 'bg-[#e5584f]/15 text-[#f0746c]'
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 text-[11px] leading-[18px]',
        tones[tone]
      )}
    >
      {children}
    </span>
  )
}

export const Stats = ({ added, removed }: { added: number; removed: number }): React.JSX.Element => (
  <span className="shrink-0 font-mono text-[11.5px] tabular-nums">
    <span className="text-[var(--diff-add)]">+{added}</span>{' '}
    <span className="text-[var(--diff-del)]">−{removed}</span>
  </span>
)
