import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { SlashCommand } from './slash-commands'

/** The part of the name the person has typed, drawn brighter. */
function Name({ id, query }: { id: string; query: string }): React.JSX.Element {
  const q = query.toLowerCase()
  const at = q ? id.indexOf(q) : -1
  if (at < 0) return <>/{id}</>
  return (
    <>
      /{id.slice(0, at)}
      <span className="font-semibold text-white">{id.slice(at, at + q.length)}</span>
      {id.slice(at + q.length)}
    </>
  )
}

/** Command list above the composer: one clear row per command, grouped. Keyboard handling lives in the composer. */
export function SlashMenu({
  commands,
  index,
  query,
  onHover,
  onPick
}: {
  commands: SlashCommand[]
  index: number
  query: string
  onHover: (i: number) => void
  onPick: (c: SlashCommand) => void
}): React.JSX.Element {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // block body on purpose: an effect must not return scrollIntoView()'s result
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div
      role="listbox"
      aria-label="Commands"
      className="absolute bottom-full left-0 z-30 mb-2 flex w-[min(380px,100%)] flex-col overflow-hidden rounded-[11px] border border-white/[0.1] bg-[#2a2a29] shadow-[0_12px_36px_rgba(0,0,0,0.5)] animate-in fade-in-0 slide-in-from-bottom-1 duration-100"
    >
      <div className="slim-scroll max-h-[min(320px,45vh)] overflow-y-auto p-1">
        {commands.length === 0 && (
          <div className="px-2.5 py-3 text-[12px] text-[#8d8d8a]">
            No command matches “/{query}”. Type <span className="text-[#c2c2bf]">/skills</span> to
            browse skills.
          </div>
        )}
        {commands.map((c, i) => {
          const Icon = c.icon
          const heading = !query && (i === 0 || commands[i - 1].group !== c.group)
          const isSelected = i === index
          return (
            <React.Fragment key={`${c.group}:${c.id}`}>
              {heading && (
                <div
                  className={cn(
                    'px-2.5 pb-1 text-[10.5px] font-medium text-[#7d7d79]',
                    i > 0 ? 'mt-1.5 pt-2' : 'pt-1.5'
                  )}
                >
                  {c.group}
                </div>
              )}
              <button
                ref={isSelected ? active : undefined}
                role="option"
                aria-selected={isSelected}
                type="button"
                title={c.hint ? `${c.description} — ${c.hint}` : c.description}
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus in the textarea
                  onPick(c)
                }}
                className={cn(
                  'flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 text-left transition-colors',
                  isSelected ? 'bg-white/[0.08]' : 'bg-transparent'
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    isSelected ? 'text-white' : 'text-[#8f8f8b]'
                  )}
                />
                <span
                  className={cn(
                    'shrink-0 text-[12.5px]',
                    isSelected ? 'text-white' : 'text-[#d4d4d0]'
                  )}
                >
                  <Name id={c.id} query={query} />
                </span>
                {c.badge && (
                  <span className="shrink-0 rounded-full bg-[#3b82f6]/20 px-1.5 text-[9.5px] leading-[15px] text-[#7db1ff]">
                    {c.badge}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-[#80807b]">
                  {c.description}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
