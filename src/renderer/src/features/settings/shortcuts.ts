import { useEffect, useMemo, useRef } from 'react'
import { isMac } from '@/lib/platform'
import { useSettings } from './settings-store'

export type ShortcutGroup = 'General' | 'Layout' | 'Panels'

export interface ShortcutDef {
  id: string
  label: string
  group: ShortcutGroup
  /** "Mod" is Ctrl on Windows and Linux, and ⌘ on Mac. */
  combo: string
}

/** Every shortcut that can be changed. Add one here and it appears in Settings. */
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'palette', label: 'Open the command palette', group: 'General', combo: 'Mod+K' },
  { id: 'new-chat', label: 'Start a new chat', group: 'General', combo: 'Mod+N' },
  { id: 'settings', label: 'Open settings', group: 'General', combo: 'Mod+,' },
  { id: 'shortcuts', label: 'Show keyboard shortcuts', group: 'General', combo: 'Mod+/' },
  { id: 'toggle-sidebar', label: 'Show or hide the left sidebar', group: 'Layout', combo: 'Mod+B' },
  { id: 'toggle-panel', label: 'Show or hide the right sidebar', group: 'Layout', combo: 'Mod+Alt+B' },
  { id: 'open-terminal', label: 'Open the terminal', group: 'Panels', combo: 'Mod+`' },
  { id: 'open-changes', label: 'Open changes', group: 'Panels', combo: 'Mod+Shift+G' },
  { id: 'open-docs', label: 'Open docs', group: 'Panels', combo: 'Mod+Shift+D' }
]

/** Keys that never change; shown in Settings for reference. */
export const FIXED_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Enter'], label: 'Send your message (or Ctrl Enter, see General)' },
  { keys: ['Shift', 'Enter'], label: 'Add a new line' },
  { keys: ['/'], label: 'Open the command menu in the message box' },
  { keys: ['Tab'], label: 'Complete the highlighted command' },
  { keys: ['Esc'], label: 'Stop the AI, or close a menu' }
]

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt', 'AltGraph'])

/** The key part of a pressed combo. Letters and digits use the physical key so Alt does not change them. */
function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  if (e.key === ' ') return 'Space'
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

/** Turns a key press into "Mod+Shift+K", or null while only modifier keys are down. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(keyName(e))
  return parts.join('+')
}

/** The pieces to show as key caps: ["Ctrl", "Shift", "K"] or ["⌘", "⇧", "K"]. */
export function comboParts(combo: string): string[] {
  return combo.split('+').map((p) => {
    if (p === 'Mod') return isMac ? '⌘' : 'Ctrl'
    if (p === 'Alt') return isMac ? '⌥' : 'Alt'
    if (p === 'Shift') return isMac ? '⇧' : 'Shift'
    return p
  })
}

export const defaultCombo = (id: string): string => SHORTCUTS.find((s) => s.id === id)?.combo ?? ''

export function useBindings(): Record<string, string> {
  const { settings } = useSettings()
  return useMemo(() => {
    const out: Record<string, string> = {}
    for (const s of SHORTCUTS) out[s.id] = settings.shortcuts[s.id] ?? s.combo
    return out
  }, [settings.shortcuts])
}


/** The key caps for one shortcut, for menus and tooltips. */
export function useShortcutParts(id: string): string[] {
  const bindings = useBindings()
  return comboParts(bindings[id] ?? '')
}

/** Runs `handler` when the person presses the shortcut for `id`, however they have set it. */
export function useShortcut(id: string, handler: () => void): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  const bindings = useBindings()
  const combo = bindings[id]

  useEffect(() => {
    if (!combo) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.repeat) return
      if (comboFromEvent(e) !== combo) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [combo])
}
