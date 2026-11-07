import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The MoreCode mark. This is the single source for the logo inside the app.
 */
export function LogoMark({
  size = 28,
  className,
  tone = 'brand'
}: {
  size?: number
  className?: string
  /** `mono` draws the mark in the surrounding text colour (set it with a text-* class) so it sits quietly on a page. */
  tone?: 'brand' | 'mono'
}): React.JSX.Element {
  if (tone === 'mono')
    // Solid greys from the theme (no transparency), so the mark stays crisp and reads the same on any surface.
    return (
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        role="img"
        aria-label="MoreCode"
        className={cn('shrink-0', className)}
      >
        <defs>
          <pattern id="mc-hatch-mono" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(55)">
            <rect width="8" height="8" style={{ fill: 'var(--secondary)' }} />
            <line x1="0" y1="0" x2="0" y2="8" strokeWidth="1.6" style={{ stroke: 'var(--faint-foreground)' }} />
          </pattern>
        </defs>
        <g strokeWidth="4" strokeLinejoin="round" style={{ stroke: 'var(--muted-foreground)' }}>
          <path d="M124 170 H462 V430 H148 Q124 430 124 406 Z" fill="url(#mc-hatch-mono)" />
          <path d="M150 80 L82 120 V420 L150 380 Z" style={{ fill: 'var(--muted-foreground)' }} />
          <path d="M150 80 H404 Q430 80 430 106 V380 H150 Z" style={{ fill: 'var(--accent)' }} />
        </g>
        <path
          d="M206 310 V150 H246 L290 226 L334 150 H374 V310 H338 V214 L302 276 H278 L242 214 V310 Z"
          style={{ fill: 'var(--soft-foreground)' }}
        />
      </svg>
    )
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="MoreCode"
      className={cn('shrink-0', className)}
    >
      <defs>
        <pattern id="mc-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(55)">
          <rect width="8" height="8" fill="#0B1E4A" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#4C8DFF" strokeWidth="1.6" />
        </pattern>
      </defs>
      <g stroke="#7FB2FF" strokeWidth="4" strokeLinejoin="round">
        <path d="M124 170 H462 V430 H148 Q124 430 124 406 Z" fill="url(#mc-hatch)" />
        <path d="M150 80 L82 120 V420 L150 380 Z" fill="#4C8DFF" />
        <path d="M150 80 H404 Q430 80 430 106 V380 H150 Z" fill="#123A8C" />
      </g>
      <path
        d="M206 310 V150 H246 L290 226 L334 150 H374 V310 H338 V214 L302 276 H278 L242 214 V310 Z"
        fill="#9CC6FF"
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
