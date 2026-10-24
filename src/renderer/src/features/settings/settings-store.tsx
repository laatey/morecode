import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_MODEL } from '@/features/ai-assistant/models'
import { SETTINGS_KEY } from '@/lib/storage-keys'

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'models'
  | 'permissions'
  | 'shortcuts'
  | 'notifications'
  | 'billing'
  | 'data'
  | 'about'

export type Rule = 'ask' | 'allow' | 'block'
export type InterfaceSize = 'small' | 'default' | 'large'
export type ContentWidth = 'narrow' | 'default' | 'wide'

export interface Settings {
  sendWith: 'enter' | 'mod-enter'
  model: string
  /** Temporary personal endpoint used by the Kaggle Qwen experiment. Stored only in this app's local settings. */
  kaggleEndpoint: string
  kaggleToken: string
  /** Dedicated AI gateway address and its client key. */
  morlineGatewayUrl: string
  morlineGatewayKey: string
  autoAccept: boolean
  interfaceSize: InterfaceSize
  /** How wide the conversation and message box get. */
  contentWidth: ContentWidth
  reduceMotion: boolean
  /** What the AI does with each kind of action. Editing files follows `autoAccept`. */
  rules: { commands: Rule; install: Rule; remove: Rule; network: Rule }
  /** Commands the person chose to always allow. */
  allowedCommands: string[]
  /** Only the shortcuts that were changed from their defaults. */
  shortcuts: Record<string, string>
  notify: { finished: boolean; permission: boolean; sound: boolean }
  shareUsage: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sendWith: 'enter',
  model: DEFAULT_MODEL,
  kaggleEndpoint: '',
  kaggleToken: '',
  morlineGatewayUrl: '',
  morlineGatewayKey: '',
  autoAccept: false,
  interfaceSize: 'default',
  contentWidth: 'default',
  reduceMotion: false,
  rules: { commands: 'ask', install: 'ask', remove: 'ask', network: 'ask' },
  allowedCommands: [],
  shortcuts: {},
  notify: { finished: true, permission: true, sound: false },
  shareUsage: false
}

export const ZOOM: Record<InterfaceSize, number> = { small: 0.92, default: 1, large: 1.12 }
export const CONTENT_WIDTH: Record<ContentWidth, string> = {
  narrow: '44rem',
  default: '56rem',
  wide: '72rem'
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        rules: { ...DEFAULT_SETTINGS.rules, ...saved.rules },
        notify: { ...DEFAULT_SETTINGS.notify, ...saved.notify }
      }
    }
  } catch {
    // unreadable or blocked storage: use the defaults
  }
  return DEFAULT_SETTINGS
}

interface SettingsApi {
  settings: Settings
  set: (patch: Partial<Settings>) => void
  reset: () => void
  open: boolean
  tab: SettingsTab
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
  setTab: (tab: SettingsTab) => void
}

const Ctx = createContext<SettingsApi | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>(load)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('general')

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // storage full or blocked: settings last until the app closes
    }
  }, [settings])

  // interface size and reduced motion apply to the whole window
  useEffect(() => {
    window.api?.app?.setZoom(ZOOM[settings.interfaceSize])
  }, [settings.interfaceSize])
  useEffect(() => {
    document.documentElement.style.setProperty('--content-w', CONTENT_WIDTH[settings.contentWidth])
  }, [settings.contentWidth])
  useEffect(() => {
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
  }, [settings.reduceMotion])

  const set = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    []
  )
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])
  const openSettings = useCallback((t?: SettingsTab) => {
    if (t) setTab(t)
    setOpen(true)
  }, [])
  const closeSettings = useCallback(() => setOpen(false), [])

  const value = useMemo<SettingsApi>(
    () => ({ settings, set, reset, open, tab, openSettings, closeSettings, setTab }),
    [settings, set, reset, open, tab, openSettings, closeSettings]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
