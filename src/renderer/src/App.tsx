import React, { useEffect, useRef, useState } from 'react'
import { CalendarClock, ChevronDown, Briefcase, CodeXml, FileText, MessagesCircle, Settings } from '@/components/icons'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable'
import { SegmentedSwitch, SegmentedSwitchOption } from './components/segmented-switch'
import { ActionMenu } from './components/action-menu'
import { IconButton } from './components/layout/icon-button'
import { ShareIcon, SidebarLeftIcon, SidebarRightIcon } from './components/layout/icons'
import {
  CENTER_MIN_PX,
  LEFT_MIN_PX,
  RIGHT_MIN_PX,
  useResponsiveSidebars
} from './hooks/use-responsive-sidebars'
import { useShortcut } from './features/settings/shortcuts'
import { SettingsProvider, useSettings, type SettingsTab } from './features/settings/settings-store'
import { SettingsPage } from './features/settings/settings-page'
import { TaskNotifier } from './features/settings/notifications'
import { LeftSidebar } from './features/left-sidebar/left-sidebar'
import { RightPanel } from './features/right-panel/right-panel'
import { getLayout } from './features/right-panel/layouts'
import { RightPanelProvider, useRightPanel } from './features/right-panel/store'
import { AiAssistant } from './features/ai-assistant/ai-assistant'
import { RoutinesPage, RoutineScheduler } from './features/routines/routines-page'
import { RoutinesProvider } from './features/routines/routines-store'
import { AuthProvider, useAuth } from './features/auth/auth-store'
import { AuthFlow } from './features/auth/auth-flow'
import { OnboardingFlow } from './features/onboarding/onboarding-flow'
import { PlanDialog } from './features/billing/plan-dialog'
import { Tour } from './features/tour/tour'
import { ChatProvider } from './features/ai-assistant/chat-context'
import { WorkspaceProvider, useWorkspace } from './features/workspace/workspace-store'
import { InlineRename, WorkspaceDialogs } from './features/workspace/dialogs'
import { useChatMenu, useCopyChat } from './features/workspace/chat-menu'
import { CustomizePage } from './features/customize/customize-page'
import { ConnectorsProvider } from './features/connectors/connectors-store'
import { SkillsProvider } from './features/skills/skills-store'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/tooltip'
import { cn } from './lib/utils'
import { WINDOW_CONTROLS_LEFT_PX, WINDOW_CONTROLS_RIGHT_PX } from './lib/platform'

type Mode = 'chat' | 'code'

type NavStop =
  | { kind: 'chat'; chatId: string }
  | { kind: 'routines' }
  | { kind: 'customize' }
  | { kind: 'settings'; tab: SettingsTab }

const sameStop = (a: NavStop, b: NavStop): boolean => {
  if (a.kind !== b.kind) return false
  if (a.kind === 'chat' && b.kind === 'chat') return a.chatId === b.chatId
  if (a.kind === 'settings' && b.kind === 'settings') return a.tab === b.tab
  return true
}

const MODE_OPTIONS: SegmentedSwitchOption<Mode>[] = [
  { value: 'chat', icon: <MessagesCircle className="w-[15px] h-[15px]" />, title: 'Chat: just the conversation' },
  { value: 'code', icon: <CodeXml className="w-[15px] h-[15px]" />, title: 'Code: conversation with changes, terminal and tools' }
]

