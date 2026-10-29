import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { connectorsKey } from '@/lib/storage-keys'
import { SECRET_NAMES, secrets } from '@/lib/secrets'
import { entryById, type CatalogEntry } from './catalog'

export type Perm = 'allow' | 'ask' | 'block'
export type ToolInfo = { name: string; description?: string; readOnly?: boolean }

export interface Connector {
  id: string
  catalogId?: string
  name: string
  description?: string
  domain?: string
  kind: 'http' | 'stdio'
  url?: string
  command?: string
  /** Fixed arguments (secrets and chosen folders are added when it runs). */
  args: string[]
  /** How it signs in. */
  auth?: 'none' | 'token' | 'oauth'
  enabled: boolean
  perms: Record<string, Perm>
  tools: ToolInfo[]
}

/** What the connect form collects. Values may include secrets. */
export interface Draft {
  catalogId?: string
  name: string
  kind: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  token?: string
  env?: Record<string, string>
  /** Sign in through the browser instead of entering a key. */
  oauth?: boolean
}

type Secret = { token?: string; env?: Record<string, string>; oauth?: OAuth }
type McpConfig = Parameters<Window['api']['mcp']['test']>[0]
type OAuth = NonNullable<McpConfig['oauth']>

/* Sign-in details live in the encrypted store when the computer has one, ordinary storage otherwise. */
const readSecrets = (): Record<string, Secret> => {
  try {
    const raw = secrets.secure ? secrets.get(SECRET_NAMES.connectors) : localStorage.getItem(SECRET_NAMES.connectors)
    return raw ? (JSON.parse(raw) as Record<string, Secret>) : {}
  } catch {
    return {}
  }
}
const writeSecrets = (all: Record<string, Secret>): void => {
  const raw = JSON.stringify(all)
  if (secrets.secure) secrets.set(SECRET_NAMES.connectors, raw)
  else
    try {
      localStorage.setItem(SECRET_NAMES.connectors, raw)
    } catch {
      /* keep working in memory */
    }
}

function load(key: string): Connector[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? (raw as Connector[]) : []
  } catch {
    return []
  }
}

const toConfig = (c: Connector, secret: Secret): McpConfig => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  url: c.url,
  headers: secret.token && !secret.oauth ? { Authorization: `Bearer ${secret.token}` } : undefined,
  command: c.command,
  args: c.args,
  env: secret.env,
  perms: c.perms,
  oauth: secret.oauth
})

