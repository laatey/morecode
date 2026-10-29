import React from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { getTabDefinition, TAB_DEFINITIONS } from './registry'
import { ErrorBoundary } from '@/components/error-boundary'
import { getLayout } from './layouts'
import { useRightPanel } from './store'

/** Shown in a pane that has no tab, and when nothing is open. Doubles as a "new tab" page. */
function EmptyPane(): React.JSX.Element {
  const { openTab } = useRightPanel()
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-[340px]">
        <h2 className="mb-1 text-[13px] font-medium text-[#ececea]">Open a tool</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Pick something to work with here.</p>
        <div className="space-y-1.5">
          {TAB_DEFINITIONS.map((d) => (
            <button
              key={d.kind}
              type="button"
              onClick={() => openTab(d.kind)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[8px] border border-white/[0.08] px-3 py-2 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] bg-white/[0.06] text-[#c9c9c6]">
                <d.icon className="h-3.5 w-3.5 stroke-[1.7]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] text-[#ececea]">{d.title}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {d.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pane({ index }: { index: number }): React.JSX.Element {
  const { tabs, paneTabs, focusedPane, focusPane, layout } = useRightPanel()
  const tab = tabs.find((t) => t.id === paneTabs[index])
  const def = tab ? getTabDefinition(tab.kind) : undefined
  const multi = getLayout(layout).panes > 1
  const focused = multi && focusedPane === index

  return (
    <div
      onMouseDownCapture={() => focusPane(index)}
      className={cn(
        'relative h-full w-full min-h-0 min-w-0 overflow-auto bg-background',
        // thin accent line on the focused pane (only when there is more than one)
        focused &&
          'after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-[#3b82f6]'
      )}
    >
      {tab && def ? (
        <ErrorBoundary resetKey={tab.id} label={def.title ?? 'This tab'}>
          <def.component tabId={tab.id} kind={tab.kind} />
        </ErrorBoundary>
      ) : (
        <EmptyPane />
      )}
    </div>
  )
}

const MIN = '15%'

/** Renders the chosen layout. To add a layout: add it to layouts.ts and a case here. */
export function PaneLayout(): React.JSX.Element {
  const { layout } = useRightPanel()

  switch (layout) {
    case 'columns':
      return (
        <ResizablePanelGroup orientation="horizontal" id="rp-columns" className="min-h-0 flex-1">
          <ResizablePanel id="rp-c0" minSize={MIN}>
            <Pane index={0} />
          </ResizablePanel>
          <ResizableHandle withHandle={false} />
          <ResizablePanel id="rp-c1" minSize={MIN}>
            <Pane index={1} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    case 'rows':
      return (
        <ResizablePanelGroup orientation="vertical" id="rp-rows" className="min-h-0 flex-1">
          <ResizablePanel id="rp-r0" minSize={MIN}>
            <Pane index={0} />
          </ResizablePanel>
          <ResizableHandle direction="vertical" withHandle={false} />
          <ResizablePanel id="rp-r1" minSize={MIN}>
            <Pane index={1} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    case 'grid':
      return (
        <ResizablePanelGroup orientation="vertical" id="rp-grid" className="min-h-0 flex-1">
          <ResizablePanel id="rp-g-top" minSize={MIN}>
            <ResizablePanelGroup orientation="horizontal" id="rp-grid-top">
              <ResizablePanel id="rp-g0" minSize={MIN}>
                <Pane index={0} />
              </ResizablePanel>
              <ResizableHandle withHandle={false} />
              <ResizablePanel id="rp-g1" minSize={MIN}>
                <Pane index={1} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle direction="vertical" withHandle={false} />
          <ResizablePanel id="rp-g-bottom" minSize={MIN}>
            <ResizablePanelGroup orientation="horizontal" id="rp-grid-bottom">
              <ResizablePanel id="rp-g2" minSize={MIN}>
                <Pane index={2} />
              </ResizablePanel>
              <ResizableHandle withHandle={false} />
              <ResizablePanel id="rp-g3" minSize={MIN}>
                <Pane index={3} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    default:
      return (
        <div className="min-h-0 flex-1">
          <Pane index={0} />
        </div>
      )
  }
}
