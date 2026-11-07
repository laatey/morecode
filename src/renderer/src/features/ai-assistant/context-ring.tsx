import React, { useSyncExternalStore } from 'react'
import { Tip } from '@/components/tooltip'
import { getLastContext, getUsageVersion, subscribeUsage } from '@/features/billing/usage-log'
import { CONTEXT_WINDOW } from './panels/usage-data'

const fmtK = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))

const SIZE = 14
const STROKE = 2.2
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/** A small ring in the composer footer showing how full this chat's context window is. */
export function ContextRing({ chatId }: { chatId: string }): React.JSX.Element {
  useSyncExternalStore(subscribeUsage, getUsageVersion) // moves while the AI works
  const used = getLastContext(chatId)
  const frac = Math.min(1, used / CONTEXT_WINDOW)
  const pct = Math.round(frac * 100)
  const color = frac > 0.9 ? 'stroke-destructive' : frac > 0.75 ? 'stroke-warning' : 'stroke-primary'
  return (
    <Tip label={`Context ${pct}% full · ${fmtK(used)} of ${fmtK(CONTEXT_WINDOW)}`} side="top">
      <span role="img" aria-label={`Context ${pct}% full`} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" className="stroke-foreground/15" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            className={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 300ms ease-out' }}
          />
        </svg>
      </span>
    </Tip>
  )
}
