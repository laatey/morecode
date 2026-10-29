import React, { useEffect, useRef, useState } from 'react'
import { Check, Lock } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useModelChoices } from '../use-model-choices'
import type { PanelContext } from './panel-shell'
import { KeyChip, PanelFrame } from './ui'

/** Pick a model with the mouse, or ↑ ↓ and Enter. Models your plan does not include are shown locked, not hidden. */
export function ModelPanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  const { choices: rows, choose: pick } = useModelChoices(ctx.onModel)

  const [index, setIndex] = useState(
    Math.max(
      0,
      rows.findIndex((r) => r.model.id === ctx.model)
    )
  )
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => list.current?.focus(), [])

  const choose = (i: number): void => {
    onClose()
    pick(rows[i])
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
            setIndex((i) => (i + d + rows.length) % rows.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(index)
          }
        }}
        className="-mx-1 outline-none"
      >
        {rows.map((row, i) => {
          const { model: m } = row
          const current = m.id === ctx.model
          return (
            <React.Fragment key={m.id}>
              {row.group !== rows[i - 1]?.group && (
                <div className="px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#77776f]">
                  {row.group}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={current}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(i)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors',
                  i === index ? 'bg-white/[0.07]' : 'bg-transparent'
                )}
              >
                <span className={cn('min-w-0 flex-1', row.locked && 'opacity-60')}>
                  <span className="block text-[13px] text-[#ececea]">{m.name}</span>
                  <span className="block text-[12px] text-[#8d8d8a]">{m.description}</span>
                </span>
                {row.locked && (
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-[#8d8d8a]">
                    <Lock className="h-3 w-3" /> Upgrade
                  </span>
                )}
                {!row.locked && row.needsSetup && (
                  <span className="shrink-0 text-[11.5px] text-[#8d8d8a]">Needs a key</span>
                )}
                {current && <Check className="h-4 w-4 shrink-0 text-[#5aa6ff]" />}
              </button>
            </React.Fragment>
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
