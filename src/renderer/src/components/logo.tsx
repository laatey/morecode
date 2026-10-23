import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The MoreCode mark. This is the single source for the logo inside the app. The same artwork is
 * shown in the app. It is the original Fable mark, without a surrounding tile.
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
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role="img"
      aria-label="MoreCode"
      className={cn('shrink-0 text-white', className)}
    >
      <path
        d="M286 224 H739 V362 H410 V547 H489 V442 H738 V581 H493 V800 H286 Z"
        fill="currentColor"
      />
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
