import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The MoreCode mark. This is the single source for the logo inside the app. The same artwork is
 * used for the installer and taskbar icons (resources/icon.svg and build/icon.*), so the app can
 * never show two different logos.
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
      className={cn('shrink-0', className)}
    >
      <rect x="64" y="64" width="896" height="896" rx="212" fill="#f2efe8" />
      <path
        d="M286 224 H739 V362 H410 V547 H489 V442 H738 V581 H493 V800 H286 Z"
        fill="#1d1c1a"
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