/** Left-hand window controls: app menu, sidebar toggle, history arrows, mode switch. */
function NavControls(props: {
  mode: Mode
  onModeChange: (mode: Mode) => void
  onToggleSidebar: () => void
  sidebarTitle: string
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  /** Container-query class that hides the history arrows when space runs out. */
  arrowsClass: string
}): React.JSX.Element {
  const {
    mode,
    onModeChange,
    onToggleSidebar,
    sidebarTitle,
    canBack,
    canForward,
    onBack,
    onForward,
    arrowsClass
  } = props
  return (
    <>
      <div className="flex items-center gap-0.5 shrink-0">
        <IconButton
          title="Menu"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            window.api?.showAppMenu(rect.left, rect.bottom)
          }}
        >
          <i className="codicon codicon-menu text-[16px]" />
        </IconButton>
        <IconButton title={sidebarTitle} onClick={onToggleSidebar}>
          <SidebarLeftIcon />
        </IconButton>
        <IconButton
          title="Back"
          className={cn(arrowsClass, !canBack && 'opacity-30 pointer-events-none')}
          disabled={!canBack}
          onClick={onBack}
        >
          <i className="codicon codicon-arrow-left text-[15px]" />
        </IconButton>
        <IconButton
          title="Forward"
          className={cn(arrowsClass, !canForward && 'opacity-30 pointer-events-none')}
          disabled={!canForward}
          onClick={onForward}
        >
          <i className="codicon codicon-arrow-right text-[15px]" />
        </IconButton>
      </div>
      <SegmentedSwitch
        options={MODE_OPTIONS}
        value={mode}
        onChange={onModeChange}
        itemWidth={32}
        height={26}
      />
    </>
  )
}

/** Document + share buttons shown on the right side of the title bar. */
function RightControls({
  children,
  docClass,
  docActive,
  onDocument,
  onShare
}: {
  children?: React.ReactNode
  docClass?: string
  /** Docs tab is open: show the button in its blue "on" state. */
  docActive?: boolean
  onDocument: () => void
  onShare: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <IconButton
        title="Docs"
        aria-pressed={docActive}
        className={cn(
          docClass,
          docActive && 'bg-[#032042] text-[#5aa6ff] hover:bg-[#032042] hover:text-[#7dbaff]'
        )}
        onClick={onDocument}
      >
        <FileText className="w-[17px] h-[17px] stroke-[1.7]" />
      </IconButton>
      <IconButton title="Copy chat as Markdown" onClick={onShare}>
        <ShareIcon />
      </IconButton>
      {children}
    </div>
  )
}

