import React from 'react'
import { PaneLayout } from './pane-layout'
import { TabStrip } from './tab-strip'

/** Body of the right sidebar (below the title-bar row): tab strip + chosen layout. */
export function RightPanel(): React.JSX.Element {
  return (
    <div data-tour="right-panel" className="flex min-h-0 flex-1 flex-col">
      <TabStrip />
      <PaneLayout />
    </div>
  )
}
