import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { getTabDefinition } from './registry'
import { getLayout, LAYOUTS, MAX_PANES } from './layouts'
import type { LayoutId, TabInstance } from './types'

interface State {
  tabs: TabInstance[]
  layout: LayoutId
  /** Tab id shown in each pane (index = pane). Always MAX_PANES long; only the first N are visible. */
  paneTabs: (string | null)[]
  focusedPane: number
  /** Names the person gave their tabs. Saved. */
  titles: Record<string, string>
  /** Names a tab sets for itself, like a web page's title. Not saved. */
  autoTitles: Record<string, string>
}

type Action =
  | { type: 'open'; tab: TabInstance; existing: boolean }
  | { type: 'beside'; tab: TabInstance; existing: boolean }
  | { type: 'show'; tabId: string }
  | { type: 'close'; tabIds: string[] }
  | { type: 'layout'; layout: LayoutId }
  | { type: 'focus'; pane: number }
  | { type: 'rename'; tabId: string; title: string }
  | { type: 'auto-title'; tabId: string; title: string }
  | { type: 'move'; tabId: string; toIndex: number }

const STORAGE_KEY = 'morecode:right-panel:v1'

const blank: State = {
  tabs: [],
  layout: 'single',
  paneTabs: Array(MAX_PANES).fill(null),
  focusedPane: 0,
  titles: {},
  autoTitles: {}
}

const visiblePanes = (s: State): number => getLayout(s.layout).panes

/** Put a tab in the focused pane, or just focus the pane already showing it. */
function show(s: State, tabId: string): State {
  const n = visiblePanes(s)
  const where = s.paneTabs.slice(0, n).indexOf(tabId)
  if (where >= 0) return { ...s, focusedPane: where }
  const paneTabs = [...s.paneTabs]
  paneTabs[s.focusedPane] = tabId
  return { ...s, paneTabs }
}

/** Fill empty visible panes with tabs that aren't displayed yet. */
function fill(s: State): State {
  const n = visiblePanes(s)
  const paneTabs = [...s.paneTabs]
  for (let i = 0; i < n; i++) {
    if (paneTabs[i] && s.tabs.some((t) => t.id === paneTabs[i])) continue
    const free = s.tabs.find((t) => !paneTabs.slice(0, n).includes(t.id))
    paneTabs[i] = free?.id ?? null
  }
  return { ...s, paneTabs }
}

/** Read the saved layout, dropping anything that no longer exists (a removed tab kind, a bad file). */
function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<State> | null
    if (!raw || !Array.isArray(raw.tabs)) return blank
    const seen = new Set<string>()
    const tabs = raw.tabs.filter(
      (t): t is TabInstance =>
        Boolean(t) &&
        typeof t.id === 'string' &&
        typeof t.kind === 'string' &&
        Boolean(getTabDefinition(t.kind)) &&
        !seen.has(t.id) &&
        Boolean(seen.add(t.id))
    )
    const layout = LAYOUTS.some((l) => l.id === raw.layout) ? (raw.layout as LayoutId) : 'single'
    const paneTabs = Array.from({ length: MAX_PANES }, (_, i) => {
      const id = raw.paneTabs?.[i]
      return typeof id === 'string' && seen.has(id) ? id : null
    })
    const titles: Record<string, string> = {}
    for (const [id, title] of Object.entries(raw.titles ?? {})) {
      if (seen.has(id) && typeof title === 'string' && title.trim()) titles[id] = title
    }
    const focusedPane = Math.min(Math.max(0, Number(raw.focusedPane) || 0), getLayout(layout).panes - 1)
    return fill({ tabs, layout, paneTabs, focusedPane, titles, autoTitles: {} })
  } catch {
    return blank
  }
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'open': {
      if (a.existing) return show(s, a.tab.id)
      return show({ ...s, tabs: [...s.tabs, a.tab] }, a.tab.id)
    }
    case 'beside': {
      const layout: LayoutId = getLayout(s.layout).panes < 2 ? 'columns' : s.layout
      const panes = getLayout(layout).panes
      const target = (s.focusedPane + 1) % panes
      const tabs = a.existing ? s.tabs : [...s.tabs, a.tab]
      // a tab can only be in one pane, so lift it out of wherever it was
      const paneTabs = s.paneTabs.map((id) => (id === a.tab.id ? null : id))
      paneTabs[target] = a.tab.id
      return fill({ ...s, tabs, layout, paneTabs, focusedPane: target })
    }
    case 'show':
      return show(s, a.tabId)
    case 'close': {
      const gone = new Set(a.tabIds)
      const tabs = s.tabs.filter((t) => !gone.has(t.id))
      const paneTabs = s.paneTabs.map((id) => (id && gone.has(id) ? null : id))
      const titles = Object.fromEntries(Object.entries(s.titles).filter(([id]) => !gone.has(id)))
      const autoTitles = Object.fromEntries(Object.entries(s.autoTitles).filter(([id]) => !gone.has(id)))
      return fill({ ...s, tabs, paneTabs, titles, autoTitles })
    }
    case 'layout': {
      const next = { ...s, layout: a.layout }
      const focusedPane = Math.min(s.focusedPane, getLayout(a.layout).panes - 1)
      return fill({ ...next, focusedPane })
    }
    case 'focus':
      return { ...s, focusedPane: a.pane }
    case 'rename': {
      const title = a.title.trim().slice(0, 40)
      const titles = { ...s.titles }
      if (title) titles[a.tabId] = title
      else delete titles[a.tabId]
      return { ...s, titles }
    }
    case 'auto-title': {
      if (s.autoTitles[a.tabId] === a.title) return s
      return { ...s, autoTitles: { ...s.autoTitles, [a.tabId]: a.title } }
    }
    case 'move': {
      const from = s.tabs.findIndex((t) => t.id === a.tabId)
      if (from < 0) return s
      const to = Math.min(Math.max(0, a.toIndex), s.tabs.length - 1)
      if (from === to) return s
      const tabs = [...s.tabs]
      const [tab] = tabs.splice(from, 1)
      tabs.splice(to, 0, tab)
      return { ...s, tabs }
    }
  }
}

