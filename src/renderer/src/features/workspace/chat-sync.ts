import { useEffect, useRef } from 'react'
import { HOSTED, hostedRequest } from '@/features/auth/http-auth-service'
import type { Msg } from '@/features/ai-assistant/types'
import type { Chat, ProjectGroup } from './workspace-store'

/**
 * Keeps this computer's chats and the server's copy in step: newer edit wins, deletions are
 * remembered, and nothing is sent unless the app is connected to a MoreCode server.
 */

export interface RemoteChat {
  id: string
  updated: number
  deleted: boolean
  data: { chat?: Chat; group?: ProjectGroup | null; messages?: Msg[] }
}

/** The starter chats every new account gets are the same everywhere, so they are not synced. */
const isStarter = (id: string): boolean => /^c\d+$/.test(id)

const sinceKey = (accountId: string): string => `morecode:sync:v1:${accountId}`

/** Pictures are left out: they are large and stay on the computer they were added on. */
const lean = (list: Msg[]): Msg[] => list.map((m) => (m.role === 'user' && m.images ? { ...m, images: undefined } : m))

export function useChatSync(opts: {
  accountId: string
  chats: Chat[]
  groups: ProjectGroup[]
  getMessages: (id: string) => Msg[]
  apply: (remote: RemoteChat[]) => void
}): void {
  const { accountId, chats, groups, getMessages, apply } = opts
  const pushed = useRef(new Map<string, number>())
  const ready = useRef(false)
  const latest = useRef({ chats, groups, getMessages, apply })
  useEffect(() => {
    latest.current = { chats, groups, getMessages, apply }
  })

  // pull: once on start, then every minute and whenever the window is focused again
  useEffect(() => {
    if (!HOSTED) return
    let stopped = false
    const pull = async (): Promise<void> => {
      try {
        const since = Number(localStorage.getItem(sinceKey(accountId)) || 0)
        const { chats: remote, now } = await hostedRequest<{ chats: RemoteChat[]; now: number }>('GET', `/v1/chats?since=${since}`)
        if (stopped) return
        if (remote.length) latest.current.apply(remote)
        for (const r of remote) pushed.current.set(r.id, r.updated) // what came from the server is not sent back
        localStorage.setItem(sinceKey(accountId), String(now))
        ready.current = true
      } catch {
        // offline or signed out: try again at the next tick
      }
    }
    void pull()
    const timer = setInterval(pull, 60_000)
    window.addEventListener('focus', pull)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', pull)
    }
  }, [accountId])

  // push: a moment after the last change
  useEffect(() => {
    if (!HOSTED) return
    const t = setTimeout(async () => {
      if (!ready.current) return
      const { chats: list, groups: gs, getMessages: get } = latest.current
      for (const c of list) {
        if (isStarter(c.id) || (pushed.current.get(c.id) ?? 0) >= c.updatedAt) continue
        try {
          await hostedRequest('PUT', `/v1/chats/${c.id}`, {
            updated: c.updatedAt,
            data: { chat: c, group: gs.find((g) => g.id === c.projectId) ?? null, messages: lean(get(c.id)) }
          })
          pushed.current.set(c.id, c.updatedAt)
        } catch {
          // too large, or offline: the next change tries again
        }
      }
      const ids = new Set(list.map((c) => c.id))
      for (const id of [...pushed.current.keys()]) {
        if (ids.has(id)) continue
        try {
          await hostedRequest('DELETE', `/v1/chats/${id}`)
          pushed.current.delete(id)
        } catch {
          // retried at the next change
        }
      }
    }, 2000)
    return () => clearTimeout(t)
  }, [chats, groups])
}
