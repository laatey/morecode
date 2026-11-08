import React, { useEffect, useRef, useState } from 'react'
import { Check, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QuestionAnswer, QuestionRequest } from './types'

interface Draft {
  picked: string[]
  other: string
}

/** The AI marks the option it suggests by ending its label with "(Recommended)". */
const RECOMMENDED = /\s*\(recommended\)\s*$/i
const isRecommended = (label: string): boolean => RECOMMENDED.test(label)
const plain = (label: string): string => label.replace(RECOMMENDED, '').trim()
/** What goes back to the AI when the person leaves the choice to it. */
const YOU_DECIDE = 'You decide: use your best judgement'

/**
 * The AI's questions, attached to the top of the message box like the other bars. One question at a
 * time. Choosing an option only selects it: Next moves on, and the last question says Submit, so a
 * wrong click is never final. Some questions allow several choices. There is always a free-text row
 * for an answer of the person's own, and Esc skips. The answers go back to the AI, which is waiting.
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
  // what has been picked or typed for each question, kept so Back shows it again
  // the suggested option starts selected, so accepting the suggestion is just Next
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    request.items.map((q) => {
      const suggested = q.options.filter((o) => isRecommended(o.label)).map((o) => plain(o.label))
      return { picked: q.multi ? suggested : suggested.slice(0, 1), other: '' }
    })
  )
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const otherInput = useRef<HTMLInputElement>(null)

  const item = request.items[at]
  const { picked, other } = drafts[at]
  const otherRow = item.options.length
  const rows = otherRow + 1 // the free-text row is last
  const last = at + 1 >= total
  const typed = other.trim()
  const canGo = picked.length > 0 || typed.length > 0

  useEffect(() => {
    box.current?.focus({ preventScroll: true })
  }, [at])

  const patch = (d: Partial<Draft>): void =>
    setDrafts((all) => all.map((x, i) => (i === at ? { ...x, ...d } : x)))

  const answerFor = (d: Draft): string => {
    const extra = d.other.trim()
    return [...d.picked, ...(extra ? [extra] : [])].join(', ')
  }

  const submitAll = (all: Draft[]): void =>
    onAnswer(request.items.map((q, i) => ({ question: q.question, answer: answerFor(all[i]) })))

  const go = (): void => {
    if (!canGo) return
    if (last) submitAll(drafts)
    else {
      setAt(at + 1)
      setCursor(0)
    }
  }

  const decide = (): void => {
    const next = drafts.map((d, i) => (i === at ? { picked: [YOU_DECIDE], other: '' } : d))
    setDrafts(next)
    if (last) submitAll(next)
    else {
      setAt(at + 1)
      setCursor(0)
    }
  }

  const back = (): void => {
    if (at === 0) return
    setAt(at - 1)
    setCursor(0)
  }

  const choose = (i: number): void => {
    const label = item.options[i] ? plain(item.options[i].label) : ''
    if (!label) return
    if (item.multi) patch({ picked: picked.includes(label) ? picked.filter((x) => x !== label) : [...picked, label] })
    else patch({ picked: [label], other: '' }) // one answer: choosing clears what was typed
  }

  const onKey = (e: React.KeyboardEvent): void => {
    const typing = e.target === otherInput.current
    if (e.key === 'Escape') {
      e.preventDefault()
      onAnswer(null)
      return
    }
    if (typing) {
      if (e.key === 'Enter' && typed) {
        e.preventDefault()
        go()
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
      else if (canGo && (!item.multi ? picked.includes(plain(item.options[cursor]?.label ?? '')) : true)) go()
      else choose(cursor)
    } else if (e.key === ' ' && cursor < otherRow) {
      e.preventDefault()
      choose(cursor)
    } else if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1
      if (n < otherRow) {
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
      className="slim-scroll absolute inset-x-0 bottom-full z-30 mb-2 max-h-[min(340px,50vh)] overflow-y-auto rounded-2xl border border-border bg-muted px-2 pb-2 pt-2 shadow-[0_8px_28px_rgba(0,0,0,0.45)] outline-none"
    >
      <div className="flex min-h-5 items-start gap-2 px-1.5">
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-foreground">{item.question}</p>
        {total > 1 && (
          <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {at + 1}/{total}
          </span>
        )}
        <button
          type="button"
          aria-label="Skip the question"
          title="Skip (Esc)"
          onClick={() => onAnswer(null)}
          className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {item.multi && <p className="px-1.5 pt-0.5 text-[11px] text-muted-foreground">Choose as many as you like.</p>}

      <ul className="mt-1.5">
        {item.options.map((o, i) => {
          const on = picked.includes(plain(o.label))
          return (
            <li key={o.label}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                className={cn(
                  'flex min-h-7 w-full cursor-pointer items-start gap-2.5 rounded-[7px] px-1.5 py-[5px] text-left transition-colors',
                  cursor === i && 'bg-foreground/[0.07]'
                )}
              >
                <span
                  className={cn(
                    'mt-px grid h-[18px] w-[18px] shrink-0 place-items-center text-[10.5px] tabular-nums transition-colors',
                    item.multi ? 'rounded-[5px] border' : 'rounded-[5px]',
                    on
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : item.multi
                        ? 'border-border-strong text-transparent'
                        : 'bg-foreground/[0.07] text-muted-foreground'
                  )}
                >
                  {item.multi ? <Check className="h-2.5 w-2.5" /> : on ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {/* the description sits beside the label when there is room and drops under it when there is not */}
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0">
                  <span className="text-[12.5px] leading-[18px] text-foreground">
                    {plain(o.label)}
                    {isRecommended(o.label) && <span className="ml-1.5 rounded-[4px] bg-foreground/[0.08] px-1 py-px align-[1px] text-[10px] leading-[14px] text-muted-foreground">Recommended</span>}
                  </span>
                  {o.description && (
                    <span className="min-w-0 flex-1 basis-40 text-[12px] leading-[18px] text-muted-foreground/80">{o.description}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <label
            onMouseEnter={() => setCursor(otherRow)}
            className={cn(
              'flex min-h-7 cursor-text items-center gap-2.5 rounded-[7px] px-1.5 transition-colors',
              cursor === otherRow && 'bg-foreground/[0.07]'
            )}
          >
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-foreground/[0.07] text-[10.5px] tabular-nums text-muted-foreground">
              {otherRow + 1}
            </span>
            <input
              ref={otherInput}
              value={other}
              onFocus={() => setCursor(otherRow)}
              onChange={(e) => patch({ other: e.target.value, ...(item.multi ? {} : { picked: [] }) })}
              placeholder={item.multi ? 'Add your own' : 'Something else'}
              aria-label="Type your own answer"
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </label>
        </li>
      </ul>

      <div className="mt-1.5 flex items-center justify-end gap-1.5 px-1">
        <Button size="xs" variant="ghost" onClick={decide} title="Leave this one to the AI" className="mr-auto h-6 px-2 text-[11.5px] text-muted-foreground">
          You decide
        </Button>
        {at > 0 && (
          <Button size="xs" variant="ghost" onClick={back} className="h-6 px-2 text-[11.5px] text-muted-foreground">
            Back
          </Button>
        )}
        <Button size="xs" disabled={!canGo} onClick={go} className="h-6 px-3 text-[11.5px]">
          {last ? 'Submit' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
