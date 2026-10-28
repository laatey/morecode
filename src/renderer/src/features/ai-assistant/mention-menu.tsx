import React, { useEffect, useRef } from 'react'
import { File as FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** File suggestions that appear while typing "@". Keyboard handling lives in the composer. */
export function MentionMenu({
  files,
  index,
  onHover,
  onPick
}: {
  files: string[]
  index: number
  onHover: (i: number) => void
  onPick: (path: string) => void
}): React.JSX.Element {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div
      role="listbox"
      aria-label="Files"
      className="absolute bottom-full left-0 z-30 mb-1.5 w-[220px] max-w-full overflow-hidden rounded-[8px] border border-white/[0.1] bg-[#262625] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
    >
      <div className="slim-scroll max-h-[160px] overflow-y-auto">
        {files.length === 0 && (
          <div className="px-1.5 py-1.5 text-[11px] text-muted-foreground">No matching files</div>
        )}
        {files.map((f, i) => {
          const cut = f.lastIndexOf('/')
          return (
            <React.Fragment key={f}>
              {i > 0 && <div className="my-0.5 h-px bg-white/[0.08]" />}
              <button
                ref={i === index ? active : undefined}
                role="option"
                aria-selected={i === index}
                type="button"
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(f)
                }}
                className={cn(
                  'flex h-[28px] w-full cursor-pointer items-center gap-2 rounded-[5px] px-1.5 text-left text-[12px] transition-colors',
                  i === index ? 'bg-white/[0.1]' : 'bg-transparent hover:bg-white/[0.07]'
                )}
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-[#a8a8a6]" />
                <span className="min-w-0 flex-1 truncate text-[#e2e2e0]" title={f}>{f.slice(cut + 1)}</span>
                {cut > 0 && <span className="max-w-[80px] shrink-0 truncate text-[10.5px] text-[#77776f]">{f.slice(0, cut)}</span>}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
