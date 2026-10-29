import { useCallback, useEffect, useRef, useState } from 'react'
import { usePanelRef } from 'react-resizable-panels'

/** Window widths (px) below which each sidebar is auto-collapsed. Right goes first. */
export const LEFT_MIN_WINDOW = 540
export const RIGHT_MIN_WINDOW = 760

export const LEFT_MIN_PX = 220
export const RIGHT_MIN_PX = 180
export const CENTER_MIN_PX = 250
export const LEFT_DEFAULT_PX = 260
export const RIGHT_DEFAULT_PX = 240

type Side = 'left' | 'right'

const STORAGE_KEY = 'morecode:sidebar-widths'
const DEFAULTS: Record<Side, number> = { left: LEFT_DEFAULT_PX, right: RIGHT_DEFAULT_PX }
const MINS: Record<Side, number> = { left: LEFT_MIN_PX, right: RIGHT_MIN_PX }

const COLLAPSED_KEY = 'morecode:sidebar-collapsed'

/** Which sidebars the person left closed. The secondary one starts closed until they open it. */
function loadCollapsed(): Record<Side, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')
    return { left: raw.left === true, right: raw.right !== false }
  } catch {
    return { left: false, right: true }
  }
}

function loadWidths(): Record<Side, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return {
      left: Math.max(LEFT_MIN_PX, Number(raw.left) || DEFAULTS.left),
      right: Math.max(RIGHT_MIN_PX, Number(raw.right) || DEFAULTS.right)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Owns sidebar collapse behaviour. Sidebar widths are tracked in PIXELS (the panels use
 * `preserve-pixel-size`), so resizing the window never rescales a sidebar and re-opening
 * one always restores the exact width the user last chose.
 *
 * - A sidebar the user collapses stays collapsed.
 * - A sidebar auto-collapsed because the window is too narrow comes back, at its
 *   remembered width, once the window is wide enough again (either resize direction).
 * - Thresholds are evaluated on mount and on every resize.
 * - Opening a sidebar in a tight window makes the other one yield.
 */
export function useResponsiveSidebars(): {
  leftRef: ReturnType<typeof usePanelRef>
  rightRef: ReturnType<typeof usePanelRef>
  initialWidths: Record<Side, number>
  leftCollapsed: boolean
  rightCollapsed: boolean
  onLeftResize: (px: number) => void
  onRightResize: (px: number) => void
  toggleLeft: () => void
  toggleRight: () => void
} {
  const leftRef = usePanelRef()
  const rightRef = usePanelRef()
  const [initialWidths] = useState(loadWidths)
  const [saved] = useState(loadCollapsed)
  const [leftCollapsed, setLeftCollapsed] = useState(saved.left)
  // The secondary sidebar has no useful empty state, so it starts closed the first time; after that it
  // comes back the way the person left it.
  const [rightCollapsed, setRightCollapsed] = useState(saved.right)
  const pref = useRef<Record<Side, boolean>>({ ...saved })
  // ignore the sizes the panels report while they are first laid out
  const ready = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => (ready.current = true), 700)
    return () => clearTimeout(t)
  }, [])
  const remember = useCallback((side: Side, closed: boolean) => {
    if (pref.current[side] === closed) return
    pref.current[side] = closed
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(pref.current))
    } catch {
      // best effort
    }
  }, [])

  const widths = useRef<Record<Side, number>>({ ...initialWidths })
  const auto = useRef<Record<Side, boolean>>({ left: false, right: false })
  // true while we are programmatically collapsing/expanding, so onResize doesn't record it
  const busy = useRef(false)

  const refFor = useCallback((s: Side) => (s === 'left' ? leftRef : rightRef), [leftRef, rightRef])

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths.current))
    } catch {
      // best effort
    }
  }, [])

  const setCollapsed = useCallback(
    (side: Side, collapse: boolean, byAuto: boolean) => {
      const panel = refFor(side).current
      if (!panel) return
      busy.current = true
      auto.current[side] = collapse && byAuto // before the resize event it causes, so it is not taken for the person's choice
      if (collapse && !panel.isCollapsed()) panel.collapse()
      if (!collapse && panel.isCollapsed()) {
        panel.expand()
        panel.resize(widths.current[side]) // exact remembered width, not the library's guess
      }
      busy.current = false
      if (!byAuto) remember(side, collapse)
    },
    [refFor, remember]
  )

  const reconcile = useCallback(() => {
    const width = window.innerWidth
    const fits: Record<Side, boolean> = {
      left: width >= LEFT_MIN_WINDOW,
      right: width >= RIGHT_MIN_WINDOW
    }
    ;(['right', 'left'] as const).forEach((side) => {
      const panel = refFor(side).current
      if (!panel) return
      if (!fits[side] && !panel.isCollapsed()) setCollapsed(side, true, true)
      else if (fits[side] && auto.current[side] && panel.isCollapsed())
        setCollapsed(side, false, false)
    })
  }, [refFor, setCollapsed])

  useEffect(() => {
    reconcile()
    window.addEventListener('resize', reconcile)
    return () => window.removeEventListener('resize', reconcile)
  }, [reconcile])

  const toggle = useCallback(
    (side: Side) => {
      const panel = refFor(side).current
      if (!panel) return
      const opening = panel.isCollapsed()
      setCollapsed(side, !opening, false)

      if (opening && window.innerWidth < LEFT_MIN_PX + CENTER_MIN_PX + RIGHT_MIN_PX) {
        const other: Side = side === 'left' ? 'right' : 'left'
        const otherPanel = refFor(other).current
        if (otherPanel && !otherPanel.isCollapsed()) setCollapsed(other, true, true)
      }
    },
    [refFor, setCollapsed]
  )

  const onResize = useCallback(
    (side: Side, px: number) => {
      const collapsed = px < 1
      if (side === 'left') setLeftCollapsed(collapsed)
      else setRightCollapsed(collapsed)
      if (ready.current && !busy.current && !auto.current[side]) remember(side, collapsed)
      if (collapsed) return
      auto.current[side] = false // gained width by any route => no longer "auto" collapsed
      // Remember widths only when they are a real, unconstrained size.
      if (!busy.current && px >= MINS[side]) {
        widths.current[side] = Math.round(px)
        persist()
      }
    },
    [persist, remember]
  )

  return {
    leftRef,
    rightRef,
    initialWidths,
    leftCollapsed,
    rightCollapsed,
    onLeftResize: (px) => onResize('left', px),
    onRightResize: (px) => onResize('right', px),
    toggleLeft: () => toggle('left'),
    toggleRight: () => toggle('right')
  }
}
