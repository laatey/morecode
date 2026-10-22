import { useMemo, useState, type JSX } from 'react'
import { cn } from '@/lib/utils'
import { highlightLines, languageFor } from '@/lib/highlight'

export type DiffLine = {
  type: 'ctx' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}
export type DiffHunk = { oldStart: number; newStart: number; lines: DiffLine[] }
export type FileDiff = {
  path: string
  action: 'create' | 'update' | 'delete'
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

const MAX_LINES = 1500

const tone: Record<DiffLine['type'], string> = {
  ctx: '',
  add: 'bg-[color-mix(in_oklch,var(--diff-add)_14%,transparent)]',
  del: 'bg-[color-mix(in_oklch,var(--diff-del)_14%,transparent)]'
}
const signColor: Record<DiffLine['type'], string> = {
  ctx: 'text-muted-foreground/40',
  add: 'text-[var(--diff-add)]',
  del: 'text-[var(--diff-del)]'
}

/** Highlight each hunk twice: the "after" side (context + added) and the "before" side (context + removed). */
function highlightHunk(lines: DiffLine[], language: string | null): string[] {
  const after = lines.filter((l) => l.type !== 'del')
  const before = lines.filter((l) => l.type !== 'add')
  const afterHtml = highlightLines(
    after.map((l) => l.text),
    language
  )
  const beforeHtml = lines.some((l) => l.type === 'del')
    ? highlightLines(
        before.map((l) => l.text),
        language
      )
    : []
  let a = 0
  let b = 0
  return lines.map((l) => {
    if (l.type === 'del') return beforeHtml[b++] ?? ''
    if (l.type === 'ctx') b++
    return afterHtml[a++] ?? ''
  })
}

/** Unified diff, one file, with syntax colouring. A brand-new file needs only one line-number column. */
export function DiffView({ file }: { file: FileDiff }): JSX.Element {
  const [all, setAll] = useState(false)
  const total = file.hunks.reduce((n, h) => n + h.lines.length, 0)
  const language = languageFor(file.path)
  const showOld = file.action !== 'create'
  const showNew = file.action !== 'delete'
  const html = useMemo(
    () => file.hunks.map((h) => highlightHunk(h.lines, language)),
    [file, language]
  )
  const limit = all ? Infinity : MAX_LINES
  // lines each hunk may show, computed up front (no mutation during render)
  const allowed = file.hunks.map((h, hi) => {
    const used = file.hunks.slice(0, hi).reduce((n, p) => n + p.lines.length, 0)
    return Math.max(0, Math.min(h.lines.length, limit - used))
  })

  if (!total) return <p className="px-4 py-6 text-xs text-muted-foreground">No textual changes.</p>

  const num = 'shrink-0 select-none pr-2 text-right text-muted-foreground/60'
  return (
    <div className="diff-code overflow-x-auto py-1 font-mono text-[11.5px] leading-5">
      <div className="min-w-max">
        {file.hunks.map((h, hi) => {
          const lines = h.lines.slice(0, allowed[hi])
          return (
            <div key={hi} className={cn(hi > 0 && 'my-1 border-t border-dashed')}>
              {lines.map((l, li) => (
                <div key={li} className={cn('flex', tone[l.type])}>
                  {showOld ? <span className={cn(num, 'w-9 pl-2')}>{l.oldNo ?? ''}</span> : null}
                  {showNew ? (
                    <span className={cn(num, showOld ? 'w-9' : 'w-10 pl-2')}>{l.newNo ?? ''}</span>
                  ) : null}
                  <span className={cn('w-4 shrink-0 select-none text-center', signColor[l.type])}>
                    {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}
                  </span>
                  <span
                    className="hljs whitespace-pre pl-1.5 pr-6"
                    dangerouslySetInnerHTML={{ __html: html[hi]?.[li] || ' ' }}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {!all && total > MAX_LINES ? (
        <button
          onClick={() => setAll(true)}
          className="w-full border-t px-4 py-2 text-left font-sans text-xs text-muted-foreground hover:text-foreground"
        >
          Show all {total} lines
        </button>
      ) : null}
    </div>
  )
}
