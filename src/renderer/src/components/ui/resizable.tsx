import * as React from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group
    // Small hit target so the handle never swallows the window-edge resize zone.
    resizeTargetMinimumSize={{ coarse: 16, fine: 5 }}
    className={cn(
      'flex h-full w-full data-[panel-group-direction=vertical]:flex-col data-[orientation=vertical]:flex-col',
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

export interface ResizableHandleProps extends React.ComponentProps<typeof Separator> {
  withHandle?: boolean
  onToggle?: () => void
  /** Orientation of the GROUP this handle belongs to (the handle line runs perpendicular). */
  direction?: 'horizontal' | 'vertical'
}

const ResizableHandle = ({
  withHandle = true,
  onToggle,
  disabled,
  direction = 'horizontal',
  className,
  ...props
}: ResizableHandleProps) => {
  return (
    <Separator
      disabled={disabled}
      onDoubleClick={disabled ? undefined : onToggle}
      className={cn(
        'group relative flex items-center justify-center bg-white/[0.08] focus-visible:outline-none',
        direction === 'horizontal'
          ? 'h-full self-stretch w-px cursor-col-resize'
          : 'w-full h-px cursor-row-resize',
        // A collapsed sidebar leaves its handle on the window edge: make it inert so the
        // OS window-resize border underneath keeps working.
        disabled && 'pointer-events-none cursor-default bg-transparent',
        className
      )}
      {...props}
    >
      {withHandle && !disabled && (
        <div
          className={cn(
            'absolute z-30 rounded-full bg-[#3b82f6] opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-150 pointer-events-none',
            direction === 'horizontal'
              ? 'left-1/2 -translate-x-1/2 w-[4px] h-[36px]'
              : 'top-1/2 -translate-y-1/2 h-[4px] w-[36px]'
          )}
        />
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
