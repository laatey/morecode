import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The MoreCode mark. This is the single source for the logo inside the app.
 */
export function LogoMark({
  size = 28,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="MoreCode"
      className={cn('shrink-0', className)}
    >
      <rect x="60" y="180" width="230" height="230" rx="64" fill="#FFB020" />
      <rect x="141" y="141" width="230" height="230" rx="64" fill="#FF5A1F" />
      <rect x="222" y="102" width="230" height="230" rx="64" fill="#2F5BFF" />
    </svg>
  )
}

export function Logo({
  size = 28,
  wordmark = true,
  className
}: {
  size?: number
  wordmark?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">MoreCode</span>
      )}
    </span>
  )
}
