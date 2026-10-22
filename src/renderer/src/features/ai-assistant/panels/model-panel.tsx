import React, { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODELS } from '../models'
import type { PanelContext } from './panel-shell'
import { KeyChip, PanelFrame } from './ui'

/** Pick a model with the mouse, or ↑ ↓ and Enter. */
export function ModelPanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  const [index, setIndex] = useState(
    Math.max(
      0,
      MODELS.findIndex((m) => m.id === ctx.model)
    )
  )
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => list.current?.focus(), [])

  const choose = (id: string): void => {
    ctx.onModel(id)
    onClose()
  }

  return (
    <PanelFrame title="Choose a model" onClose={onClose} width={400}>
      <div
        ref={list}
        role="listbox"
        tabIndex={0}
        aria-label="Models"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const d = e.key === 'ArrowDown' ? 1 : -1
            setIndex((i) => (i + d + MODELS.length) % MODELS.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(MODELS[index].id)
          }
        }}
        className="-mx-1 space-y-0.5 outline-none"
      >
        {MODELS.map((m, i) => {
          const current = m.id === ctx.model
          return (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={current}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(m.id)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors',
                i === index ? 'bg-white/[0.07]' : 'bg-transparent'
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-[#ececea]">{m.name}</span>
                <span className="block text-[12px] text-[#8d8d8a]">{m.description}</span>
              </span>
              {current && <Check className="h-4 w-4 shrink-0 text-[#5aa6ff]" />}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.07] pt-3 text-[11.5px] text-[#77776f]">
        <KeyChip>↑</KeyChip>
        <KeyChip>↓</KeyChip> to move <KeyChip>↵</KeyChip> to choose. Applies to your next message.
      </div>
    </PanelFrame>
  )
}
