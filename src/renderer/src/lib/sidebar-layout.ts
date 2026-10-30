export type SidebarSide = 'left' | 'right'
export const LEFT_MIN_PX = 220
export const RIGHT_MIN_PX = 180
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

export function sidebarNeedsOverlay(width: number, side: SidebarSide): boolean {
  return width < CENTER_MIN_PX + (side === 'left' ? LEFT_MIN_PX : RIGHT_MIN_PX) + GAP
}
