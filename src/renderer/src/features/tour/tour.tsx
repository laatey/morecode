import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

type Side = 'right' | 'left' | 'top' | 'center'

interface TourStep {
  target?: string
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
const PAD = 6

/**
 * Spotlight tour. Dims the app, cuts a hole around the thing being explained, and shows a card
 * next to it. If a target is not on screen (for example a collapsed sidebar) the card is
 * simply centred, so the tour can never get stuck.
 */
export function Tour(): React.JSX.Element | null {
  const { tourOpen, endTour } = useAuth()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardH, setCardH] = useState(190)
  const card = useRef<HTMLDivElement>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  useEffect(() => {
    if (tourOpen) setIndex(0)
  }, [tourOpen])

  useLayoutEffect(() => {
    if (!tourOpen) return
    const measure = (): void => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
      const r = el?.getBoundingClientRect()
      setRect(r && r.width > 4 && r.height > 4 ? r : null)
      if (card.current) setCardH(card.current.offsetHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setInterval(measure, 300) // catches panels that are still animating open
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
    if (step.side === 'right') {
      left = rect.right + GAP
      top = rect.top + rect.height / 2 - cardH / 2
    } else if (step.side === 'left') {
      left = rect.left - CARD_W - GAP
      top = rect.top + rect.height / 2 - cardH / 2
    } else {
      left = rect.left + rect.width / 2 - CARD_W / 2
      top = rect.top - cardH - GAP
    }
    left = clamp(left, MARGIN, vw - CARD_W - MARGIN)
    top = clamp(top, MARGIN, vh - cardH - MARGIN)
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* swallows clicks so the app underneath cannot be used mid-tour */}
      <div className="absolute inset-0" />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[12px] shadow-[0_0_0_9999px_rgba(0,0,0,0.62)] ring-1 ring-white/25 transition-all duration-300"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        ref={card}
        className="absolute select-text rounded-[11px] border border-white/[0.12] bg-[#2b2b2a] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] transition-[left,top] duration-300"
        style={{ left, top, width: CARD_W }}
      >
        <h2 className="font-display text-[16px] font-semibold leading-6">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#a8a8a6]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-[#3b82f6]' : 'w-1.5 bg-white/[0.2]')}
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
