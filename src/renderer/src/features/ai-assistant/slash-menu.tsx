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
      <span className="text-[#ececea]">{id.slice(at, at + q.length)}</span>
      {id.slice(at + q.length)}
    </>
  )
}

/** Command list above the composer. Keyboard handling lives in the composer. */
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
      className="absolute bottom-full left-0 z-30 mb-1.5 w-[240px] max-w-full overflow-hidden rounded-[11px] border border-white/[0.12] bg-[#30302e] shadow-[0_10px_32px_rgba(0,0,0,0.5)] animate-in fade-in-0 slide-in-from-bottom-1 duration-100"
    >
      <div className="slim-scroll max-h-[220px] overflow-y-auto p-1">
        {commands.length === 0 && (
          <div className="px-2 py-1.5 text-[11.5px] text-[#8d8d8a]">
            Nothing matches “/{query}”.{' '}
            <span className="text-[#77776f]">Type /skills to find more.</span>
          </div>
        )}
        {commands.map((c, i) => {
          const Icon = c.icon
          const heading = !query && (i === 0 || commands[i - 1].group !== c.group)
          const isSelected = i === index
          return (
            <React.Fragment key={`${c.group}:${c.id}`}>
              {heading ? (
                <>
                  {i > 0 && <div className="my-1 h-px bg-white/[0.07]" />}
                  <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-[#8e8e8a] first:pt-0.5">
                    {c.group}
                  </div>
                </>
              ) : (
                i > 0 && <div className="my-0.5 h-px bg-white/[0.05]" />
              )}
              <button
                ref={isSelected ? active : undefined}
                role="option"
                aria-selected={isSelected}
                type="button"
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus in the textarea
                  onPick(c)
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1 text-left transition-colors',
                  isSelected ? 'bg-white/[0.09]' : 'bg-transparent hover:bg-white/[0.04]'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-white' : 'text-[#9c9c98]')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('flex items-baseline gap-1.5 text-[12px] leading-tight', isSelected ? 'text-white' : 'text-[#c2c2bf]')}>
                    <Name id={c.id} query={query} />
                    {c.hint && isSelected && (
                      <span className="text-[10.5px] text-[#8e8e8a]">{c.hint}</span>
                    )}
                    {c.badge && (
                      <span className="rounded-full bg-[#3b82f6]/20 px-1.5 text-[9.5px] leading-[14px] text-[#7db1ff]">
                        {c.badge}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-[#82827d]">
                    {c.description}
                  </span>
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
