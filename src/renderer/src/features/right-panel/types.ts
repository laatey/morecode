import type { ComponentType } from 'react'
import type { IconComponent } from '@/components/icons'

/** Props every tab body receives. `tabId` is unique per open tab (useful when allowMultiple). */
export interface TabContentProps {
  tabId: string
  kind: string
}

export interface TabDefinition {
  /** Stable key, e.g. 'browser'. Used with openTab(kind). */
  kind: string
  /** Default tab title. */
  title: string
  /** One plain-language line shown on the empty "new tab" page. */
  description: string
  icon: IconComponent
  /** false/undefined: opening it again just focuses the existing tab. */
  allowMultiple?: boolean
  component: ComponentType<TabContentProps>
  /** Runs when a tab of this kind is closed: stop processes, forget saved state. */
  onClose?: (tabId: string) => void
}

export type LayoutId = 'single' | 'columns' | 'rows' | 'grid'

export interface TabInstance {
  id: string
  kind: string
}
