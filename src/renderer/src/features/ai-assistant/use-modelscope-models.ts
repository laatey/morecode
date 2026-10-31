import { useCallback, useSyncExternalStore } from 'react'
import { useSettings } from '@/features/settings/settings-store'

export interface ScopeModel {
  /** ModelScope's own name: "owner/model". */
  id: string
  owner?: string
}

interface ScopeState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  models: ScopeModel[]
  message: string | null
  at: number
  /** Which ModelScope site the list came from. */
  site: 'cn' | 'ai'
}

/** A looked-up list stays fresh this long; asking again sooner reuses it. */
const FRESH_MS = 10 * 60 * 1000

let state: ScopeState = { status: 'idle', models: [], message: null, at: 0, site: 'cn' }
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const publish = (next: ScopeState): void => {
  state = next
  listeners.forEach((l) => l())
}

/** Ask ModelScope which models its free API offers. One request at a time, and a recent answer is reused. */
export function loadModelScopeModels(key: string, site: 'cn' | 'ai', force = false): Promise<void> {
  if (inflight) return inflight
  const fresh = state.status === 'ready' && state.site === site && Date.now() - state.at < FRESH_MS
  if (!force && fresh) return Promise.resolve()
  // a list from the other site is not shown while this one loads
  publish({
    ...state,
    models: state.site === site ? state.models : [],
    site,
    status: 'loading',
    message: null
  })
  inflight = window.api.agent
    .listModels({ provider: 'modelscope', key: key || undefined, site })
    .then((r) => {
      if (r.ok) publish({ status: 'ready', models: r.models, message: null, at: Date.now(), site })
      else
        publish({
          // an older list is kept when a refresh fails, so a flaky connection does not empty the screen
          status: 'error',
          models: state.models,
          message: r.message ?? 'Could not load the list from ModelScope.',
          at: state.at,
          site
        })
    })
    .catch(() =>
      publish({ ...state, status: 'error', message: 'Could not load the list from ModelScope.' })
    )
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** The live ModelScope list, shared by every place that shows it. */
export function useModelScopeModels(): ScopeState & { refresh: (force?: boolean) => void } {
  const { settings } = useSettings()
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
  const key = settings.modelScopeKey
  const site = settings.modelScopeSite
  const refresh = useCallback(
    (force = false) => void loadModelScopeModels(key, site, force),
    [key, site]
  )
  return { ...snap, refresh }
}
