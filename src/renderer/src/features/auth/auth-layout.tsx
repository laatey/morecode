import React, { useEffect, useState } from 'react'
import { ThinkingGlyph } from '@/features/ai-assistant/thinking-block'
import { Logo } from '@/components/logo'
import { WINDOW_CONTROLS_LEFT_PX, WINDOW_CONTROLS_RIGHT_PX } from '@/lib/platform'

const DEMO_PROMPT = 'the easing feels bouncy. make it snap instead of overshoot'

/**
 * Left-hand showcase: a looping miniature of the product. One prompt is typed, the AI thinks,
 * then reports a finished edit. It is the only moving thing on the page.
 */
function Showcase(): React.JSX.Element {
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'thinking' | 'done'>('typing')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(DEMO_PROMPT.length)
      setPhase('done')
      return
    }
    let t: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      t =
        typed < DEMO_PROMPT.length
          ? setTimeout(() => setTyped((n) => n + 1), 38)
          : setTimeout(() => setPhase('thinking'), 500)
    } else if (phase === 'thinking') {
      t = setTimeout(() => setPhase('done'), 1700)
    } else {
      t = setTimeout(() => {
        setTyped(0)
        setPhase('typing')
      }, 4200)
    }
    return () => clearTimeout(t)
  }, [typed, phase])

  return (
    <div className="w-full max-w-[460px]" aria-hidden>
      <div className="min-h-[196px] rounded-[12px] border border-white/[0.09] bg-[#2b2b2a] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="ml-auto w-fit max-w-[88%] rounded-[10px] bg-white/[0.08] px-3 py-2 text-[13px] leading-5 text-[#ececea]">
          {DEMO_PROMPT.slice(0, typed)}
          {phase === 'typing' && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-[#ececea]" />}
        </div>
        {phase !== 'typing' && (
          <div className="mt-4 space-y-1.5 text-[12.5px]">
            <div className="flex items-center gap-2">
              <ThinkingGlyph active={phase === 'thinking'} />
              {phase === 'thinking' ? (
                <span className="text-shimmer">Thinking…</span>
              ) : (
                <span className="text-[#8d8d8a]">Thought for 4s</span>
              )}
            </div>
            {phase === 'done' && (
              <>
                <p className="text-[#c9c9c6]">Swapping the back-out curve for a hard-stop snap.</p>
                <div className="flex items-center gap-2 text-[#c9c9c6]">
                  <span className="text-[#8d8d8a]">Edited</span>
                  <span className="rounded-[4px] bg-white/[0.06] px-1.5 text-[12px] leading-[18px] text-[#ececea]">
                    AlignmentGrid.tsx
                  </span>
                  <span className="tabular-nums">
                    <span className="text-[var(--diff-add)]">+3</span>{' '}
                    <span className="text-[var(--diff-del)]">−2</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[#c9c9c6]">
                  <span className="text-[#8d8d8a]">Checked types</span>
                  <span className="text-[#5fd17a]">Passed</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Full-window frame for every sign-in and setup screen: a draggable title strip, the product
 * showcase on the left (wide windows only), and the form on the right.
 */
export function AuthShell({
  children,
  showcase = true,
  wide = false
}: {
  children: React.ReactNode
  showcase?: boolean
  /** Wider form column, for setup steps with cards. */
  wide?: boolean
}): React.JSX.Element {
  return (
    <div className="relative flex h-screen w-screen select-none flex-col bg-background text-foreground">
      {/* draggable strip floats over the content, so the left panel runs the full height of the window */}
      <div
        className="app-drag absolute inset-x-0 top-0 z-10 h-[38px]"
        style={{
          paddingLeft: WINDOW_CONTROLS_LEFT_PX || undefined,
          paddingRight: WINDOW_CONTROLS_RIGHT_PX || undefined
        }}
      />
      <div className="flex min-h-0 flex-1">
        {showcase && (
          <aside className="hidden min-w-0 flex-1 flex-col justify-between border-r border-white/[0.07] bg-[#232322] p-10 lg:flex">
            <Logo />
            <div className="flex flex-col gap-8">
              <Showcase />
              <div className="max-w-[420px]">
                <h2 className="font-display text-[26px] font-semibold leading-8 tracking-tight">
                  Ask for a change. Watch it happen. Keep what you like.
                </h2>
                <p className="mt-2 text-[14px] leading-6 text-[#8d8d8a]">
                  Every edit is shown to you first, so you stay in charge of your project.
                </p>
              </div>
            </div>
            <p className="text-[12px] text-[#77776f]">morecode.app</p>
          </aside>
        )}
        <main className="slim-scroll flex min-w-0 flex-1 select-text justify-center overflow-y-auto px-6 pb-8 pt-14">
          <div className={wide ? 'my-auto w-full max-w-[720px]' : 'my-auto w-full max-w-[380px]'}>
            <div className={showcase ? 'mb-7 lg:hidden' : 'mb-7'}>
              <Logo />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function Heading({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="mb-6">
      <h1 className="font-display text-[26px] font-semibold leading-8 tracking-tight">{title}</h1>
      {children && <p className="mt-1.5 text-[14px] leading-6 text-[#8d8d8a]">{children}</p>}
    </header>
  )
}
