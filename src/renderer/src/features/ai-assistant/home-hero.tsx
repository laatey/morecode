import React, { useEffect, useRef, useState } from 'react'
import { LogoMark } from '@/components/logo'

/** Said one at a time, in this order, on a new chat's home page. */
const LINES = [
  'What are we working on?',
  'What shall we build today?',
  'Where should we start?',
  'What needs fixing?',
  'Ready when you are.'
]

const TYPE_MS = 48
const ERASE_MS = 22
/** A short beat with the mark alone in the middle between lines: long enough to register, short enough not to drag. */
const REST_MS = 450
const HOLD_MS = 12000

const calm = (): boolean =>
  document.documentElement.dataset.motion === 'reduced' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The home page's headline. The mark starts alone in the middle; the line types out beside it and the mark is
 * carried left as the text grows. After a long pause the line is erased, the mark drifts back to the middle,
 * and the next line follows. With reduced motion it simply shows the first line.
 */
export function HomeHero({ subtitle }: { subtitle?: string }): React.JSX.Element {
  const [still] = useState(calm)
  const [line, setLine] = useState(0)
  const [shown, setShown] = useState(still ? LINES[0].length : 0)
  const first = useRef(true)
  const text = LINES[line]

  useEffect(() => {
    if (still) return
    let timer: ReturnType<typeof setTimeout>
    const type = (n: number): void => {
      setShown(n)
      if (n < text.length) timer = setTimeout(() => type(n + 1), TYPE_MS + Math.random() * 30)
      else {
        timer = setTimeout(() => erase(text.length), HOLD_MS)
      }
    }
    const erase = (n: number): void => {
      setShown(n)
      if (n > 0) timer = setTimeout(() => erase(n - 1), ERASE_MS)
      else {
        timer = setTimeout(() => setLine((l) => (l + 1) % LINES.length), REST_MS)
      }
    }
    // only the very first line waits a moment (the mark sits alone first); every later line follows at once
    timer = setTimeout(() => type(1), first.current ? 900 : 0)
    first.current = false
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, still])

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <h1
        aria-label={text}
        className="flex h-12 items-center justify-center gap-3.5 font-hero text-[38px] font-normal leading-none tracking-[-0.01em] text-foreground @[900px]:h-14 @[900px]:text-[44px]"
      >
        <LogoMark tone="mono" size={36} />
        <span aria-hidden className="whitespace-pre">
          {text.slice(0, shown)}
        </span>
      </h1>
      {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
