import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { KeyChip } from '@/features/ai-assistant/panels/ui'
import { cn } from '@/lib/utils'
import { Btn, Group, Page, Row, TextInput } from '../kit'
import { useSettings } from '../settings-store'
import {
  FIXED_SHORTCUTS,
  SHORTCUTS,
  comboFromEvent,
  comboParts,
  useBindings,
  type ShortcutGroup
} from '../shortcuts'

const GROUPS: ShortcutGroup[] = ['General', 'Layout', 'Panels']

function Keys({ combo }: { combo: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1">
      {comboParts(combo).map((k, i) => (
        <KeyChip key={`${k}${i}`}>{k}</KeyChip>
      ))}
    </span>
  )
}

export function ShortcutsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const bindings = useBindings()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)

  // while a row is waiting for new keys, swallow every key press so nothing else reacts to it
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        setEditing(null)
        setError(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return
      if (!combo.startsWith('Mod')) {
        setError({ id: editing, text: 'Include Ctrl (or ⌘) so it does not clash with typing.' })
        return
      }
      const clash = SHORTCUTS.find((s) => s.id !== editing && bindings[s.id] === combo)
      if (clash) {
        setError({ id: editing, text: `Already used for “${clash.label}”.` })
        return
      }
      set({ shortcuts: { ...settings.shortcuts, [editing]: combo } })
      setEditing(null)
      setError(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing, bindings, settings.shortcuts, set])

  const needle = query.trim().toLowerCase()
  const match = (label: string): boolean => !needle || label.toLowerCase().includes(needle)
  const changed = Object.keys(settings.shortcuts).length > 0
  const fixed = FIXED_SHORTCUTS.filter((f) => match(f.label))
  const none = !SHORTCUTS.some((s) => match(s.label)) && fixed.length === 0

  return (
    <Page title="Keyboard shortcuts" description="Select a shortcut, then press the keys you want.">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#77776f]" />
          <TextInput
            aria-label="Search shortcuts"
            placeholder="Search shortcuts"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {changed && (
          <Btn
            onClick={() => {
              set({ shortcuts: {} })
              setEditing(null)
              setError(null)
            }}
          >
            Reset all
          </Btn>
        )}
      </div>

      {GROUPS.map((g) => {
        const rows = SHORTCUTS.filter((s) => s.group === g && match(s.label))
        if (!rows.length) return null
        return (
          <Group key={g} title={g}>
            {rows.map((s) => {
              const isEditing = editing === s.id
              const custom = s.id in settings.shortcuts
              return (
                <Row
                  key={s.id}
                  title={s.label}
                  description={
                    error?.id === s.id ? <span className="text-[#f4a39e]">{error.text}</span> : undefined
                  }
                >
                  {custom && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...settings.shortcuts }
                        delete next[s.id]
                        set({ shortcuts: next })
                      }}
                      className="cursor-pointer text-[12.5px] text-[#7db1ff] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Change shortcut for ${s.label}`}
                    onClick={() => {
                      setError(null)
                      setEditing(isEditing ? null : s.id)
                    }}
                    className={cn(
                      'flex h-8 min-w-[110px] cursor-pointer items-center justify-center rounded-[8px] border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/60',
                      isEditing
                        ? 'border-[#3b82f6]/70 bg-[#3b82f6]/10 text-[12.5px] text-[#a3c8ff]'
                        : 'border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08]'
                    )}
                  >
                    {isEditing ? 'Press keys…' : <Keys combo={bindings[s.id]} />}
                  </button>
                </Row>
              )
            })}
          </Group>
        )
      })}

      {fixed.length > 0 && (
        <Group title="Always the same">
          {fixed.map((f) => (
            <Row key={f.label} title={f.label}>
              <span className="flex items-center gap-1">
                {f.keys.map((k) => (
                  <KeyChip key={k}>{k}</KeyChip>
                ))}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {none && <p className="text-[13px] text-[#8d8d8a]">No shortcuts match “{query}”.</p>}
    </Page>
  )
}
