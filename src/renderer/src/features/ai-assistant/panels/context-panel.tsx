import React, { useSyncExternalStore } from 'react'
import { ArrowRight } from '@/components/icons'
import { Tip } from '@/components/tooltip'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-store'
import { getUsageVersion, subscribeUsage } from '@/features/billing/usage-log'
import { CONTEXT_WINDOW, getContextRows, getUsageSnapshot } from './usage-data'
import { modelName } from '../models'
import type { PanelContext } from './panel-shell'
import { Bar, fmtTokens, limitTone, PanelFrame, percentOf } from './ui'

export function ContextPanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  useSyncExternalStore(subscribeUsage, getUsageVersion) // refresh while the AI works
  const { account } = useAuth()
  const { rows, buffer, used, free } = getContextRows(ctx.chatId)
  const total = used
  const usedPercent = Math.round(percentOf(total, CONTEXT_WINDOW))
  const plan = getUsageSnapshot(account, modelName(ctx.model))

  const legend = [
    ...rows,
    {
      id: 'buffer',
      label: 'Reserved for the reply',
      tokens: buffer,
      color: 'bg-secondary',
      deferred: true
    },
    { id: 'free', label: 'Free space', tokens: free, color: 'bg-muted', deferred: true }
  ]

  return (
    <PanelFrame title="Context" onClose={onClose}>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted-foreground">Used</span>
        <span className="tabular-nums text-foreground">
          {fmtTokens(total)} / {fmtTokens(CONTEXT_WINDOW)}{' '}
          <span className={cn('text-muted-foreground', usedPercent >= 80 && 'text-warning')}>
            ({usedPercent}%)
          </span>
        </span>
      </div>

      {/* One segmented bar; every segment explains itself on hover */}
      <div className="mt-2 flex h-[7px] w-full overflow-hidden rounded-full bg-foreground/[0.07]">
        {rows
          .filter((r) => !r.deferred)
          .map((r) => (
            <Tip
              key={r.id}
              label={`${r.label} — ${fmtTokens(r.tokens)} (${percentOf(r.tokens, CONTEXT_WINDOW).toFixed(1)}%)`}
              side="top"
            >
              <div
                className={cn('h-full cursor-default', r.color)}
                style={{ width: `${percentOf(r.tokens, CONTEXT_WINDOW)}%` }}
              />
            </Tip>
          ))}
        <div className="flex-1" />
        <div
          className="h-full opacity-70"
          style={{
            width: `${percentOf(buffer, CONTEXT_WINDOW)}%`,
            backgroundImage:
              'repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 18%, transparent) 0 2px, transparent 2px 5px)'
          }}
        />
      </div>

      <ul className="mt-3.5 space-y-[7px] text-[12.5px]">
        {legend.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', r.color)} />
            <span className={cn('flex-1', r.deferred ? 'text-muted-foreground' : 'text-soft-foreground')}>
              {r.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{fmtTokens(r.tokens)}</span>
            <span className="w-12 text-right tabular-nums text-foreground">
              {percentOf(r.tokens, CONTEXT_WINDOW).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => ctx.openPanel('usage')}
          className="group mb-2.5 flex w-full cursor-pointer items-center justify-between text-[12.5px] text-muted-foreground transition-colors hover:text-soft-foreground"
        >
          Plan usage
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
        <div className="space-y-3">
          {plan.limitsNote && <p className="text-[12px] leading-5 text-muted-foreground">{plan.limitsNote}</p>}
          {plan.limits.map((l) => (
            <div key={l.id}>
              <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                <span className="text-foreground">{l.label}</span>
                <span className="text-[11.5px] text-muted-foreground">
                  {l.percent}% · {l.resets.replace('Resets ', 'resets ')}
                </span>
              </div>
              <Bar percent={l.percent} tone={limitTone(l.percent)} label={l.label} />
            </div>
          ))}
        </div>
      </div>

      {usedPercent >= 70 && (
        <p className="mt-3.5 text-[11.5px] leading-4 text-muted-foreground">
          The conversation is getting long. Type <span className="text-soft-foreground">/compact</span> to
          summarise it and free up space.
        </p>
      )}
    </PanelFrame>
  )
}
