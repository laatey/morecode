import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from '@/components/icons'
import { cn } from '@/lib/utils'

export interface ActionMenuItem {
  id: string
  label: React.ReactNode
  /** A smaller second line under the label. */
  description?: string
  icon?: React.ReactNode
  shortcut?: string
  /** Custom trailing element (e.g. a toggle switch or status badge). */
  right?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  hasSubmenu?: boolean
  /** Nested submenu items rendered in a flyout on hover/click. */
  submenu?: ActionMenuItem[]
  /** Keep the menu open when this item is clicked (useful for toggles). */
  keepOpen?: boolean
  /** Draw a divider line above this item. */
  separatorBefore?: boolean
  /** When defined the item is a toggle: a check shows in the left column while true. */
  checked?: boolean
  onClick?: () => void
}

export interface ActionMenuProps {
  trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode)
  items: ActionMenuItem[]
  align?: 'start' | 'center' | 'end'
  alignOffset?: number
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  className?: string
  contentClassName?: string
  compact?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const ROW =
  'relative flex w-full items-center gap-2 rounded-[4px] py-[5.5px] pl-2.5 pr-3 text-[12.5px] leading-[18px] ' +
  'cursor-pointer outline-none select-none transition-colors ' +
  'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none'

const COMPACT_ROW =
  'relative flex w-full items-center gap-1.5 rounded-[4px] py-1 pl-2 pr-2.5 text-[12px] leading-4 ' +
  'cursor-pointer outline-none select-none transition-colors ' +
  'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none'

export function ActionMenu({
  trigger,
  items,
  align = 'end',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 5,
  className = '',
  contentClassName = '',
  compact = false,
  open: controlledOpen,
  onOpenChange
}: ActionMenuProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = (openState: boolean): void => {
    if (!isControlled) setUncontrolledOpen(openState)
    onOpenChange?.(openState)
  }

  const triggerNode = typeof trigger === 'function' ? trigger(isOpen) : trigger

  const renderItems = (list: ActionMenuItem[]): React.JSX.Element[] => {
    const usesExplicitSeparators = list.some((i) => i.separatorBefore)
    return list.map((item, index) => {
      const tone = item.danger
        ? 'text-[#f87171] focus:bg-red-500/15 data-[state=open]:bg-red-500/15'
        : 'text-[#e2e2e0] focus:bg-white/[0.07] data-[state=open]:bg-white/[0.07]'
      const showSubArrow = item.hasSubmenu || Boolean(item.submenu?.length)
      const content = (
        <>
          {/* Left column: check mark for toggles, otherwise the icon. Always reserved. */}
          <span
            className={cn(
              'flex h-3.5 w-3.5 shrink-0 items-center justify-center',
              item.danger ? 'text-[#f87171]' : 'text-[#a8a8a6]'
            )}
          >
            {item.checked ? <Check className="h-3.5 w-3.5 stroke-[2]" /> : item.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{item.label}</span>
            {item.description && (
              <span
                className={cn(
                  'block truncate text-[#8e8e8a]',
                  compact ? 'text-[10.5px] leading-[14px]' : 'text-[11px] leading-4'
                )}
              >
                {item.description}
              </span>
            )}
          </span>
          {item.right ? (
            <span className="ml-4 shrink-0">{item.right}</span>
          ) : showSubArrow ? (
            <ChevronRight className="ml-5 h-3 w-3 shrink-0 text-[#a8a8a6]" />
          ) : item.shortcut ? (
            <span className="ml-5 shrink-0 text-[11.5px] text-[#a8a8a6]">
              {item.shortcut}
            </span>
          ) : null}
        </>
      )

      const showSeparator = usesExplicitSeparators ? Boolean(item.separatorBefore && index > 0) : index > 0

      return (
        <React.Fragment key={item.id}>
          {showSeparator && (
            <DropdownMenu.Separator className="my-0.5 h-px bg-white/[0.08]" />
          )}
          {item.submenu && item.submenu.length > 0 ? (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger
                disabled={item.disabled}
                className={cn(compact ? COMPACT_ROW : ROW, tone)}
              >
                {content}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={4}
                  alignOffset={side === 'top' ? 3 : -3}
                  {...(side === 'top' ? { align: 'end' as const } : {})}
                  onFocusOutside={(e) => {
                    // Do not close the flyout just because the cursor entered the gap between menus
                    // and Radix blurred the trigger back to the parent [role="menu"] container.
                    if ((e.target as HTMLElement | null)?.getAttribute('role') === 'menu') {
                      e.preventDefault()
                    }
                  }}
                  className={cn(
                    'app-no-drag z-50 min-w-[200px] overflow-hidden rounded-[6px] border border-white/[0.09]',
                    'bg-[#2b2b2a] p-0.5 text-foreground shadow-lg outline-none select-none',
                    'animate-in fade-in-0 zoom-in-95'
                  )}
                >
                  {renderItems(item.submenu)}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ) : item.checked !== undefined ? (
            <DropdownMenu.CheckboxItem
              checked={item.checked}
              disabled={item.disabled}
              onSelect={(e) => {
                if (item.keepOpen) e.preventDefault()
              }}
              onCheckedChange={() => item.onClick?.()}
              className={cn(compact ? COMPACT_ROW : ROW, tone)}
            >
              {content}
            </DropdownMenu.CheckboxItem>
          ) : (
            <DropdownMenu.Item
              disabled={item.disabled}
              onSelect={(e) => {
                if (item.keepOpen) e.preventDefault()
                item.onClick?.()
              }}
              className={cn(compact ? COMPACT_ROW : ROW, tone)}
            >
              {content}
            </DropdownMenu.Item>
          )}
        </React.Fragment>
      )
    })
  }

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild className={className}>
        {triggerNode}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          alignOffset={alignOffset}
          side={side}
          sideOffset={sideOffset}
          // Compact, low-contrast surface: barely lighter than the app background.
          className={cn(
            'app-no-drag z-50 min-w-[168px] overflow-hidden rounded-[6px] border border-white/[0.09]',
            'bg-[#2b2b2a] p-0.5 text-foreground shadow-lg outline-none select-none',
            'animate-in fade-in-0 zoom-in-95',
            contentClassName
          )}
        >
          {renderItems(items)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
