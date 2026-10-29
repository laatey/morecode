import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TIP_SURFACE = cn(
  'app-no-drag pointer-events-none z-[100] inline-flex max-w-[260px] items-center gap-1.5',
  'rounded-[6px] border border-white/[0.1] bg-[#1c1c1b] px-2 py-1',
  'text-[11.5px] font-medium leading-4 tracking-[-0.01em] text-[#ececea]',
  'shadow-[0_4px_12px_rgba(0,0,0,0.45)] select-none',
  'animate-in fade-in-0 zoom-in-95 duration-100'
)

function isTruncated(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true
  const child = el.querySelector<HTMLElement>('.truncate')
  return Boolean(child && child.scrollWidth > child.clientWidth + 1)
}

/** Replaces native browser `title` tooltips with the same minimal custom tooltip. */
function NativeTitleTooltip(): React.JSX.Element | null {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeEl = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const clear = (): void => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      activeEl.current = null
      setTip(null)
    }

    const onOver = (e: PointerEvent): void => {
      const target = (e.target as HTMLElement | null)?.closest?.('[title],[data-native-tip]') as HTMLElement | null
      if (!target) {
        if (activeEl.current) clear()
        return
      }
      const rawTitle = target.getAttribute('title')
      if (rawTitle !== null) {
        target.setAttribute('data-native-tip', rawTitle)
        if (!target.getAttribute('aria-label') && !target.textContent?.trim()) {
          target.setAttribute('aria-label', rawTitle)
        }
        target.removeAttribute('title')
      }
      const text = target.getAttribute('data-native-tip')?.trim()
      if (!text) return
      if (target === activeEl.current) return

      clear()
      // Skip redundant tooltips when the label is already fully visible inside the element
      const visibleText = target.textContent?.trim() ?? ''
      if (visibleText === text && !isTruncated(target)) return

      activeEl.current = target
      timer.current = setTimeout(() => {
        if (!activeEl.current || !document.body.contains(activeEl.current)) return
        const rect = activeEl.current.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        const above = rect.bottom + 34 > window.innerHeight
        const x = Math.min(Math.max(rect.left + rect.width / 2, 12), window.innerWidth - 12)
        const y = above ? rect.top - 6 : rect.bottom + 6
        setTip({ text, x, y, above })
      }, 380)
    }

    const onOut = (e: PointerEvent): void => {
      if (!activeEl.current) return
      const related = e.relatedTarget as Node | null
      if (related && activeEl.current.contains(related)) return
      clear()
    }

    window.addEventListener('pointerover', onOver, true)
    window.addEventListener('pointerout', onOut, true)
    window.addEventListener('pointerdown', clear, true)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('keydown', clear, true)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      window.removeEventListener('pointerover', onOver, true)
      window.removeEventListener('pointerout', onOut, true)
      window.removeEventListener('pointerdown', clear, true)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('keydown', clear, true)
      window.removeEventListener('blur', clear)
    }
  }, [])

  if (!tip) return null
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.x,
        top: tip.y,
        transform: tip.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
      }}
      className={TIP_SURFACE}
    >
      <span className="truncate">{tip.text}</span>
    </div>,
    document.body
  )
}

/** Mount once near the root. */
export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={380} skipDelayDuration={150} disableHoverableContent>
      {children}
      <NativeTitleTooltip />
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

/** Minimal custom tooltip. Wrap any single element: <Tip label="Save" shortcut="Ctrl S"><button/></Tip> */
export const Tip = React.forwardRef<HTMLElement, TipProps>(function Tip(
  { label, shortcut, side = 'bottom', align = 'center', children, ...rest },
  ref
): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const suppressFocusOpen = useRef(false)

  if (!label) return children

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next && suppressFocusOpen.current) return
        setOpen(next)
      }}
    >
      <TooltipPrimitive.Trigger
        ref={ref as React.Ref<HTMLButtonElement>}
        asChild
        {...rest}
        onPointerDown={(e) => {
          suppressFocusOpen.current = true
          setOpen(false)
          ;(rest as { onPointerDown?: (e: React.PointerEvent) => void }).onPointerDown?.(e)
        }}
        onPointerEnter={(e) => {
          suppressFocusOpen.current = false
          ;(rest as { onPointerEnter?: (e: React.PointerEvent) => void }).onPointerEnter?.(e)
        }}
        onBlur={(e) => {
          suppressFocusOpen.current = false
          ;(rest as { onBlur?: (e: React.FocusEvent) => void }).onBlur?.(e)
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          onPointerDownOutside={() => setOpen(false)}
          className={TIP_SURFACE}
        >
          <span className="truncate">{label}</span>
          {shortcut && (
            <kbd className="rounded-[3px] border border-white/[0.1] bg-white/[0.06] px-1 py-px font-sans text-[10px] leading-3.5 text-[#9e9e99]">
              {shortcut}
            </kbd>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
})
