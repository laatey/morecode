import React from 'react'
import { cn } from '@/lib/utils'

export type BannerTone = 'emerald' | 'indigo' | 'amber' | 'violet'
export type BannerArt = 'warehouse' | 'skills' | 'routines' | 'pro'

const TONES: Record<
  BannerTone,
  {
    surface: string
    badgeFill: string
  }
> = {
  emerald: {
    surface: 'bg-inset',
    badgeFill: 'color-mix(in oklab, var(--success) 38%, var(--background))'
  },
  indigo: {
    surface: 'bg-inset',
    badgeFill: 'color-mix(in oklab, var(--primary) 38%, var(--background))'
  },
  amber: {
    surface: 'bg-inset',
    badgeFill: 'color-mix(in oklab, var(--warning) 38%, var(--background))'
  },
  violet: {
    surface: 'bg-inset',
    badgeFill: 'color-mix(in oklab, var(--chart-5) 38%, var(--background))'
  }
}

function Illustration({
  art,
  badgeFill
}: {
  art: BannerArt
  badgeFill: string
}): React.JSX.Element {
  if (art === 'warehouse') {
    return (
      <svg
        viewBox="0 0 120 80"
        fill="none"
        className="h-[72px] w-[108px] shrink-0 select-none text-foreground opacity-80"
        aria-hidden
      >
        <rect
          x="10"
          y="10"
          width="74"
          height="52"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.65"
        />
        <line
          x1="10"
          y1="24"
          x2="84"
          y2="24"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
        <line
          x1="34"
          y1="24"
          x2="34"
          y2="62"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
        <line
          x1="59"
          y1="24"
          x2="59"
          y2="62"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
        <line
          x1="10"
          y1="43"
          x2="84"
          y2="43"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
        <circle
          cx="84"
          cy="52"
          r="18"
          fill={badgeFill}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.85"
        />
        <path
          d="M76 55L82 48L86 52L92 44"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.9"
        />
      </svg>
    )
  }

  if (art === 'skills') {
    return (
      <svg
        viewBox="0 0 120 80"
        fill="none"
        className="h-[72px] w-[108px] shrink-0 select-none text-foreground opacity-80"
        aria-hidden
      >
        <rect
          x="12"
          y="12"
          width="70"
          height="50"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.65"
        />
        <line
          x1="22"
          y1="25"
          x2="48"
          y2="25"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeOpacity="0.65"
        />
        <line
          x1="22"
          y1="35"
          x2="66"
          y2="35"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.45"
        />
        <line
          x1="22"
          y1="45"
          x2="56"
          y2="45"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.45"
        />
        <circle
          cx="84"
          cy="52"
          r="18"
          fill={badgeFill}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.85"
        />
        <path
          d="M79 57L85 45M87 55H92"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeOpacity="0.9"
        />
      </svg>
    )
  }

  if (art === 'routines') {
    return (
      <svg
        viewBox="0 0 120 80"
        fill="none"
        className="h-[72px] w-[108px] shrink-0 select-none text-foreground opacity-80"
        aria-hidden
      >
        <rect
          x="12"
          y="14"
          width="70"
          height="48"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.65"
        />
        <line
          x1="12"
          y1="26"
          x2="82"
          y2="26"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
        <rect
          x="22"
          y="34"
          width="12"
          height="9"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeOpacity="0.55"
        />
        <rect
          x="40"
          y="34"
          width="12"
          height="9"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeOpacity="0.55"
        />
        <rect
          x="22"
          y="47"
          width="12"
          height="9"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeOpacity="0.45"
        />
        <circle
          cx="84"
          cy="52"
          r="18"
          fill={badgeFill}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.85"
        />
        <path
          d="M84 44V52L90 55"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.9"
        />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      className="h-[72px] w-[108px] shrink-0 select-none text-foreground opacity-80"
      aria-hidden
    >
      <rect
        x="14"
        y="40"
        width="16"
        height="22"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      <rect
        x="36"
        y="28"
        width="16"
        height="34"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.6"
      />
      <rect
        x="58"
        y="16"
        width="16"
        height="46"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.7"
      />
      <circle
        cx="84"
        cy="52"
        r="18"
        fill={badgeFill}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.85"
      />
      <path
        d="M78 52H90M85 47L90 52L85 57"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />
    </svg>
  )
}

export function FeatureBanner({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'emerald',
  art = 'warehouse',
  className
}: {
  eyebrow: string
  tag?: string
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  tone?: BannerTone
  art?: BannerArt
  className?: string
}): React.JSX.Element {
  const palette = TONES[tone]
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-5 rounded-[10px] px-5 py-4',
        palette.surface,
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-foreground/50">{eyebrow}</div>
        <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-snug text-foreground">
          {title}
        </h3>
        <p className="mt-1 max-w-[460px] text-[12.5px] leading-[18px] text-foreground/65">
          {description}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[6px] bg-foreground px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground"
          >
            {actionLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[6px] px-2.5 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>

      <div className="hidden sm:block">
        <Illustration art={art} badgeFill={palette.badgeFill} />
      </div>
    </div>
  )
}
