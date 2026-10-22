import React from 'react'

export interface SegmentedSwitchOption<T extends string = string> {
  value: T
  icon?: React.ReactNode
  label?: React.ReactNode
  title?: string
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
  const totalWidth = options.length * itemWidth

  return (
    <div
      className={`relative inline-flex items-center app-no-drag rounded-[8px] bg-[#323230] p-0 overflow-hidden select-none shrink-0 ${className}`}
      style={{ width: `${totalWidth}px`, height: `${height}px` }}
    >
      {/* Smooth sliding thumb filling full height with crisp border */}
      <div
        className="absolute inset-y-0 left-0 rounded-[7px] bg-[#50504c] border-[1.5px] border-white/40 shadow-xs transition-transform duration-200 ease-out pointer-events-none"
        style={{
          width: `${itemWidth}px`,
          transform: `translateX(${Math.max(0, activeIndex) * itemWidth}px)`
        }}
      />

      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title || (typeof option.label === 'string' ? option.label : undefined)}
            style={{ width: `${itemWidth}px` }}
            className="group relative z-10 h-full flex items-center justify-center bg-transparent cursor-pointer select-none focus:outline-none"
          >
            {option.icon ? (
              <span
                className={`flex items-center justify-center transition-all duration-150 [&>svg]:transition-all [&>svg]:duration-150 ${
                  isActive
                    ? 'text-white [&>svg]:stroke-[2.2]'
                    : 'text-[#a8a8a4] group-hover:text-white group-hover:[&>svg]:stroke-[2.6]'
                }`}
              >
                {option.icon}
              </span>
            ) : null}
            {option.label ? (
              <span
                className={`text-xs transition-colors duration-150 ${
                  isActive ? 'text-white font-medium' : 'text-[#a8a8a4] group-hover:text-white'
                }`}
              >
                {option.label}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
