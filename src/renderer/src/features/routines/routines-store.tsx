import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { useWorkspace } from '@/features/workspace/workspace-store'

export type RoutineCadence = 'hourly' | 'daily' | 'weekly'
export interface Routine {
  id: string
  title: string
  prompt: string
  cadence: RoutineCadence
  time: string
  weekday: number
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  /** The project every run happens in. Null means a loose chat with no project folder. */
  projectId?: string | null
  /** true: when it is due it opens its own chat and runs by itself. false (default): the person is told and starts it. */
  auto?: boolean
  /** Kept so older saved routines still load. Every enabled routine now starts by itself. */
  lastChatId?: string
  /** The routine's one chat. Every run happens here, so the whole history is in one place. */
  chatId?: string
}

interface RoutineApi {
  routines: Routine[]
  add: (routine: Omit<Routine, 'id' | 'enabled' | 'nextRunAt' | 'chatId'>) => string
  update: (id: string, patch: Partial<Pick<Routine, 'title' | 'prompt' | 'cadence' | 'time' | 'weekday' | 'projectId' | 'auto'>>) => void
  toggle: (id: string) => void
  remove: (id: string) => void
  markRun: (id: string, at?: number, chatId?: string) => void
  /** Not this time: move on to the next scheduled time without running. */
  skip: (id: string) => void
}

const Ctx = createContext<RoutineApi | null>(null)

export function nextRoutineTime(routine: Pick<Routine, 'cadence' | 'time' | 'weekday'>, from = Date.now()): number {
  const date = new Date(from)
  if (routine.cadence === 'hourly') return from + 60 * 60 * 1000
  const [hours, minutes] = routine.time.split(':').map(Number)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  if (routine.cadence === 'daily') {
    if (date.getTime() <= from) date.setDate(date.getDate() + 1)
    return date.getTime()
  }
  date.setDate(date.getDate() + ((routine.weekday - date.getDay() + 7) % 7))
  if (date.getTime() <= from) date.setDate(date.getDate() + 7)
  return date.getTime()
}

function load(key: string): Routine[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as Routine[]
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === 'string' && typeof item.prompt === 'string') : []
  } catch {
    return []
  }
}

export function RoutinesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { account } = useAuth()
  const ws = useWorkspace()
  const key = `morecode:routines:v1:${account?.id ?? 'guest'}`
  const [routines, setRoutines] = useState<Routine[]>(() => load(key))

  useEffect(() => {
    setRoutines(load(key))
  }, [key])
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(routines))
    } catch {
      // Routines remain usable for this session if storage is unavailable.
    }
  }, [key, routines])

  // every routine has exactly one chat: make it for new routines, and for older ones that never had one
  useEffect(() => {
    const need = routines.filter((r) => !r.chatId || !ws.chats.some((c) => c.id === r.chatId))
    if (!need.length) return
    const made = new Map(need.map((r) => [r.id, ws.createRoutineChat(r.id, r.title, r.projectId ?? null)]))
    setRoutines((items) => items.map((r) => (made.has(r.id) ? { ...r, chatId: made.get(r.id) } : r)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines, ws.chats])

  const api = useMemo<RoutineApi>(() => ({
    routines,
    add: (input) => {
      const id = crypto.randomUUID()
      const item: Routine = { ...input, id, enabled: true, nextRunAt: 0, chatId: ws.createRoutineChat(id, input.title, input.projectId ?? null) }
      item.nextRunAt = nextRoutineTime(item)
      setRoutines((items) => [item, ...items])
      return id
    },
    update: (id, patch) => {
      const current = routines.find((r) => r.id === id)
      if (current?.chatId) ws.patchChat(current.chatId, { title: patch.title, projectId: patch.projectId })
      setRoutines((items) => items.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        return { ...next, nextRunAt: item.enabled ? nextRoutineTime(next) : item.nextRunAt }
      }))
    },
    toggle: (id) => setRoutines((items) => items.map((item) => item.id !== id ? item : {
      ...item,
      enabled: !item.enabled,
      nextRunAt: item.enabled ? item.nextRunAt : nextRoutineTime(item)
    })),
    remove: (id) => {
      const current = routines.find((r) => r.id === id)
      if (current?.chatId) ws.removeRoutineChat(current.chatId)
      setRoutines((items) => items.filter((item) => item.id !== id))
    },
    skip: (id) => setRoutines((items) => items.map((item) => item.id !== id ? item : { ...item, nextRunAt: nextRoutineTime(item) })),
    markRun: (id, at = Date.now(), chatId) => setRoutines((items) => items.map((item) => item.id !== id ? item : {
      ...item,
      lastRunAt: at,
      lastChatId: chatId ?? item.lastChatId,
      nextRunAt: nextRoutineTime(item, at)
    }))
  }), [routines, ws])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRoutines(): RoutineApi {
  const value = useContext(Ctx)
  if (!value) throw new Error('useRoutines must be used inside <RoutinesProvider>')
  return value
}
