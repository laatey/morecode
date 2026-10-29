import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Msg } from './types'

interface Turn {
  id: string
  title: string
  body: string
  size: number
}

const clip = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n).trimEnd()}…` : text)

function turnsOf(messages: Msg[]): Turn[] {
  const out: Turn[] = []
  messages.forEach((m, i) => {
    if (m.role !== 'user') return
    const said = (m.shown ?? m.text).trim()
    const next = messages[i + 1]
    const reply =
      next?.role === 'agent'
        ? next.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join(' ').replace(/\s+/g, ' ').trim()
        : ''
    out.push({ id: m.id, title: clip(said.split('\n')[0], 70) || 'Message', body: clip(reply, 220), size: said.length })
  })
  return out
}

const MAX_TICKS = 40
const CHROME = 56 // px kept free above and below the rail
const ROW = 8 // px per tick row: small and even, so the rail stays quiet
const REACH = 46 // px around the pointer that the magnet pulls on

/**
 * A hairline rail of ticks down the left edge of the chat, one per message you sent.
 * At rest every tick is the same tiny length; the one you are reading is a touch brighter.
 * Glide over it and the ticks near the pointer swell toward you like a dock, then settle back.
 * The nearest tick previews that turn, and clicking jumps to it.
 */
export function MessageRail({
  messages,
  scroller
}: {
  messages: Msg[]
  scroller: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element | null {
  const turns = useMemo(() => turnsOf(messages), [messages])
  const [active, setActive] = useState(0)
  const [wide, setWide] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const [room, setRoom] = useState(MAX_TICKS)
  const ticks = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = (): void => {
      setWide(el.clientWidth >= 504)
      setRoom(Math.max(6, Math.min(MAX_TICKS, Math.floor((el.clientHeight - CHROME) / ROW))))
      const box = el.getBoundingClientRect()
      let current = 0
      turns.forEach((t, i) => {
        const node = el.querySelector<HTMLElement>(`[data-turn="${t.id}"]`)
        if (node && node.getBoundingClientRect().top - box.top <= el.clientHeight * 0.35) current = i
      })
      setActive(current)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [scroller, turns])

  if (turns.length < 2 || !wide) return null
  const start = Math.max(0, Math.min(active - Math.floor(room / 2), turns.length - room))
  const shown = turns.slice(start, start + room)
  // the white tick follows the pointer while you hover, and goes back to the one you are reading after
  const lit = hover !== null ? start + hover : active

  /** Swell each tick by how close it is to the pointer (a smooth bell curve), or reset them all. */
  const magnet = (y: number | null): void => {
    ticks.current.forEach((node, k) => {
      if (!node) return
      if (y === null) {
        node.style.transform = ''
        node.style.opacity = ''
        return
      }
      const d = Math.abs(y - (k * ROW + ROW / 2))
      // A steeper curve around the focused tick. The maximum scale and line thickness stay the same.
      const pull = Math.exp(-((d / REACH) ** 2) * 6)
      node.style.transform = `scaleX(${(1 + pull * 2.4).toFixed(3)})`
      node.style.opacity = String(0.55 + pull * 0.45)
    })
  }

  const track = (e: React.PointerEvent<HTMLElement>): void => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top - 8
    magnet(y)
    setHover(Math.max(0, Math.min(shown.length - 1, Math.floor(y / ROW))))
  }
  const leave = (): void => {
    magnet(null)
    setHover(null)
  }
  const go = (id: string): void =>
    scroller.current?.querySelector(`[data-turn="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const peek = hover === null ? null : shown[hover]

  return (
    <nav
      aria-label="Conversation outline"
      onPointerMove={track}
      onPointerLeave={leave}
      onClick={() => peek && go(peek.id)}
      className="absolute left-0 top-1/2 z-20 w-8 -translate-y-1/2 cursor-pointer py-2 pl-1.5"
    >
      <div className="relative">
        {shown.map((t, k) => {
          const isActive = start + k === lit
          return (
            <div key={t.id} className="flex items-center" style={{ height: ROW }}>
              <span
                ref={(node) => {
                  ticks.current[k] = node
                }}
                className={cn(
                  'block h-[1.5px] w-[7px] origin-left rounded-full will-change-transform',
                  'transition-[transform,opacity,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  isActive ? 'bg-white/90' : 'bg-white/30'
                )}
              />
            </div>
          )
        })}
        {peek && hover !== null && (
          <div
            className="pointer-events-none absolute left-full z-30 ml-4 w-[280px] -translate-y-1/2 animate-in fade-in-0 rounded-xl border border-white/[0.08] bg-[#2a2a29]/95 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur"
            style={{ top: hover * ROW + ROW / 2 }}
          >
            <p className="truncate text-[13px] font-semibold text-[#ececea]">{peek.title}</p>
            {peek.body && <p className="mt-1 line-clamp-4 text-[12.5px] leading-5 text-[#a8a8a4]">{peek.body}</p>}
          </div>
        )}
      </div>
    </nav>
  )
}
