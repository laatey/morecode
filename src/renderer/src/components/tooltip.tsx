import React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/** Mount once near the root. */
export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

interface TipProps {
  label: React.ReactNode
  /** Optional keyboard hint shown on the right, e.g. "Ctrl B". */
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  children: React.ReactElement
}

/** Small square tooltip. Wrap any single element: <Tip label="Save" shortcut="Ctrl S"><button/></Tip> */
export function Tip({
  label,
  shortcut,
  side = 'bottom',
  align = 'center',
  children
}: TipProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'app-no-drag z-[60] flex items-center gap-2 rounded-[3px] border border-white/[0.1]',
            'bg-[#1e1e1d] px-1.5 py-[3px] text-[11.5px] leading-4 text-[#d8d8d6] shadow-md',
            'select-none animate-in fade-in-0 duration-100'
          )}
        >
          {label}
          {shortcut && <span className="text-[10.5px] text-[#8d8d8a]">{shortcut}</span>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
