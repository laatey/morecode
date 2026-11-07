import React, { useMemo, useState } from 'react'
import { Check, Search } from '@/components/icons'
import { Btn, TextInput } from './kit'
import { cn } from '@/lib/utils'
import { getTheme, THEME_LIST } from '@/theme/themes'
import { isDarkKind, isHighContrast, type ThemeKind } from '@/theme/types'

type Filter = 'all' | 'dark' | 'light' | 'contrast'

const matches = (kind: ThemeKind, filter: Filter): boolean =>
  filter === 'all' ||
  (filter === 'contrast'
    ? isHighContrast(kind)
    : filter === 'dark'
      ? isDarkKind(kind) && !isHighContrast(kind)
      : !isDarkKind(kind) && !isHighContrast(kind))

const THEME_FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'contrast', label: 'High contrast' }
]

/**
 * A miniature of the app painted in one theme's own colours. These are inline styles on purpose: the card shows a
 * theme that is not the one currently applied, so the page's tokens cannot supply its colours.
 */
function Preview({ id }: { id: string }): React.JSX.Element {
  const t = getTheme(id).tokens
  const line = (width: number, color: string): React.JSX.Element => (
    <span className="block h-[5px] rounded-full" style={{ width, background: color }} />
  )
  return (
    <div
      className="flex h-[58px] overflow-hidden rounded-[6px]"
      style={{ background: t.background, border: `1px solid ${t.border}` }}
      aria-hidden
    >
      <div
        className="w-[22px] shrink-0 space-y-[5px] px-[5px] pt-[8px]"
        style={{ background: t.sidebar, borderRight: `1px solid ${t.border}` }}
      >
        {line(12, t['muted-foreground'])}
        {line(9, t['faint-foreground'])}
        {line(11, t['faint-foreground'])}
      </div>
      <div className="relative flex-1 space-y-[5px] px-[8px] pt-[8px]">
        <div className="flex gap-[4px]">
          {line(14, t['syn-keyword'])}
          {line(20, t['syn-title'])}
        </div>
        <div className="flex gap-[4px] pl-[8px]">
          {line(26, t['syn-string'])}
          {line(10, t['syn-number'])}
        </div>
        <div className="pl-[8px]">{line(22, t['syn-comment'])}</div>
        <span
          className="absolute bottom-[6px] right-[7px] h-[8px] w-[18px] rounded-[3px]"
          style={{ background: t.primary }}
        />
        <span
          className="absolute bottom-[8px] right-[30px] h-[4px] w-[14px] rounded-full"
          style={{ background: t.foreground, opacity: 0.55 }}
        />
      </div>
    </div>
  )
}

/** A grid of themes inside the chooser. `selected` is the id in use. */
function ThemeGrid({
  list,
  selected,
  onPick
}: {
  list: typeof THEME_LIST
  selected: string
  onPick: (id: string) => void
}): React.JSX.Element {
  if (list.length === 0)
    return <p className="px-1 py-8 text-center text-[12px] text-muted-foreground">No themes match.</p>
  return (
    <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
      {list.map((t) => {
        const on = selected === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(t.id)}
            className={cn(
              'cursor-pointer rounded-[10px] border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              on ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-foreground/[0.04]'
            )}
          >
            <Preview id={t.id} />
            <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
              <span className="truncate text-[12px] text-foreground">{t.label}</span>
              {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </span>
            <span className="block px-0.5 text-[10.5px] text-faint-foreground">{kindLabel(t.kind)}</span>
          </button>
        )
      })}
    </div>
  )
}

const kindLabel = (kind: ThemeKind): string =>
  isHighContrast(kind) ? 'High contrast' : isDarkKind(kind) ? 'Dark' : 'Light'

/**
 * One theme choice: the current theme with a preview and a "More" button. The cards are not on the page until
 * "More" is pressed; they then open right under the row, with search and filters.
 * `side` limits the cards to light or dark themes (used by "Match system", which keeps one of each).
 */
export function ThemeChooser({
  title,
  description,
  value,
  onPick,
  side
}: {
  title: string
  description?: React.ReactNode
  value: string
  onPick: (id: string) => void
  side?: 'light' | 'dark'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const current = getTheme(value)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return THEME_LIST.filter(
      (t) =>
        (!side || (side === 'dark') === isDarkKind(t.kind)) &&
        matches(t.kind, filter) &&
        (!q || t.label.toLowerCase().includes(q))
    )
  }, [query, filter, side])
  const filters = side ? THEME_FILTERS.filter((f) => f.value !== (side === 'dark' ? 'light' : 'dark')) : THEME_FILTERS
  const panel = `theme-cards-${side ?? 'any'}`

  return (
    <div>
      <div className="text-[12.5px] font-medium leading-snug text-foreground">{title}</div>
      {description && <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</div>}
      <div className="mt-3 flex items-center gap-3">
        <div className="w-[92px] shrink-0">
          <Preview id={value} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-foreground">{current.label}</p>
          <p className="text-[11.5px] text-muted-foreground">
            {current.source === 'vscode' ? 'VS Code' : 'MoreCode'} · {kindLabel(current.kind)}
          </p>
        </div>
        <Btn aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          {open ? 'Less' : 'More'}
        </Btn>
      </div>
      {open && (
        <div id={panel} className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search themes"
                aria-label="Search themes"
                className="pl-8"
              />
            </div>
            {filters.length > 2 && (
              <div role="group" aria-label="Show themes" className="flex shrink-0 gap-1">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      'h-8 cursor-pointer rounded-[7px] px-2.5 text-[12px] transition-colors',
                      filter === f.value
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ThemeGrid list={list} selected={value} onPick={onPick} />
        </div>
      )}
    </div>
  )
}
