export type SidebarSide = 'left' | 'right'
/** Wide enough for the title bar's controls plus the chat/code switch with some air beside the divider. */
export const LEFT_MIN_PX = 240
export const RIGHT_MIN_PX = 320
export const CENTER_MIN_PX = 440
export const LEFT_DEFAULT_PX = 260
export const RIGHT_DEFAULT_PX = 360
const GAP = 12

/** The most recently requested panel gets the space; very tight windows use an overlay. */
export function sidebarLayout(
  width: number,
  closed: Record<SidebarSide, boolean>,
  preferred: Record<SidebarSide, number>,
  priority: SidebarSide
) {
  const size = { left: 0, right: 0 }
  let room = Math.max(0, width - CENTER_MIN_PX - GAP)
  const order: SidebarSide[] = priority === 'left' ? ['left', 'right'] : ['right', 'left']
  for (const side of order) {
    const min = side === 'left' ? LEFT_MIN_PX : RIGHT_MIN_PX
    if (closed[side] || room < min) continue
    size[side] = Math.min(
      Math.max(min, preferred[side]),
      room,
      width * (side === 'left' ? 0.45 : 0.55)
    )
    room -= size[side] + GAP
  }
  return size
}

/** The three layouts people can pick, plus the chat on its own (both sidebars closed). */
export type LayoutId = 'full' | 'chat-secondary' | 'chat-primary'
export type LayoutState = LayoutId | 'chat'

export const layoutOf = (leftOpen: boolean, rightOpen: boolean): LayoutState =>
  leftOpen && rightOpen ? 'full' : rightOpen ? 'chat-secondary' : leftOpen ? 'chat-primary' : 'chat'

export const layoutSides = (layout: LayoutId): { left: boolean; right: boolean } => ({
  left: layout !== 'chat-secondary',
  right: layout !== 'chat-primary'
})

const SEPARATOR_PX = 1

/** The narrowest the window's content can be while the chat and every open sidebar keep their minimum widths. */
export const minContentWidth = (left: boolean, right: boolean): number =>
  CENTER_MIN_PX + (left ? LEFT_MIN_PX + SEPARATOR_PX : 0) + (right ? RIGHT_MIN_PX + SEPARATOR_PX : 0)

/**
 * The width a layout needs to dock without squeezing anything: the chat at its minimum, the right sidebar at
 * its minimum (it narrows first), and the left sidebar at the width it has now, never below its minimum.
 */
export const widthToDock = (left: boolean, right: boolean, leftPx: number): number =>
  CENTER_MIN_PX + (left ? Math.max(LEFT_MIN_PX, leftPx) + SEPARATOR_PX : 0) + (right ? RIGHT_MIN_PX + SEPARATOR_PX : 0)

export function sidebarNeedsOverlay(width: number, side: SidebarSide): boolean {
  return width < CENTER_MIN_PX + (side === 'left' ? LEFT_MIN_PX : RIGHT_MIN_PX) + GAP
}
