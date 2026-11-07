import React from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { useSettings } from '@/features/settings/settings-store'
import { LIMIT_LABEL, resetsIn, windowOf, type LimitKind } from '@/features/billing/limits'
import { cn } from '@/lib/utils'

/** Show the hint once a window is this full. Below it there is nothing to worry about, so the composer stays quiet. */
const SHOW_FROM = 75

/**
 * A small note beside the composer when a usage limit is getting close or full: "82% of 5-hour limit", or
 * "5-hour limit reached". Click it to see both limits. It is not shown with your own API key, or when there is no server.
 */
export function UsageHint(): React.JSX.Element | null {
  const { account, limitHit } = useAuth()
  const { openSettings } = useSettings()
  const session = windowOf(account, 'session')
  const week = windowOf(account, 'week')
  if (!session || !week) return null

  const fullest: LimitKind = week.percent > session.percent ? 'week' : 'session'
  const w = fullest === 'week' ? week : session
  if (!limitHit && w.percent < SHOW_FROM) return null

  const text = limitHit
    ? `${LIMIT_LABEL[limitHit.kind]} reached`
    : `${w.percent}% of ${LIMIT_LABEL[fullest]}`
  const title = `5-hour limit: ${session.percent}% used. ${resetsIn(session.resetsAt)}.\nWeekly limit: ${week.percent}% used. ${resetsIn(week.resetsAt)}.`

  return (
    <button
      type="button"
      title={title}
      onClick={() => openSettings('billing')}
      className={cn(
        'min-w-0 shrink cursor-pointer truncate whitespace-nowrap text-[11.5px] transition-colors hover:text-foreground',
        limitHit || w.percent >= 90 ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      <span className="@max-[30rem]:hidden">{text}</span>
      <span className="hidden @max-[30rem]:inline">{limitHit ? 'Limit' : `${w.percent}%`}</span>
    </button>
  )
}
