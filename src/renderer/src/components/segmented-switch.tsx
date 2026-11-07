import React from 'react'
import { Tip } from '@/components/tooltip'

export interface SegmentedSwitchOption<T extends string = string> {
  value: T
  icon?: React.ReactNode
  label?: React.ReactNode
  title?: string
  /** Optional width in px for this segment; falls back to itemWidth. */
  width?: number
}

export interface SegmentedSwitchProps<T extends string = string> {
  options: SegmentedSwitchOption<T>[]
  value: T
  onChange: (value: T) => void
  itemWidth?: number
  height?: number
  className?: string
}

export function SegmentedSwitch<T extends string = string>({
  options,
  value,
  onChange,
  itemWidth = 36,
  height = 30,
  className = ''
}: SegmentedSwitchProps<T>): React.JSX.Element {
  const activeIndex = options.findIndex((opt) => opt.value === value)
  const widths = options.map((o) => o.width ?? itemWidth)
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
  const totalWidth = widths.reduce((a, b) => a + b, 0)

  return (
    <div
      className={`relative inline-flex items-center app-no-drag rounded-[8px] bg-secondary p-0 overflow-hidden select-none shrink-0 ${className}`}
      style={{ width: `${totalWidth}px`, height: `${height}px` }}
    >
      {/* Smooth sliding thumb filling full height with crisp border */}
      <div
        className="absolute inset-y-0 left-0 rounded-[7px] bg-border-strong border-[1.5px] border-foreground/40 shadow-xs transition-transform duration-200 ease-out pointer-events-none"
        style={{
          width: `${widths[Math.max(0, activeIndex)] ?? itemWidth}px`,
          transform: `translateX(${offsets[Math.max(0, activeIndex)] ?? 0}px)`
        }}
      />

      {options.map((option, i) => {
        const isActive = option.value === value
        const tipLabel = option.title || (typeof option.label === 'string' ? option.label : undefined)
        const btn = (
          <button
            key={option.value}
            type="button"
            aria-label={tipLabel}
            onClick={() => onChange(option.value)}
            style={{ width: `${widths[i]}px` }}
            className="group relative z-10 h-full flex items-center justify-center bg-transparent cursor-pointer select-none focus:outline-none"
          >
            {option.icon ? (
              <span
                className={`flex items-center justify-center transition-all duration-150 [&>svg]:transition-all [&>svg]:duration-150 ${
                  isActive
                    ? 'text-foreground [&>svg]:stroke-[2.2]'
                    : 'text-muted-foreground group-hover:text-foreground group-hover:[&>svg]:stroke-[2.6]'
                }`}
              >
                {option.icon}
              </span>
            ) : null}
            {option.label ? (
              <span
                className={`whitespace-nowrap text-xs transition-colors duration-150 ${
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground'
                }`}
              >
                {option.label}
              </span>
            ) : null}
          </button>
        )
        return tipLabel ? (
          <Tip key={option.value} label={tipLabel}>
            {btn}
          </Tip>
        ) : (
          btn
        )
      })}
    </div>
  )
}
