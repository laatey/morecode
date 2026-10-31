import { SECRET_NAMES, secrets } from '@/lib/secrets'
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
  /** Dedicated AI gateway address and its client key. */
  morlineGatewayUrl: string
  morlineGatewayKey: string
  /** Personal OpenRouter key, kept in this app's local settings. */
  openRouterKey: string
  /** Personal ModelScope key. */
  modelScopeKey: string
  /** Which ModelScope site the key belongs to: modelscope.cn or the international modelscope.ai. */
  modelScopeSite: 'cn' | 'ai'
  autoAccept: boolean
  interfaceSize: InterfaceSize
  /** How wide the conversation and message box get. */
  contentWidth: ContentWidth
  reduceMotion: boolean
  /** What the AI does with each kind of action. Editing files follows `autoAccept`. */
  rules: { commands: Rule; install: Rule; remove: Rule; network: Rule; browse: Rule; web: Rule; git: Rule }
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
  morlineGatewayUrl: '',
  morlineGatewayKey: '',
  openRouterKey: '',
  modelScopeKey: '',
  modelScopeSite: 'cn',
  autoAccept: false,
  interfaceSize: 'default',
  contentWidth: 'default',
  reduceMotion: false,
  rules: { commands: 'ask', install: 'ask', remove: 'ask', network: 'ask', browse: 'ask', web: 'allow', git: 'ask' },
  allowedCommands: [],
  shortcuts: {},
  notify: { finished: true, permission: true, sound: false },
  shareUsage: false
}

/** The rules that "Trust the AI" switches together. Deleting files is deliberately not one of them. */
export const TRUST_KEYS = ['commands', 'install', 'network', 'browse', 'web', 'git'] as const
export const isTrusted = (s: Pick<Settings, 'autoAccept' | 'rules'>): boolean =>
  s.autoAccept && TRUST_KEYS.every((k) => s.rules[k] === 'allow')

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
      const saved = JSON.parse(raw) as Partial<Settings> & Record<string, unknown>
      // the retired Kaggle experiment: its saved address and token are wiped rather than left behind on disk
      delete saved.kaggleEndpoint
      delete saved.kaggleToken
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        rules: { ...DEFAULT_SETTINGS.rules, ...saved.rules },
        notify: { ...DEFAULT_SETTINGS.notify, ...saved.notify },
        // keys come from the encrypted store; a plain-text copy from an older version is used once, then moved
        openRouterKey: secrets.get(SECRET_NAMES.openRouter) ?? saved.openRouterKey ?? '',
        modelScopeKey: secrets.get(SECRET_NAMES.modelScope) ?? saved.modelScopeKey ?? '',
        modelScopeSite: saved.modelScopeSite === 'ai' ? 'ai' : 'cn',
        morlineGatewayKey: secrets.get(SECRET_NAMES.gateway) ?? saved.morlineGatewayKey ?? ''
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
    // keys go to the encrypted store when there is one, and are left out of the plain copy
    const keep = (name: string, value: string): void => {
      if ((secrets.get(name) ?? '') !== value) secrets.set(name, value || null)
    }
    keep(SECRET_NAMES.openRouter, settings.openRouterKey)
    keep(SECRET_NAMES.modelScope, settings.modelScopeKey)
    keep(SECRET_NAMES.gateway, settings.morlineGatewayKey)
    const plain: Partial<Settings> = { ...settings }
    if (secrets.secure) {
      delete plain.openRouterKey
      delete plain.modelScopeKey
      delete plain.morlineGatewayKey
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(plain))
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
