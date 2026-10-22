import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronRight } from 'lucide-react'

export interface ActionMenuItem {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  hasSubmenu?: boolean
  separatorBefore?: boolean
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
    if (!isControlled) {
      setUncontrolledOpen(openState)
    }
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
          className={`z-50 min-w-[148px] rounded-lg bg-[#323230] border border-white/[0.12] p-1 text-foreground shadow-xl backdrop-blur-md outline-none select-none animate-in fade-in-0 zoom-in-95 ${contentClassName}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <DropdownMenu.Separator className="h-px bg-white/[0.08] my-0.5 mx-0.5" />
              )}
              <DropdownMenu.Item
                disabled={item.disabled}
                onClick={item.onClick}
                className={`flex items-center justify-between px-2.5 py-1 text-[13px] rounded-md cursor-pointer transition-colors outline-none ${
                  item.disabled ? 'opacity-40 pointer-events-none' : ''
                } ${
                  item.danger
                    ? 'text-[#f87171] hover:bg-red-500/15 focus:bg-red-500/15'
                    : 'text-[#ececeb] hover:bg-white/[0.08] focus:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.icon ? (
                    <span
                      className={`flex items-center justify-center shrink-0 ${
                        item.danger ? 'text-[#f87171]' : 'text-[#a8a8a6]'
                      }`}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className={item.danger ? 'font-medium' : ''}>{item.label}</span>
                </div>

                {item.hasSubmenu ? (
                  <ChevronRight className="w-[12px] h-[12px] text-[#888886] ml-2 shrink-0" />
                ) : item.shortcut ? (
                  <span className="text-[#888886] text-[11px] font-mono ml-2 shrink-0">
                    {item.shortcut}
                  </span>
                ) : null}
              </DropdownMenu.Item>
            </React.Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
