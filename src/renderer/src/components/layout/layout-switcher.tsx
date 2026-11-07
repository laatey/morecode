import React, { useId } from 'react'
import { ActionMenu, type ActionMenuItem } from '@/components/action-menu'
import { cn } from '@/lib/utils'
import type { LayoutId, LayoutState } from '@/lib/sidebar-layout'

const FRAME = { x: 2, y: 3, w: 20, h: 18, r: 5 }
const LEFT_DIVIDER = 9.5
const RIGHT_DIVIDER = 14.5

/**
 * A window with its two sidebars drawn as filled panes: a pane is filled while that sidebar is open, so the
 * icon always shows the layout in use. The panes slide in and out when the layout changes.
 */
export function LayoutIcon({
  layout,
  className
}: {
  layout: LayoutState
  className?: string
}): React.JSX.Element {
  const clip = useId()
  const left = layout === 'full' || layout === 'chat-primary'
  const right = layout === 'full' || layout === 'chat-secondary'
  const move = 'width 200ms ease, x 200ms ease, opacity 200ms ease'
  return (
    <svg
      viewBox="0 0 24 24"
      width={17}
      height={17}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`} stroke="none" fill="currentColor">
        <rect
          y={FRAME.y}
          height={FRAME.h}
          style={{ x: FRAME.x, width: left ? LEFT_DIVIDER - FRAME.x : 0, opacity: left ? 0.8 : 0, transition: move }}
        />
        <rect
          y={FRAME.y}
          height={FRAME.h}
          style={{
            x: right ? RIGHT_DIVIDER : FRAME.x + FRAME.w,
            width: right ? FRAME.x + FRAME.w - RIGHT_DIVIDER : 0,
            opacity: right ? 0.8 : 0,
            transition: move
          }}
        />
      </g>
      <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.r} />
      <path d={`M${LEFT_DIVIDER} ${FRAME.y}V${FRAME.y + FRAME.h}`} style={{ opacity: left ? 1 : 0.3, transition: 'opacity 200ms ease' }} />
      <path d={`M${RIGHT_DIVIDER} ${FRAME.y}V${FRAME.y + FRAME.h}`} style={{ opacity: right ? 1 : 0.3, transition: 'opacity 200ms ease' }} />
    </svg>
  )
}

const OPTIONS: { id: LayoutId; label: string; description: string }[] = [
  { id: 'full', label: 'Full view', description: 'Both sidebars and the chat' },
  { id: 'chat-secondary', label: 'Chat + secondary sidebar', description: 'Hide the primary sidebar' },
  { id: 'chat-primary', label: 'Chat + primary sidebar', description: 'Hide the secondary sidebar' }
]

const TITLES: Record<LayoutState, string> = {
  full: 'Layout: full view',
  'chat-secondary': 'Layout: chat + secondary sidebar',
  'chat-primary': 'Layout: chat + primary sidebar',
  chat: 'Layout: chat only'
}

export function LayoutSwitcher({
  layout,
  onChange
}: {
  layout: LayoutState
  onChange: (layout: LayoutId) => void
}): React.JSX.Element {
  const items: ActionMenuItem[] = OPTIONS.map((o) => ({
    id: o.id,
    label: o.label,
    description: o.description,
    icon: <LayoutIcon layout={o.id} className="h-[15px] w-[15px]" />,
    checked: layout === o.id,
    onClick: () => onChange(o.id)
  }))
  return (
    <ActionMenu
      align="start"
      sideOffset={5}
      items={items}
      trigger={(isOpen) => (
        <button
            type="button"
            title={TITLES[layout]}
            className={cn(
              'app-no-drag shrink-0 p-1.5 rounded-[5px] flex items-center justify-center cursor-pointer',
              'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] active:bg-foreground/[0.1]',
              'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              isOpen && 'bg-foreground/[0.08] text-foreground'
            )}
          >
            <LayoutIcon layout={layout} />
          </button>
      )}
    />
  )
}
