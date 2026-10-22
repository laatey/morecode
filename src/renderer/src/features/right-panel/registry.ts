import { Globe, FileText, GitCompare, SquareTerminal, ListTodo, ClipboardList } from 'lucide-react'
import type { TabDefinition } from './types'
import { BrowserTab } from './tabs/browser-tab'
import { DocsTab } from './tabs/docs-tab'
import { DiffTab } from './tabs/diff-tab'
import { TerminalTab } from './tabs/terminal-tab'
import { disposeTerminal } from './terminal/terminal-store'
import { forgetBrowser } from './tabs/browser-state'
import { TaskTab } from './tabs/task-tab'
import { PlanTab } from './tabs/plan-tab'

/**
 * THE place to add a new right-panel tab:
 *   1. create `tabs/my-tab.tsx` exporting a component that takes TabContentProps
 *   2. add one entry below.
 * It then shows up in the "+" menu and the empty state, and `openTab('my-kind')` works anywhere.
 */
export const TAB_DEFINITIONS: TabDefinition[] = [
  {
    kind: 'browser',
    title: 'Browser',
    description: 'Preview your app or open any web page',
    icon: Globe,
    allowMultiple: true,
    component: BrowserTab,
    onClose: forgetBrowser
  },
  {
    kind: 'docs',
    title: 'Docs',
    description: 'Read the notes and guides in your project',
    icon: FileText,
    component: DocsTab
  },
  {
    kind: 'diff',
    title: 'Changes',
    description: 'Review what the AI changed, then keep or undo it',
    icon: GitCompare,
    component: DiffTab
  },
  {
    kind: 'terminal',
    title: 'Terminal',
    description: 'Run commands in your project folder',
    icon: SquareTerminal,
    allowMultiple: true,
    component: TerminalTab,
    onClose: disposeTerminal
  },
  {
    kind: 'task',
    title: 'Tasks',
    description: 'Follow what the AI is working on, step by step',
    icon: ListTodo,
    component: TaskTab
  },
  {
    kind: 'plan',
    title: 'Plan',
    description: 'Look over the approach before anything changes',
    icon: ClipboardList,
    component: PlanTab
  }
]

export const getTabDefinition = (kind: string): TabDefinition | undefined =>
  TAB_DEFINITIONS.find((d) => d.kind === kind)
