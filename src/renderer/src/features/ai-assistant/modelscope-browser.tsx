import React, { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useSettings } from '@/features/settings/settings-store'
import { shortModelScopeName } from './models'
import { useModelScopeModels } from './use-modelscope-models'

/** How many results show at once. A long list is searched, not scrolled. */
const SHOWN = 40

/**
 * Look up a model on ModelScope: search the live list, pick one to use. A model you pick is also saved to your model
 * menu, and the ones you saved can be removed here. Used in the chat and on the Models settings page.
 */
export function ModelScopeBrowser({
  current,
  onPick,
  autoFocus
}: {
  /** ModelScope's name for the model in use, if it is one. */
  current: string | null
  /** The person chose a model. It is pinned to their menu by the caller of this. */
  onPick: (name: string) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const { settings, set } = useSettings()
  const { status, models, message, refresh } = useModelScopeModels()
  const [query, setQuery] = useState('')

  useEffect(() => refresh(), [refresh])

  const pinned = settings.modelScopeModels
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return models
    return models.filter((m) => words.every((w) => m.id.toLowerCase().includes(w)))
  }, [models, query])

  const unpin = (name: string): void => set({ modelScopeModels: pinned.filter((p) => p !== name) })

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#77776f]" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search ModelScope models"
          placeholder="Search by name, such as qwen or deepseek"
          className="h-8 w-full rounded-[7px] border border-[#3a3a37] bg-[#272726] pl-8 pr-2.5 text-[12.5px] text-white outline-none transition-colors placeholder:text-[#9a9a95] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
        />
      </div>

      {pinned.length > 0 && !query && (
        <div className="mt-3">
          <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#77776f]">
            Saved to your menu
          </div>
          {pinned.map((name) => (
            <div key={name} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPick(name)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">
                  {shortModelScopeName(name)}
                </span>
                {name === current && <Check className="h-3.5 w-3.5 shrink-0 text-[#5aa6ff]" />}
              </button>
              <button
                type="button"
                aria-label={`Remove ${shortModelScopeName(name)} from your menu`}
                onClick={() => unpin(name)}
                className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-[#77776f] transition-colors hover:bg-white/[0.08] hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#77776f]">
          <span>{query ? 'Results' : 'On ModelScope'}</span>
          {status === 'loading' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <button
              type="button"
              onClick={() => refresh(true)}
              className="cursor-pointer normal-case tracking-normal text-[11px] text-[#8d8d8a] transition-colors hover:text-foreground"
            >
              Refresh
            </button>
          )}
        </div>

        {status === 'error' && (
          <p className="px-1 pb-2 text-[12px] leading-4 text-[#f4a39e]">
            {message} {models.length ? 'Showing the last list we got.' : ''}
          </p>
        )}
        {status === 'ready' && matches.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-[#8d8d8a]">
            {query ? 'No model matches that.' : 'ModelScope returned no models.'}
          </p>
        )}

        <div
          role="listbox"
          aria-label="ModelScope models"
          className="slim-scroll max-h-64 overflow-y-auto"
        >
          {matches.slice(0, SHOWN).map((m) => {
            const saved = pinned.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={m.id === current}
                onClick={() => onPick(m.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-[#ececea]">
                    {shortModelScopeName(m.id)}
                  </span>
                  <span className="block truncate text-[11.5px] text-[#8d8d8a]">{m.id}</span>
                </span>
                {saved && m.id !== current && (
                  <span className="shrink-0 text-[11px] text-[#77776f]">Saved</span>
                )}
                {m.id === current && <Check className="h-3.5 w-3.5 shrink-0 text-[#5aa6ff]" />}
              </button>
            )
          })}
        </div>
        {matches.length > SHOWN && (
          <p className="px-1 pt-1.5 text-[11.5px] text-[#77776f]">
            {matches.length - SHOWN} more. Type to narrow it down.
          </p>
        )}
      </div>
    </div>
  )
}
