import React, { useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { ActionMenu } from '@/components/action-menu'
import { cn } from '@/lib/utils'

export const fmtTokens = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n)

export const percentOf = (n: number, total: number): number => (total ? (n / total) * 100 : 0)

/** Bar colour follows how close the limit is: calm blue, amber, then red. */
export const limitTone = (percent: number): string =>
  percent >= 90 ? 'bg-[#e5584f]' : percent >= 75 ? 'bg-[#e5a54b]' : 'bg-[#3b8cff]'

/**
 * Card used by every slash-command panel: dimmed backdrop, title row, close button.
 * Esc and clicking outside both close it.
 */
export function PanelFrame({
  title,
  onClose,
  actions,
  width = 420,
  children
}: {
  title: string
  onClose: () => void
  actions?: React.ReactNode
  width?: number
  children: React.ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: width }}
        className="slim-scroll max-h-full w-full overflow-y-auto rounded-[12px] border border-white/[0.1] bg-[#242423] shadow-[0_16px_48px_rgba(0,0,0,0.55)] animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
          <span className="text-[13px] font-medium text-[#ececea]">{title}</span>
          <span className="flex items-center gap-0.5">
            {actions}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <div className="px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  )
}

export function Bar({
  percent,
  tone = 'bg-[#3b8cff]',
  label
}: {
  percent: number
  tone?: string
  label: string
}): React.JSX.Element {
  const value = Math.min(100, Math.max(0, percent))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-[6px] w-full overflow-hidden rounded-full bg-white/[0.08]"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tone)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

/** Small boxed number/label used in the stat grids. */
export function StatCell({
  label,
  value,
  tone
}: {
  label: string
  value: React.ReactNode
  tone?: string
}): React.JSX.Element {
  return (
    <div className="rounded-[8px] border border-white/[0.07] bg-white/[0.035] px-3 py-2">
      <div className="text-[11.5px] text-[#8d8d8a]">{label}</div>
      <div className={cn('mt-0.5 text-[15px] font-medium tabular-nums text-[#ececea]', tone)}>
        {value}
      </div>
    </div>
  )
}

/** Compact two-way switch (Overview / Models, All / 30d / 7d). */
export function MiniTabs<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div role="tablist" className="flex items-center gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-[6px] px-2.5 py-1 text-[12px] transition-colors',
            o.value === value
              ? 'bg-white/[0.1] text-[#ececea]'
              : 'text-[#8d8d8a] hover:bg-white/[0.05] hover:text-[#d6d6d3]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Little dropdown for filters ("24h", "All"). */
export function FilterSelect<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  const current = options.find((o) => o.value === value)?.label ?? value
  return (
    <ActionMenu
      align="end"
      items={options.map((o) => ({
        id: o.value,
        label: o.label,
        checked: o.value === value,
        onClick: () => onChange(o.value)
      }))}
      trigger={
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[12px] text-[#c9c9c6] transition-colors hover:bg-white/[0.06]"
        >
          {current}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      }
    />
  )
}

export function KeyChip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded-[4px] border border-white/[0.12] bg-white/[0.05] px-1.5 font-sans text-[11px] leading-[18px] text-[#c9c9c6]">
      {children}
    </kbd>
  )
}
