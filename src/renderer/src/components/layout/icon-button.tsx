import React from 'react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/tooltip'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Used as the tooltip text and the accessible label. */
  title?: string
  shortcut?: string
  tipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export function IconButton({
  className,
  title,
  shortcut,
  tipSide,
  ...props
}: IconButtonProps): React.JSX.Element {
  const button = (
    <button
      type="button"
      aria-label={title}
      className={cn(
        'app-no-drag shrink-0 p-1.5 rounded-[5px] flex items-center justify-center cursor-pointer',
        'text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:bg-white/[0.1]',
        'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  )
  return title ? (
    <Tip label={title} shortcut={shortcut} side={tipSide}>
      {button}
    </Tip>
  ) : (
    button
  )
}
