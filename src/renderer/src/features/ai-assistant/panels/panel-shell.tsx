import React from 'react'
import type { ChatTotals } from '../use-chat'
import type { PanelId } from '../slash-commands'
import { ContextPanel } from './context-panel'
import { HelpPanel } from './help-panel'
import { ModelPanel } from './model-panel'
import { UsagePanel } from './usage-panel'
import { SkillsPanel } from './skills-panel'

export interface PanelContext {
  model: string
  onModel: (id: string) => void
  totals: ChatTotals
  autoAccept: boolean
  /** Jump from one panel to another (e.g. Context → Usage). */
  openPanel: (panel: PanelId) => void
}

/** Opens the panel a slash command asked for. Add a panel: create it here and add a case. */
export function CommandPanel({
  panel,
  ctx,
  onClose
}: {
  panel: PanelId
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  switch (panel) {
    case 'context':
      return <ContextPanel ctx={ctx} onClose={onClose} />
    case 'usage':
      return <UsagePanel ctx={ctx} onClose={onClose} />
    case 'model':
      return <ModelPanel ctx={ctx} onClose={onClose} />
    case 'skills':
      return <SkillsPanel initialTab="mine" onClose={onClose} />
    case 'commands':
      return <SkillsPanel initialTab="commands" onClose={onClose} />
    case 'help':
      return <HelpPanel onClose={onClose} />
  }
}
