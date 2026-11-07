import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

type Side = 'right' | 'left' | 'top' | 'bottom' | 'center'

interface TourStep {
  target?: string
  /** What to point at, and what to say, when the target is not on screen (a closed sidebar). */
  fallback?: { target: string; hint: string }
  side: Side
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    side: 'center',
    title: 'Here’s a quick look around',
    body: 'Four short stops, about 30 seconds. You can skip now and replay it any time from your profile.'
  },
  {
    target: 'sidebar',
    fallback: { target: 'left-toggle', hint: 'The sidebar is closed right now. Click the highlighted button to open it.' },
    side: 'right',
    title: 'Your chats live here',
    body: 'Every conversation is saved on the left. Start a new one, or pick up where you stopped.'
  },
  {
    target: 'composer',
    side: 'top',
    title: 'Ask for anything',
    body: 'Describe what you want in your own words. Type / to see commands, like /plan to review an approach before anything changes.'
  },
  {
    target: 'right-panel',
    fallback: { target: 'right-toggle', hint: 'This sidebar is closed right now. Click the highlighted button to open it.' },
    side: 'left',
    title: 'Tools on the right',
    body: 'See the changes the AI made, follow its tasks, preview your app in a browser, run commands, and read your docs. Press + to open one.'
  },
  {
    target: 'profile',
    side: 'right',
    title: 'Your account',
    body: 'Check your plan and usage, switch accounts, or replay this tour here.'
  }
]

const CARD_W = 320
const GAP = 14
const MARGIN = 12
/** Space around a small target (a button); big areas like a sidebar are outlined exactly, so the outline never reaches past them. */
const padFor = (r: DOMRect): number => (r.width > 160 || r.height > 160 ? 0 : 4)

/**
 * Spotlight tour. Dims the app, cuts a hole around the thing being explained, and shows a card
 * next to it. If a target is not on screen (a closed sidebar), the spotlight moves to the button that
 * opens it, the card sits beside that button in the corner and asks the person to click it; the hole
 * lets that click through, and the tour picks up the real target as soon as it appears. If neither is
 * on screen the card is centred, so the tour can never get stuck.
 */
export function Tour(): React.JSX.Element | null {
  const { tourOpen, endTour } = useAuth()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  /** The real target is not on screen, so the spotlight is on the button that opens it. */
  const [missing, setMissing] = useState(false)
  const [cardH, setCardH] = useState(190)
  const card = useRef<HTMLDivElement>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  useEffect(() => {
    if (tourOpen) setIndex(0)
  }, [tourOpen])

  useLayoutEffect(() => {
    if (!tourOpen) return
    /** The first element with this tour name that is really on screen (the name can be on a hidden copy too). */
    const find = (name?: string): DOMRect | null => {
      if (!name) return null
      for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
        const r = el.getBoundingClientRect()
        if (r.width > 4 && r.height > 4 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight) return r
      }
      return null
    }
    const measure = (): void => {
      const main = find(step.target)
      const fallback = main ? null : find(step.fallback?.target)
      const next = main ?? fallback
      setMissing(Boolean(fallback))
      setRect((prev) =>
        prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next
      )
      if (card.current) setCardH(card.current.offsetHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setInterval(measure, 200) // catches panels that are still animating open
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(t)
    }
  }, [tourOpen, step])

  useEffect(() => {
    if (!tourOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void endTour()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (last) void endTour()
        else setIndex((i) => i + 1)
      } else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tourOpen, last, endTour])

  if (!tourOpen) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), Math.max(lo, hi))
  let left = (vw - CARD_W) / 2
  let top = (vh - cardH) / 2
  if (rect && step.side !== 'center') {
    const side: Side = missing ? 'bottom' : step.side
    if (side === 'right') {
      left = rect.right + GAP
      top = rect.top + rect.height / 2 - cardH / 2
    } else if (side === 'left') {
      left = rect.left - CARD_W - GAP
      top = rect.top + rect.height / 2 - cardH / 2
    } else if (side === 'bottom') {
      // beside a title-bar button: tucked into that corner of the window, just under the button
      left = rect.left + rect.width / 2 - CARD_W / 2
      top = rect.bottom + padFor(rect) + GAP
    } else {
      left = rect.left + rect.width / 2 - CARD_W / 2
      top = rect.top - cardH - GAP
    }
    left = clamp(left, MARGIN, vw - CARD_W - MARGIN)
    top = clamp(top, MARGIN, vh - cardH - MARGIN)
  }

  // the dimmed area is four plain panels around the spotlight, so the hole can let a click through
  const DIM = 'rgba(0, 0, 0, 0.5)'
  const pad = rect ? padFor(rect) : 0
  const hole = rect
    ? {
        left: Math.max(0, rect.left - pad),
        top: Math.max(0, rect.top - pad),
        width: Math.min(vw, rect.right + pad) - Math.max(0, rect.left - pad),
        height: Math.min(vh, rect.bottom + pad) - Math.max(0, rect.top - pad)
      }
    : null
  /** Press the button the person is asked to press, for them. */
  const openIt = (): void => {
    if (!step.fallback) return
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${step.fallback.target}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 4 && r.height > 4) {
        el.click()
        return
      }
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Product tour">
      {hole ? (
        <>
          {/* the four dimmed panels swallow clicks, so the app underneath cannot be used mid-tour */}
          <div className="pointer-events-auto absolute left-0 right-0 top-0" style={{ height: hole.top, background: DIM }} />
          <div className="pointer-events-auto absolute bottom-0 left-0 right-0" style={{ top: hole.top + hole.height, background: DIM }} />
          <div className="pointer-events-auto absolute left-0" style={{ top: hole.top, height: hole.height, width: hole.left, background: DIM }} />
          <div className="pointer-events-auto absolute right-0" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width, background: DIM }} />
          {/* over the spotlight: blocks clicks, except on the button the person is asked to press */}
          {!missing && <div className="pointer-events-auto absolute" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} />}
          <div
            className="pointer-events-none absolute rounded-[8px] transition-all duration-200"
            style={{
              left: hole.left,
              top: hole.top,
              width: hole.width,
              height: hole.height,
              border: '1px solid color-mix(in srgb, var(--foreground) 40%, transparent)'
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0" style={{ background: DIM }} />
      )}

      <div
        ref={card}
        className="pointer-events-auto absolute select-text rounded-[11px] border border-border bg-muted p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] transition-[left,top] duration-300"
        style={{ left, top, width: CARD_W }}
      >
        <h2 className="font-display text-[16px] font-semibold leading-6">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{step.body}</p>
        {missing && step.fallback && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-[7px] bg-foreground/[0.06] px-2.5 py-1.5">
            <p className="text-[12.5px] leading-5 text-soft-foreground">{step.fallback.hint}</p>
            <button type="button" onClick={openIt} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Open it
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/[0.2]')}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {!last && (
              <button
                type="button"
                onClick={() => void endTour()}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Skip
              </button>
            )}
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Back
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (last ? void endTour() : setIndex((i) => i + 1))}
              className={buttonVariants({ size: 'sm' })}
            >
              {last ? 'Done' : index === 0 ? 'Start' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
