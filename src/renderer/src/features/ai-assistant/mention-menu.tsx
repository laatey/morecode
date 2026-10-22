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
      className="absolute bottom-full left-0 z-30 mb-1.5 w-[360px] max-w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[#262625] shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
    >
      <div className="slim-scroll max-h-[200px] overflow-y-auto p-0.5">
        {files.length === 0 && (
          <div className="px-2 py-1.5 text-[11.5px] text-muted-foreground">No matching files</div>
        )}
        {files.map((f, i) => {
          const cut = f.lastIndexOf('/')
          return (
            <React.Fragment key={f}>
              {i > 0 && <div className="my-0.5 h-px bg-white/[0.05]" />}
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
                  'flex h-6 w-full cursor-pointer items-center gap-2 rounded-[5px] px-2 text-left text-[12px] transition-colors',
                  i === index ? 'bg-white/[0.07]' : 'bg-transparent'
                )}
              >
                <FileIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-[#e2e2e0]">{f.slice(cut + 1)}</span>
                {cut > 0 && <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#77776f]">{f.slice(0, cut)}</span>}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
