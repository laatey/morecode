import { Columns2, Grid2x2, Rows2, Square, type LucideIcon } from 'lucide-react'
import type { LayoutId } from './types'

export interface LayoutDefinition {
  id: LayoutId
  label: string
  icon: LucideIcon
  /** How many panes (tab viewports) this layout shows. */
  panes: number
}

/** Add a layout here, then render it in pane-layout.tsx. */
export const LAYOUTS: LayoutDefinition[] = [
  { id: 'single', label: 'Single', icon: Square, panes: 1 },
  { id: 'columns', label: 'Side by side', icon: Columns2, panes: 2 },
  { id: 'rows', label: 'Stacked', icon: Rows2, panes: 2 },
  { id: 'grid', label: 'Grid', icon: Grid2x2, panes: 4 }
]

export const MAX_PANES = Math.max(...LAYOUTS.map((l) => l.panes))
export const getLayout = (id: LayoutId): LayoutDefinition =>
  LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
