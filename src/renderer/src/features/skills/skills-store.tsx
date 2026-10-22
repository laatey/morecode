import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { skillsKey } from '@/lib/storage-keys'
import { CATALOG, DEFAULT_INSTALLED, type CustomCommand, type Skill } from './skills-data'

type Saved = {
  installed: string[]
  disabled: string[]
  custom: Skill[]
  commands: CustomCommand[]
}

const EMPTY: Saved = { installed: DEFAULT_INSTALLED, disabled: [], custom: [], commands: [] }

function load(key: string): Saved {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return EMPTY
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Saved>) }
  } catch {
    return EMPTY
  }
}

interface SkillsApi {
  /** Every skill in the library plus the ones you made. */
  all: Skill[]
  isInstalled: (id: string) => boolean
  isEnabled: (id: string) => boolean
  /** Added and switched on: these appear in the "/" menu. */
  active: Skill[]
  commands: CustomCommand[]
  install: (id: string) => void
  uninstall: (id: string) => void
  setEnabled: (id: string, on: boolean) => void
  saveSkill: (skill: Skill, replaceId?: string) => void
  deleteSkill: (id: string) => void
  saveCommand: (cmd: CustomCommand, replaceId?: string) => void
  deleteCommand: (id: string) => void
}

const Ctx = createContext<SkillsApi | null>(null)

/** Skills and custom commands for the signed-in account, saved on this computer. */
export function SkillsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { account } = useAuth()
  const key = skillsKey(account?.id ?? 'guest')
  const [saved, setSaved] = useState<Saved>(() => load(key))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(saved))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [key, saved])

  const api = useMemo<SkillsApi>(() => {
    const all = [...saved.custom, ...CATALOG]
    const isInstalled = (id: string): boolean =>
      saved.custom.some((s) => s.id === id) || saved.installed.includes(id)
    const isEnabled = (id: string): boolean => isInstalled(id) && !saved.disabled.includes(id)
    return {
      all,
      isInstalled,
      isEnabled,
      active: all.filter((s) => isEnabled(s.id)),
      commands: saved.commands,
      install: (id) =>
        setSaved((s) => ({
          ...s,
          installed: s.installed.includes(id) ? s.installed : [...s.installed, id],
          disabled: s.disabled.filter((x) => x !== id)
        })),
      uninstall: (id) => setSaved((s) => ({ ...s, installed: s.installed.filter((x) => x !== id) })),
      setEnabled: (id, on) =>
        setSaved((s) => ({
          ...s,
          disabled: on ? s.disabled.filter((x) => x !== id) : [...new Set([...s.disabled, id])]
        })),
      saveSkill: (skill, replaceId) =>
        setSaved((s) => ({
          ...s,
          custom: [skill, ...s.custom.filter((x) => x.id !== (replaceId ?? skill.id))]
        })),
      deleteSkill: (id) =>
        setSaved((s) => ({
          ...s,
          custom: s.custom.filter((x) => x.id !== id),
          disabled: s.disabled.filter((x) => x !== id)
        })),
      saveCommand: (cmd, replaceId) =>
        setSaved((s) => ({
          ...s,
          commands: [cmd, ...s.commands.filter((x) => x.id !== (replaceId ?? cmd.id))]
        })),
      deleteCommand: (id) =>
        setSaved((s) => ({ ...s, commands: s.commands.filter((x) => x.id !== id) }))
    }
  }, [saved])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSkills(): SkillsApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSkills must be used inside SkillsProvider')
  return v
}