const newId = (name: string): string =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'connector'}-${crypto.randomUUID().slice(0, 4)}`

interface ConnectorsApi {
  connectors: Connector[]
  get: (id?: string) => Connector | undefined
  /** Connect, list the tools, and keep it. Returns an error message on failure. */
  add: (draft: Draft) => Promise<{ error: string | null; id: string }>
  /** Reconnect and refresh the tool list. */
  refresh: (id: string) => Promise<string | null>
  /** Sign in again through the browser and reconnect. */
  reauth: (id: string) => Promise<string | null>
  remove: (id: string) => void
  setEnabled: (id: string, on: boolean) => void
  setPerm: (id: string, tools: string[], perm: Perm | null) => void
  /** What a run needs: the switched-on connectors with their sign-in details. */
  forRun: () => McpConfig[]
}

const Ctx = createContext<ConnectorsApi | null>(null)

export function ConnectorsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { account } = useAuth()
  const key = connectorsKey(account?.id ?? 'guest')
  const [list, setList] = useState<Connector[]>(() => load(key))
  const latest = useRef(list)
  latest.current = list

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(list))
    } catch {
      /* storage full or blocked */
    }
  }, [key, list])

  const test = useCallback(async (c: Connector, secret: Secret): Promise<{ error: string | null; tools: ToolInfo[] }> => {
    if (!window.api?.mcp) return { error: 'Connectors need the desktop app.', tools: [] }
    const r = await window.api.mcp.test(toConfig(c, secret))
    return r.ok ? { error: null, tools: r.tools ?? [] } : { error: r.error ?? 'Could not connect.', tools: [] }
  }, [])

  const api_refresh = (id: string): Promise<string | null> => apiRef.current!.refresh(id)
  const apiRef = useRef<ConnectorsApi | null>(null)
  const api = useMemo<ConnectorsApi>(
    () => ({
      connectors: list,
      get: (id) => list.find((c) => c.id === id),
      add: async (d) => {
        const entry: CatalogEntry | undefined = entryById(d.catalogId)
        const c: Connector = {
          id: d.catalogId && !latest.current.some((x) => x.id === d.catalogId) ? d.catalogId : newId(d.name),
          catalogId: d.catalogId,
          name: d.name.trim() || entry?.name || 'Connector',
          description: entry?.description,
          domain: entry?.domain,
          kind: d.kind,
          url: d.url?.trim(),
          command: d.command?.trim(),
          args: d.args ?? [],
          enabled: true,
          perms: {},
          tools: []
        }
        const secret: Secret = { token: d.token?.trim() || undefined, env: d.env && Object.keys(d.env).length ? d.env : undefined }
        if (d.oauth) {
          if (!c.url || !window.api?.mcp) return { error: 'Connectors need the desktop app.', id: c.id }
          const a = await window.api.mcp.authorize(c.url)
          if (!a.ok || !a.oauth) return { error: a.error ?? 'Sign-in did not finish.', id: c.id }
          secret.oauth = a.oauth
          c.auth = 'oauth'
        } else c.auth = secret.token ? 'token' : 'none'
        const r = await test(c, secret)
        if (r.error) return { error: r.error, id: c.id }
        writeSecrets({ ...readSecrets(), [c.id]: secret })
        setList((all) => [{ ...c, tools: r.tools }, ...all.filter((x) => x.id !== c.id)])
        return { error: null, id: c.id }
      },
      refresh: async (id) => {
        const c = latest.current.find((x) => x.id === id)
        if (!c) return 'Not found.'
        const r = await test(c, readSecrets()[id] ?? {})
        if (!r.error) setList((all) => all.map((x) => (x.id === id ? { ...x, tools: r.tools } : x)))
        return r.error
      },
      reauth: async (id) => {
        const c = latest.current.find((x) => x.id === id)
        if (!c?.url || !window.api?.mcp) return 'Not found.'
        const a = await window.api.mcp.authorize(c.url)
        if (!a.ok || !a.oauth) return a.error ?? 'Sign-in did not finish.'
        const all = readSecrets()
        writeSecrets({ ...all, [id]: { ...all[id], oauth: a.oauth } })
        return api_refresh(id)
      },
      remove: (id) => {
        window.api?.mcp?.disconnect(id)
        const all = readSecrets()
        delete all[id]
        writeSecrets(all)
        setList((l) => l.filter((c) => c.id !== id))
      },
      setEnabled: (id, on) => {
        if (!on) window.api?.mcp?.disconnect(id)
        setList((l) => l.map((c) => (c.id === id ? { ...c, enabled: on } : c)))
      },
      setPerm: (id, tools, perm) =>
        setList((l) =>
          l.map((c) => {
            if (c.id !== id) return c
            const perms = { ...c.perms }
            for (const t of tools) {
              if (perm) perms[t] = perm
              else delete perms[t]
            }
            return { ...c, perms }
          })
        ),
      forRun: () => {
        const all = readSecrets()
        return latest.current.filter((c) => c.enabled).map((c) => toConfig(c, all[c.id] ?? {}))
      }
    }),
    [list, test]
  )

  apiRef.current = api

  // sign-ins renewed in the background, and calls the person chose to always allow
  useEffect(() => {
    const offTokens = window.api?.mcp?.onTokens(({ id, oauth }) => {
      const all = readSecrets()
      if (all[id]) writeSecrets({ ...all, [id]: { ...all[id], oauth } })
    })
    const always = (e: Event): void => {
      const d = (e as CustomEvent<{ id: string; tool: string }>).detail
      apiRef.current?.setPerm(d.id, [d.tool], 'allow')
    }
    window.addEventListener('connector:always', always)
    return () => {
      offTokens?.()
      window.removeEventListener('connector:always', always)
    }
  }, [])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConnectors(): ConnectorsApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConnectors must be used inside ConnectorsProvider')
  return v
}