interface RightPanelApi extends State {
  /** Open a tab by kind (focuses the existing one unless the kind allows multiple). */
  openTab: (kind: string) => void
  /** Open a tab next to the one you are looking at, switching to a two-pane layout if needed. */
  splitTab: (kind: string) => void
  /** Move an open tab into the other pane. */
  moveBeside: (tabId: string) => void
  showTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  closeOthers: (tabId: string) => void
  setLayout: (layout: LayoutId) => void
  focusPane: (pane: number) => void
  /** An empty name puts the original back. */
  renameTab: (tabId: string, title: string) => void
  /** Let a tab name itself (a web page's title). A name the person chose still wins. */
  setAutoTitle: (tabId: string, title: string) => void
  moveTab: (tabId: string, toIndex: number) => void
  /** What to show on the tab: the person's name, then the tab's own, then the tool's default. */
  titleOf: (tab: TabInstance) => string
}

const Ctx = createContext<RightPanelApi | null>(null)

const newTab = (kind: string): TabInstance => ({ id: `${kind}-${crypto.randomUUID().slice(0, 8)}`, kind })

export function RightPanelProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  // keep the open tabs and layout between launches
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tabs: state.tabs,
          layout: state.layout,
          paneTabs: state.paneTabs,
          focusedPane: state.focusedPane,
          titles: state.titles
        })
      )
    } catch {
      // storage full or blocked: the layout simply will not come back next time
    }
  }, [state.tabs, state.layout, state.paneTabs, state.focusedPane, state.titles])

  const reveal = (): void => {
    // the shell listens for this and expands the sidebar if it is collapsed
    window.dispatchEvent(new Event('right-panel:reveal'))
  }

  const dispose = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        const tab = state.tabs.find((t) => t.id === id)
        if (tab) getTabDefinition(tab.kind)?.onClose?.(id)
      }
    },
    [state.tabs]
  )

  const openTab = useCallback(
    (kind: string) => {
      const def = getTabDefinition(kind)
      if (!def) return
      const existing = !def.allowMultiple ? state.tabs.find((t) => t.kind === kind) : undefined
      reveal()
      dispatch({ type: 'open', tab: existing ?? newTab(kind), existing: Boolean(existing) })
    },
    [state.tabs]
  )

  const splitTab = useCallback(
    (kind: string) => {
      const def = getTabDefinition(kind)
      if (!def) return
      const existing = !def.allowMultiple ? state.tabs.find((t) => t.kind === kind) : undefined
      reveal()
      dispatch({ type: 'beside', tab: existing ?? newTab(kind), existing: Boolean(existing) })
    },
    [state.tabs]
  )

  const api = useMemo<RightPanelApi>(
    () => ({
      ...state,
      openTab,
      splitTab,
      moveBeside: (tabId) => {
        const tab = state.tabs.find((t) => t.id === tabId)
        if (tab) dispatch({ type: 'beside', tab, existing: true })
      },
      showTab: (tabId) => dispatch({ type: 'show', tabId }),
      closeTab: (tabId) => {
        dispose([tabId])
        dispatch({ type: 'close', tabIds: [tabId] })
      },
      closeOthers: (tabId) => {
        const others = state.tabs.filter((t) => t.id !== tabId).map((t) => t.id)
        dispose(others)
        dispatch({ type: 'close', tabIds: others })
      },
      setLayout: (layout) => dispatch({ type: 'layout', layout }),
      focusPane: (pane) => dispatch({ type: 'focus', pane }),
      renameTab: (tabId, title) => dispatch({ type: 'rename', tabId, title }),
      setAutoTitle: (tabId, title) => dispatch({ type: 'auto-title', tabId, title }),
      moveTab: (tabId, toIndex) => dispatch({ type: 'move', tabId, toIndex }),
      titleOf: (tab) =>
        state.titles[tab.id] ?? state.autoTitles[tab.id] ?? getTabDefinition(tab.kind)?.title ?? tab.kind
    }),
    [state, openTab, splitTab, dispose]
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRightPanel(): RightPanelApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRightPanel must be used inside <RightPanelProvider>')
  return ctx
}
