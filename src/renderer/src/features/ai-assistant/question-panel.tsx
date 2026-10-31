import React, { useEffect, useRef, useState } from 'react'
import { Check, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QuestionAnswer, QuestionRequest } from './types'

/**
 * The AI's questions, attached to the top of the message box like the other bars. One question at a
 * time; pick with the mouse, the number keys, or the arrows and Enter. There is always a free-text
 * row, and Esc skips. The answer goes straight back to the AI, which is waiting for it.
 */
export function QuestionPanel({
  request,
  onAnswer
}: {
  request: QuestionRequest
  onAnswer: (answers: QuestionAnswer[] | null) => void
}): React.JSX.Element {
  const total = request.items.length
  const [at, setAt] = useState(0)
  const [done, setDone] = useState<QuestionAnswer[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const otherInput = useRef<HTMLInputElement>(null)

  const item = request.items[at]
  const rows = item.options.length + 1 // the free-text row is last
  const otherRow = item.options.length

  useEffect(() => {
    box.current?.focus({ preventScroll: true })
  }, [at])

  const next = (answer: string): void => {
    const all = [...done.slice(0, at), { question: item.question, answer }]
    if (at + 1 >= total) onAnswer(all)
    else {
      setDone(all)
      setAt(at + 1)
      setPicked([])
      setOther('')
      setCursor(0)
    }
  }

  const back = (): void => {
    if (at === 0) return
    const prev = done[at - 1]
    setAt(at - 1)
    setPicked(request.items[at - 1].multi && prev ? prev.answer.split(', ') : [])
    setOther('')
    setCursor(0)
  }

  const choose = (i: number): void => {
    const label = item.options[i]?.label
    if (!label) return
    if (!item.multi) return next(label)
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]))
  }

  const submitMulti = (): void => {
    const extra = other.trim()
    const all = [...picked, ...(extra ? [extra] : [])]
    if (all.length) next(all.join(', '))
  }

  const canSubmit = picked.length > 0 || other.trim().length > 0

  const onKey = (e: React.KeyboardEvent): void => {
    const typing = e.target === otherInput.current
    if (e.key === 'Escape') {
      e.preventDefault()
      onAnswer(null)
      return
    }
    if (typing) {
      if (e.key === 'Enter' && other.trim()) {
        e.preventDefault()
        if (item.multi) submitMulti()
        else next(other.trim())
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor(Math.max(0, otherRow - 1))
        box.current?.focus()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(rows - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cursor === otherRow) otherInput.current?.focus()
      else if (item.multi && picked.length && !e.shiftKey) submitMulti()
      else choose(cursor)
    } else if (e.key === ' ' && item.multi && cursor < otherRow) {
      e.preventDefault()
      choose(cursor)
    } else if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1
      if (n < item.options.length) {
        e.preventDefault()
        setCursor(n)
        choose(n)
      } else if (n === otherRow) {
        e.preventDefault()
        setCursor(otherRow)
        otherInput.current?.focus()
      }
    }
  }

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="group"
      aria-label="The AI has a question"
      onKeyDown={onKey}
      className="slim-scroll absolute inset-x-0 bottom-full z-30 mb-2 max-h-[min(280px,42vh)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#2b2b2a] px-2 pb-1.5 pt-2 shadow-[0_8px_28px_rgba(0,0,0,0.45)] outline-none"
    >
      <div className="flex min-h-5 items-start gap-2 px-1.5">
        {item.header && (
          <span className="mt-[3px] shrink-0 rounded-[4px] bg-white/[0.07] px-1.5 text-[10px] font-medium uppercase leading-[15px] tracking-[0.06em] text-[#b9b9b5]">
            {item.header}
          </span>
        )}
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-[#ededeb]">
          {item.question}
        </p>
        {total > 1 && (
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
            {at > 0 && (
              <button type="button" onClick={back} className="cursor-pointer hover:text-foreground">
                Back
              </button>
            )}
            {at + 1}/{total}
          </span>
        )}
        <button
          type="button"
          aria-label="Skip the question"
          title="Skip (Esc)"
          onClick={() => onAnswer(null)}
          className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <ul className="mt-1.5">
        {item.options.map((o, i) => {
          const on = picked.includes(o.label)
          return (
            <li key={o.label}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                title={o.description}
                className={cn(
                  'flex h-7 w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 text-left transition-colors',
                  cursor === i && 'bg-white/[0.07]'
                )}
              >
                <span
                  className={cn(
                    'grid h-[18px] w-[18px] shrink-0 place-items-center text-[10.5px] tabular-nums transition-colors',
                    item.multi ? 'rounded-[5px] border' : 'rounded-[5px]',
                    on
                      ? 'border-transparent bg-[#3b82f6] text-white'
                      : item.multi
                        ? 'border-white/[0.2] text-transparent'
                        : 'bg-white/[0.07] text-[#b9b9b5]'
                  )}
                >
                  {item.multi ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span className="shrink-0 text-[12.5px] text-[#ededeb]">{o.label}</span>
                {o.description && (
                  <span className="min-w-0 truncate text-[12px] text-muted-foreground/80">
                    {o.description}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        <li>
          <label
            onMouseEnter={() => setCursor(otherRow)}
            className={cn(
              'flex h-7 cursor-text items-center gap-2.5 rounded-[7px] px-1.5 transition-colors',
              cursor === otherRow && 'bg-white/[0.07]'
            )}
          >
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-white/[0.07] text-[10.5px] tabular-nums text-[#b9b9b5]">
              {otherRow + 1}
            </span>
            <input
              ref={otherInput}
              value={other}
              onFocus={() => setCursor(otherRow)}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Something else"
              aria-label="Type your own answer"
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#ededeb] outline-none placeholder:text-muted-foreground/60"
            />
            {item.multi && (
              <Button
                size="xs"
                disabled={!canSubmit}
                onClick={submitMulti}
                className="-mr-0.5 h-5 px-2 text-[11px]"
              >
                {at + 1 >= total ? 'Send' : 'Next'}
              </Button>
            )}
          </label>
        </li>
      </ul>
    </div>
  )
}
