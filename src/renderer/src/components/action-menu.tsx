import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionMenuItem {
  id: string
  label: React.ReactNode
  /** A smaller second line under the label. */
  description?: string
  icon?: React.ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  hasSubmenu?: boolean
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
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const ROW =
  'relative flex w-full items-center gap-2 rounded-[4px] py-[5.5px] pl-2.5 pr-3 text-[12.5px] leading-[18px] ' +
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
          {items.map((item, index) => {
            const tone = item.danger
              ? 'text-[#f87171] focus:bg-red-500/15'
              : 'text-[#e2e2e0] focus:bg-white/[0.07]'
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
                    <span className="block truncate text-[11px] leading-4 text-[#8e8e8a]">{item.description}</span>
                  )}
                </span>
                {item.hasSubmenu ? (
                  <ChevronRight className="ml-5 h-3 w-3 shrink-0 text-[#a8a8a6]" />
                ) : item.shortcut ? (
                  <span className="ml-5 shrink-0 text-[11.5px] text-[#a8a8a6]">
                    {item.shortcut}
                  </span>
                ) : null}
              </>
            )

            return (
              <React.Fragment key={item.id}>
                {index > 0 && (
                  <DropdownMenu.Separator className="my-0.5 h-px bg-white/[0.08]" />
                )}
                {item.checked !== undefined ? (
                  <DropdownMenu.CheckboxItem
                    checked={item.checked}
                    disabled={item.disabled}
                    onCheckedChange={() => item.onClick?.()}
                    className={cn(ROW, tone)}
                  >
                    {content}
                  </DropdownMenu.CheckboxItem>
                ) : (
                  <DropdownMenu.Item
                    disabled={item.disabled}
                    onClick={item.onClick}
                    className={cn(ROW, tone)}
                  >
                    {content}
                  </DropdownMenu.Item>
                )}
              </React.Fragment>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