function AppShell(): React.JSX.Element {
  const {
    leftRef,
    rightRef,
    leftCollapsed,
    rightCollapsed,
    initialWidths,
    onLeftResize,
    onRightResize,
    toggleLeft,
    toggleRight,
    overlay,
    overlayWidth,
    closeOverlay
  } = useResponsiveSidebars()
  useEffect(() => {
    if (!overlay) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeOverlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, closeOverlay])

  // Chat keeps the sidebar focused on chats; Code adds the project file tree there.
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('morecode:mode') === 'code' ? 'code' : 'chat'))
  // which page is open (chat, routines or customize) is remembered too
  const [page, setPage] = useState<'chat' | 'routines' | 'customize'>(() => {
    const v = localStorage.getItem('morecode:page')
    return v === 'routines' || v === 'customize' ? v : 'chat'
  })
  const { open: showSettings, tab: settingsTab, openSettings, closeSettings } = useSettings()
  const showRoutines = !showSettings && page === 'routines'
  const showCustomize = !showSettings && page === 'customize'
  const setShowRoutines = (on: boolean): void => {
    closeSettings()
    setPage(on ? 'routines' : 'chat')
  }
  const setShowCustomize = (on: boolean): void => {
    closeSettings()
    setPage(on ? 'customize' : 'chat')
  }
  const handleModeChange = (nextMode: Mode): void => {
    closeSettings()
    setPage('chat')
    setMode(nextMode)
  }
  useEffect(() => {
    try {
      localStorage.setItem('morecode:page', page)
    } catch {
      // harmless
    }
  }, [page])
  useEffect(() => {
    const open = (e: Event): void => {
      try {
        const detail = (e as CustomEvent<string | { tab?: string; sub?: string }>).detail
        const tab = typeof detail === 'string' ? detail : detail?.tab ?? 'skills'
        localStorage.setItem('morecode:customize-tab', tab)
        if (detail && typeof detail === 'object' && detail.sub) {
          localStorage.setItem('morecode:customize-sub', detail.sub)
        }
      } catch {
        // harmless
      }
      closeSettings()
      setPage('customize')
    }
    window.addEventListener('app:open-customize', open)
    return () => window.removeEventListener('app:open-customize', open)
  }, [closeSettings])
  useEffect(() => {
    try {
      localStorage.setItem('morecode:mode', mode)
    } catch {
      // not being able to remember the choice is harmless
    }
  }, [mode])
  const { account, openProject } = useAuth()
  const ws = useWorkspace()
  const chatMenu = useChatMenu()
  const copyChat = useCopyChat()
  const { active } = ws
  const title = showSettings ? 'Settings' : showRoutines ? 'Routines' : showCustomize ? 'Customize' : active.title
  // A loose chat deliberately has no project context. Never fall back to the last folder opened.
  const group = ws.groups.find((g) => g.id === active.projectId)
  const folder = showSettings || showRoutines || showCustomize ? '' : group?.name ?? ''

  // opening a chat that lives in a linked project switches the working folder with it
  const linked = group?.folder
  const currentPath = account?.project?.path
  useEffect(() => {
    if (linked && linked !== currentPath) {
      void openProject({ name: group?.name ?? linked, path: linked })
    }
    // only when the chat or its project changes, not on every account update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, active.id])

  // Groups created by older versions could be labels with no folder. Upgrade one when opened so
  // commands cannot fall back to the last unrelated project directory.
  useEffect(() => {
    if (!group || linked || !window.api?.workspace?.createProject) return
    void window.api.workspace.createProject(group.name).then((created) => {
      if (!created) return
      ws.linkGroup(group.id, created.root)
      void openProject({ name: group.name, path: created.root })
    })
  }, [group, linked, openProject, ws])

  // A standalone project made by the AI becomes a real sidebar project immediately.
  useEffect(() => {
    const onCreated = (event: Event): void => {
      const detail = (event as CustomEvent<{ name?: string; path?: string }>).detail
      if (!detail?.name || !detail.path) return
      const existing = ws.groups.find((item) => item.folder === detail.path)
      const projectId = existing?.id ?? ws.addGroup(detail.name, detail.path)
      ws.moveTo(ws.active.id, projectId)
      void openProject({ name: detail.name, path: detail.path })
    }
    window.addEventListener('workspace:project-created', onCreated)
    return () => window.removeEventListener('workspace:project-created', onCreated)
  }, [openProject, ws])

  const { openTab, closeTab, tabs, paneTabs, layout } = useRightPanel()

  // the AI asked for a Browser tab and none is open
  const hasBrowserTab = tabs.some((t) => t.kind === 'browser')
  const hasBrowserRef = React.useRef(hasBrowserTab)
  hasBrowserRef.current = hasBrowserTab
  useEffect(
    () =>
      window.api?.browser?.onOpen?.(() => {
        if (!hasBrowserRef.current) openTab('browser')
      }),
    [openTab]
  )
  const visibleTabIds = paneTabs.slice(0, getLayout(layout).panes)
  const rightVisible = !rightCollapsed || overlay === 'right'
  const docsOpen =
    rightVisible && tabs.some((t) => t.kind === 'docs' && visibleTabIds.includes(t.id))
  /** Document button: open or focus Docs; click again while visible to close it. */
  const openDocs = (): void => {
    const visibleDocs = tabs.find((t) => t.kind === 'docs' && visibleTabIds.includes(t.id))
    if (visibleDocs && rightVisible) closeTab(visibleDocs.id)
    else openTab('docs')
  }

  // opening any tab (from a button, a menu or a chat message) expands the sidebar if needed
  const reveal = useRef({ collapsed: !rightVisible, toggle: toggleRight })
  useEffect(() => {
    reveal.current = { collapsed: !rightVisible, toggle: toggleRight }
  })
  // Collapse only when the user closes the last tab. An empty panel can still be
  // opened manually so people can reach its tab controls and empty states.
  const previousTabCount = useRef(tabs.length)
  useEffect(() => {
    if (previousTabCount.current > 0 && tabs.length === 0 && !rightCollapsed) toggleRight()
    previousTabCount.current = tabs.length
  }, [tabs.length, rightCollapsed, toggleRight])
  useEffect(() => {
    const onReveal = (): void => {
      if (reveal.current.collapsed) reveal.current.toggle()
    }
    window.addEventListener('right-panel:reveal', onReveal)
    return () => window.removeEventListener('right-panel:reveal', onReveal)
  }, [])

  useShortcut('toggle-sidebar', toggleLeft)
  useShortcut('toggle-panel', toggleRight)
  useShortcut('palette', () => ws.setSearchOpen(true))
  useShortcut('new-chat', () => ws.newChat())
  useShortcut('settings', () => openSettings('general'))
  useShortcut('shortcuts', () => openSettings('shortcuts'))
  useShortcut('open-terminal', () => openTab('terminal'))
  useShortcut('open-changes', () => openTab('diff'))
  useShortcut('open-docs', () => openTab('docs'))

  // the command palette asks for layout changes by name
  const layoutRef = useRef({ toggleLeft, toggleRight })
  useEffect(() => {
    layoutRef.current = { toggleLeft, toggleRight }
  })
  useEffect(() => {
    const onLayout = (e: Event): void => {
      const side = (e as CustomEvent<'left' | 'right'>).detail
      if (side === 'left') layoutRef.current.toggleLeft()
      else layoutRef.current.toggleRight()
    }
    window.addEventListener('app:layout', onLayout)
    return () => window.removeEventListener('app:layout', onLayout)
  }, [])

  const currentStop: NavStop = showSettings
    ? { kind: 'settings', tab: settingsTab }
    : page === 'routines'
      ? { kind: 'routines' }
      : page === 'customize'
        ? { kind: 'customize' }
        : { kind: 'chat', chatId: active.id }

  const [history, setHistory] = useState<{ list: NavStop[]; index: number }>(() =>
    currentStop.kind === 'chat'
      ? { list: [currentStop], index: 0 }
      : { list: [{ kind: 'chat', chatId: active.id }, currentStop], index: 1 }
  )

  const isValidStop = (s: NavStop): boolean =>
    s.kind !== 'chat' || ws.chats.some((c) => c.id === s.chatId && !c.archived)

  const activeAtIndex = history.list[history.index]
  if (!activeAtIndex || !sameStop(activeAtIndex, currentStop)) {
    const validPrefix = history.list.slice(0, history.index + 1).filter(isValidStop)
    const deduped = validPrefix.filter((s, idx) => idx === 0 || !sameStop(s, validPrefix[idx - 1]))
    const last = deduped[deduped.length - 1]
    const nextList = (last && sameStop(last, currentStop) ? deduped : [...deduped, currentStop]).slice(-50)
    setHistory({ list: nextList, index: nextList.length - 1 })
  }

  const findTargetIndex = (dir: -1 | 1): number => {
    let i = history.index + dir
    while (i >= 0 && i < history.list.length) {
      const candidate = history.list[i]
      if (isValidStop(candidate) && !sameStop(candidate, currentStop)) return i
      i += dir
    }
    return -1
  }

  const backIndex = findTargetIndex(-1)
  const forwardIndex = findTargetIndex(1)

  const goHistory = (targetIndex: number): void => {
    if (targetIndex < 0 || targetIndex >= history.list.length) return
    const target = history.list[targetIndex]
    setHistory((h) => ({ ...h, index: targetIndex }))
    if (target.kind === 'settings') {
      openSettings(target.tab)
    } else if (target.kind === 'routines') {
      closeSettings()
      setPage('routines')
    } else if (target.kind === 'customize') {
      closeSettings()
      setPage('customize')
    } else {
      closeSettings()
      setPage('chat')
      ws.select(target.chatId)
    }
  }

  const nav = {
    canBack: backIndex !== -1,
    canForward: forwardIndex !== -1,
    onBack: () => goHistory(backIndex),
    onForward: () => goHistory(forwardIndex)
  }
  const share = (): void => copyChat(active)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      <RoutineScheduler />
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        {/* Left sidebar */}
        <ResizablePanel
          id="sidebar-left"
          panelRef={leftRef}
          defaultSize={leftCollapsed ? 0 : initialWidths.left}
          minSize={LEFT_MIN_PX}
          maxSize="45%"
          groupResizeBehavior="preserve-pixel-size"
          collapsible
          collapsedSize={0}
          onResize={(size) => onLeftResize(size.inPixels)}
          className="bg-background h-full flex flex-col"
        >
          <div
            className="app-drag @container h-[38px] w-full flex items-center justify-between px-2 shrink-0 min-w-0 overflow-hidden"
            style={{ paddingLeft: WINDOW_CONTROLS_LEFT_PX || undefined }}
          >
            <NavControls
              mode={mode}
              onModeChange={handleModeChange}
              onToggleSidebar={toggleLeft}
              sidebarTitle="Collapse sidebar"
              {...nav}
              arrowsClass="@max-[200px]:hidden"
            />
          </div>
          <LeftSidebar
            mode={mode}
            routinesActive={showRoutines}
            customizeActive={showCustomize}
            settingsActive={showSettings}
            onOpenRoutines={() => setShowRoutines(true)}
            onOpenCustomize={() => setShowCustomize(true)}
            onOpenChat={() => {
              closeSettings()
              setShowRoutines(false)
              setMode('chat')
            }}
          />
        </ResizablePanel>

        <ResizableHandle onToggle={toggleLeft} disabled={leftCollapsed} />

        {/* Centre: chat / workspace */}
        <ResizablePanel
          id="chat-area"
          minSize={CENTER_MIN_PX}
          className="bg-background h-full flex flex-col min-w-0"
        >
          <div
            className="app-drag @container h-[38px] w-full flex items-center justify-between gap-2 px-3 shrink-0 min-w-0 overflow-hidden"
            style={{
              paddingRight: rightCollapsed ? WINDOW_CONTROLS_RIGHT_PX || undefined : undefined,
              paddingLeft: leftCollapsed ? WINDOW_CONTROLS_LEFT_PX || undefined : undefined
            }}
          >
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
              {leftCollapsed && (
                <div className="flex items-center gap-1 shrink-0">
                  <NavControls
                    mode={mode}
                    onModeChange={handleModeChange}
                    onToggleSidebar={toggleLeft}
                    sidebarTitle="Expand sidebar"
                    {...nav}
                    arrowsClass="@max-[480px]:hidden"
                  />
                  <span className="h-3.5 w-px bg-white/[0.08] mx-1 shrink-0" />
                </div>
              )}

              <div className="flex items-center gap-1 min-w-0">
                {folder && (
                  <>
                    {group || !account ? (
                      <span className="app-no-drag @max-[380px]:hidden px-1.5 py-0.5 text-[13.5px] text-muted-foreground truncate max-w-[160px] tracking-tight min-w-0">
                        {folder}
                      </span>
                    ) : (
                      <ActionMenu
                        align="start"
                        items={[
                          ...account.recents.map((r) => ({
                            id: `${r.name}|${r.path}`,
                            label: r.name,
                            checked:
                              r.name === account.project?.name && r.path === account.project?.path,
                            onClick: () => void openProject(r)
                          })),
                          ...(window.api?.workspace
                            ? [
                                {
                                  id: 'open',
                                  label: 'Open another folder…',
                                  onClick: () => {
                                    void window.api.workspace.choose().then((w) => {
                                      if (w) void openProject({ name: w.name, path: w.root })
                                    })
                                  }
                                }
                              ]
                            : [])
                        ]}
                        trigger={
                          <button
                            type="button"
                            title="Switch project folder"
                            className="app-no-drag @max-[380px]:hidden px-1.5 py-0.5 rounded text-[13.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors truncate max-w-[160px] tracking-tight cursor-pointer focus:outline-none min-w-0"
                          >
                            {folder}
                          </button>
                        }
                      />
                    )}
                    <span className="@max-[380px]:hidden text-muted-foreground/40 text-[13px] shrink-0 font-light">
                      /
                    </span>
                  </>
                )}
                {showSettings ? (
                  <div className="flex items-center gap-2 px-1.5 text-[13.5px] font-medium text-[#e2e2e0]">
                    <Settings className="h-3.5 w-3.5 text-white" /> Settings
                  </div>
                ) : showRoutines ? (
                  <div className="flex items-center gap-2 px-1.5 text-[13.5px] font-medium text-[#e2e2e0]">
                    <CalendarClock className="h-3.5 w-3.5 text-white" /> Routines
                  </div>
                ) : showCustomize ? (
                  <div className="flex items-center gap-2 px-1.5 text-[13.5px] font-medium text-[#e2e2e0]">
                    <Briefcase className="h-3.5 w-3.5 text-white" /> Customize
                  </div>
                ) : <div className="flex items-center gap-0.5 min-w-0">
                  {ws.renamingId === active.id ? (
                    <InlineRename
                      value={title}
                      onSave={(v) => ws.rename(active.id, v)}
                      onCancel={() => ws.startRename(null)}
                      className="app-no-drag h-6 w-[260px] max-w-full text-[13.5px] font-medium"
                    />
                  ) : (
                    <button
                      type="button"
                      onDoubleClick={() => ws.startRename(active.id)}
                      className="app-no-drag px-1.5 py-0.5 rounded text-[13.5px] font-medium text-[#e2e2e0] hover:text-white hover:bg-white/[0.04] transition-colors truncate max-w-[320px] tracking-tight cursor-default focus:outline-none min-w-0"
                    >
                      {title}
                    </button>
                  )}
                  <ActionMenu
                    align="start"
                    sideOffset={5}
                    trigger={(isOpen) => (
                      <button
                        type="button"
                        title="More options"
                        className={cn(
                          'app-no-drag w-[20px] h-[20px] rounded-[5px] text-muted-foreground/75 hover:text-foreground hover:bg-white/[0.06] transition-colors flex items-center justify-center cursor-pointer focus:outline-none shrink-0',
                          isOpen && 'bg-white/[0.08] text-foreground'
                        )}
                      >
                        <ChevronDown className="w-[13px] h-[13px] stroke-[2]" />
                      </button>
                    )}
                    items={chatMenu(active)}
                  />
                </div>}
              </div>
            </div>

            {rightCollapsed && (
              <RightControls
                onShare={share}
                docClass="@max-[520px]:hidden"
                docActive={docsOpen}
                onDocument={openDocs}
              >
                <IconButton title="Expand secondary sidebar" onClick={toggleRight}>
                  <SidebarRightIcon />
                </IconButton>
              </RightControls>
            )}
          </div>
          <div className="flex-1 min-h-0 relative flex flex-col">
            {showSettings ? (
              <SettingsPage onBack={() => { closeSettings(); setShowRoutines(false); setMode('chat') }} />
            ) : showCustomize ? (
              <CustomizePage />
            ) : showRoutines ? (
              <RoutinesPage onBack={() => { setShowRoutines(false); setMode('chat') }} />
            ) : (
              <AiAssistant />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle onToggle={toggleRight} disabled={rightCollapsed} />

        {/* Right sidebar */}
        <ResizablePanel
          id="sidebar-right"
          panelRef={rightRef}
          defaultSize={rightCollapsed ? 0 : initialWidths.right}
          minSize={RIGHT_MIN_PX}
          maxSize="55%"
          groupResizeBehavior="preserve-pixel-size"
          collapsible
          collapsedSize={0}
          onResize={(size) => onRightResize(size.inPixels)}
          className="bg-background h-full flex flex-col"
        >
          <div
            className="app-drag h-[38px] w-full flex items-center justify-end px-2 shrink-0 overflow-hidden"
            style={{ paddingRight: WINDOW_CONTROLS_RIGHT_PX || undefined }}
          >
            <RightControls docActive={docsOpen} onDocument={openDocs} onShare={share}>
              <IconButton title="Collapse secondary sidebar" onClick={toggleRight}>
                <SidebarRightIcon />
              </IconButton>
            </RightControls>
          </div>
          {rightCollapsed && overlay === 'right' ? null : <RightPanel />}
        </ResizablePanel>
      </ResizablePanelGroup>
      {overlay && (
        <div className="fixed inset-0 z-40 flex" role="presentation">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={closeOverlay}
            className="absolute inset-0 cursor-default bg-black/45 animate-in fade-in-0"
          />
          <aside
            aria-label={overlay === 'left' ? 'Sidebar' : 'Secondary sidebar'}
            className={cn(
              'relative flex h-full max-w-[calc(100vw-48px)] flex-col border-white/[0.08] bg-background shadow-[0_0_60px_rgba(0,0,0,0.5)] animate-in duration-150',
              overlay === 'left' ? 'border-r slide-in-from-left-4' : 'ml-auto border-l slide-in-from-right-4'
            )}
            style={{ width: overlayWidth }}
          >
            {overlay === 'left' ? (
              <div
                className="app-drag @container h-[38px] w-full flex items-center justify-between px-2 shrink-0 min-w-0 overflow-hidden"
                style={{ paddingLeft: WINDOW_CONTROLS_LEFT_PX || undefined }}
              >
                <NavControls
                  mode={mode}
                  onModeChange={(m) => { handleModeChange(m); closeOverlay() }}
                  onToggleSidebar={closeOverlay}
                  sidebarTitle="Close sidebar"
                  {...nav}
                  arrowsClass="@max-[200px]:hidden"
                />
              </div>
            ) : (
              <div
                className="app-drag h-[38px] w-full flex items-center justify-end px-2 shrink-0 overflow-hidden"
                style={{ paddingRight: WINDOW_CONTROLS_RIGHT_PX || undefined }}
              >
                <RightControls docActive={docsOpen} onDocument={openDocs} onShare={share}>
                  <IconButton title="Close secondary sidebar" onClick={closeOverlay}>
                    <SidebarRightIcon />
                  </IconButton>
                </RightControls>
              </div>
            )}
            {overlay === 'left' ? (
              <LeftSidebar
                mode={mode}
                routinesActive={showRoutines}
                customizeActive={showCustomize}
                settingsActive={showSettings}
                onOpenRoutines={() => { setShowRoutines(true); closeOverlay() }}
                onOpenCustomize={() => { setShowCustomize(true); closeOverlay() }}
                onOpenChat={() => {
                  closeSettings()
                  setShowRoutines(false)
                  setMode('chat')
                  closeOverlay()
                }}
              />
            ) : (
              <RightPanel />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

/** Starts the tour once for a new account, shortly after the app appears. */
function TourAutoStart(): null {
  const { account, startTour } = useAuth()
  const seen = account?.tourSeen ?? true
  useEffect(() => {
    if (seen) return
    const t = setTimeout(startTour, 700)
    return () => clearTimeout(t)
  }, [seen, startTour])
  return null
}

/** The open chat. Switching chats swaps its messages; the layout and open side tabs stay put. */
function OpenChat(): React.JSX.Element {
  const { activeId } = useWorkspace()
  return (
    <SkillsProvider>
    <ConnectorsProvider>
    <RightPanelProvider>
    <RoutinesProvider>
      <ChatProvider chatId={activeId}>
        <AppShell />
        <WorkspaceDialogs />
        <TaskNotifier />
        <TourAutoStart />
        <Tour />
        <PlanDialog />
      </ChatProvider>
    </RoutinesProvider>
    </RightPanelProvider>
    </ConnectorsProvider>
    </SkillsProvider>
  )
}

/** Decides what to show: sign-in, first-run setup, or the app itself. */
function Gate(): React.JSX.Element {
  const { status, account } = useAuth()
  if (status === 'loading') return <div className="h-screen w-screen bg-background" />
  if (!account) return <AuthFlow />
  if (!account.onboarded) return <OnboardingFlow />
  return (
    <WorkspaceProvider key={account.id}>
      <OpenChat />
    </WorkspaceProvider>
  )
}

export default function App(): React.JSX.Element {
  return (
    <TooltipProvider>
      <SettingsProvider>
        <AuthProvider>
          <Gate />
          <Toaster position="top-center" />
        </AuthProvider>
      </SettingsProvider>
    </TooltipProvider>
  )
}
