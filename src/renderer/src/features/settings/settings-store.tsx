import { SECRET_NAMES, secrets } from '@/lib/secrets'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_MODEL } from '@/features/ai-assistant/models'
import { SETTINGS_KEY } from '@/lib/storage-keys'
import { cleanThemePrefs, DEFAULT_THEME_PREFS, type ThemePrefs } from '@/theme/prefs'
import { useApplyTheme } from '@/theme/use-theme'

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'models'
  | 'permissions'
  | 'memory'
  | 'shortcuts'
  | 'notifications'
  | 'billing'
  | 'data'
  | 'about'

export type Rule = 'ask' | 'allow' | 'block'
export type InterfaceSize = 'small' | 'default' | 'large'
export type ContentWidth = 'narrow' | 'default' | 'wide'

export interface Settings extends ThemePrefs {
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
  /** Personal Groq key (console.groq.com). */
  groqKey: string
  autoAccept: boolean
  interfaceSize: InterfaceSize
  /** How wide the conversation and message box get. */
  contentWidth: ContentWidth
  reduceMotion: boolean
  /** Stop the computer sleeping while the AI works. */
  keepAwake: boolean
  /** Also do it when running on battery power. */
  keepAwakeOnBattery: boolean
  /** What the AI does with each kind of action. Editing files follows `autoAccept`. */
  rules: { commands: Rule; install: Rule; remove: Rule; network: Rule; browse: Rule; web: Rule; git: Rule; /** Memory: allow = save on its own, ask = approve each save, block = memory is off everywhere. */ memory: Rule }
  /** Commands the person chose to always allow. */
  allowedCommands: string[]
  /** Only the shortcuts that were changed from their defaults. */
  shortcuts: Record<string, string>
  notify: { finished: boolean; permission: boolean; sound: boolean }
  shareUsage: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_THEME_PREFS,
  sendWith: 'enter',
  model: DEFAULT_MODEL,
  morlineGatewayUrl: '',
  morlineGatewayKey: '',
  openRouterKey: '',
  modelScopeKey: '',
  modelScopeSite: 'cn',
  groqKey: '',
  autoAccept: false,
  interfaceSize: 'default',
  contentWidth: 'default',
  reduceMotion: false,
  keepAwake: true,
  keepAwakeOnBattery: false,
  rules: { commands: 'ask', install: 'ask', remove: 'ask', network: 'ask', browse: 'ask', web: 'allow', git: 'ask', memory: 'ask' },
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
  narrow: '40rem',
  default: '48rem',
  wide: '60rem'
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
        ...cleanThemePrefs(saved),
        rules: { ...DEFAULT_SETTINGS.rules, ...saved.rules },
        notify: { ...DEFAULT_SETTINGS.notify, ...saved.notify },
        // keys come from the encrypted store; a plain-text copy from an older version is used once, then moved
        openRouterKey: secrets.get(SECRET_NAMES.openRouter) ?? saved.openRouterKey ?? '',
        modelScopeKey: secrets.get(SECRET_NAMES.modelScope) ?? saved.modelScopeKey ?? '',
        modelScopeSite: saved.modelScopeSite === 'ai' ? 'ai' : 'cn',
        groqKey: secrets.get(SECRET_NAMES.groq) ?? saved.groqKey ?? '',
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
  /** The theme currently in effect (differs from `settings.theme` while following the system). */
  activeThemeId: string
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
  const activeThemeId = useApplyTheme(settings)

  useEffect(() => {
    // keys go to the encrypted store when there is one, and are left out of the plain copy
    const keep = (name: string, value: string): void => {
      if ((secrets.get(name) ?? '') !== value) secrets.set(name, value || null)
    }
    keep(SECRET_NAMES.openRouter, settings.openRouterKey)
    keep(SECRET_NAMES.modelScope, settings.modelScopeKey)
    keep(SECRET_NAMES.groq, settings.groqKey)
    keep(SECRET_NAMES.gateway, settings.morlineGatewayKey)
    const plain: Partial<Settings> = { ...settings }
    if (secrets.secure) {
      delete plain.openRouterKey
      delete plain.modelScopeKey
      delete plain.groqKey
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
  useEffect(() => {
    window.api?.power?.set({ keepAwake: settings.keepAwake, onBattery: settings.keepAwakeOnBattery })
  }, [settings.keepAwake, settings.keepAwakeOnBattery])

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
    () => ({ settings, set, reset, activeThemeId, open, tab, openSettings, closeSettings, setTab }),
    [settings, set, reset, activeThemeId, open, tab, openSettings, closeSettings]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
