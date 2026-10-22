import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Tip } from '@/components/tooltip'
import { cn } from '@/lib/utils'

/** A small icon button used in the row of actions under a message. */
export function IconAction({
  label,
  onClick,
  active,
  disabled,
  className,
  children
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'grid h-6 w-6 cursor-pointer place-items-center rounded-[5px] text-[#77776f] transition-colors',
          'hover:bg-white/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#77776f]',
          active && 'text-foreground',
          className
        )}
      >
        {children}
      </button>
    </Tip>
  )
}

/** Copy to the clipboard, confirming with a tick. */
export function CopyButton({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <IconAction
      label={done ? 'Copied' : 'Copy'}
      className={className}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          })
          .catch(() => toast.error('Could not copy'))
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </IconAction>
  )
}
