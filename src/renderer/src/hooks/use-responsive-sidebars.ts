import { useCallback, useEffect, useRef, useState } from 'react'
import { usePanelRef } from 'react-resizable-panels'

/**
 * The chat has a minimum width (CENTER_MIN_PX), so the sidebars give way to it rather than squeezing it:
 * the right sidebar is narrowed first, then closed; after that the left one closes. Everything comes
 * back, at the width the person chose, when there is room again.
 */

import {
  CENTER_MIN_PX,
  LEFT_DEFAULT_PX,
  LEFT_MIN_PX,
  RIGHT_DEFAULT_PX,
  RIGHT_MIN_PX,
  layoutOf,
  layoutSides,
  minContentWidth,
  sidebarNeedsOverlay,
  widthToDock,
  type LayoutId,
  type LayoutState
} from '@/lib/sidebar-layout'

export { CENTER_MIN_PX, LEFT_DEFAULT_PX, LEFT_MIN_PX, RIGHT_DEFAULT_PX, RIGHT_MIN_PX }

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

/** Resolves once the page itself is `target` px wide (the window can finish resizing before the page hears of it). */
function widthReaches(target: number, timeoutMs = 700): Promise<void> {
  return new Promise((resolve) => {
    if (window.innerWidth >= target - 1) {
      resolve()
      return
    }
    const check = (): void => {
      if (window.innerWidth >= target - 1) done()
    }
    const timer = setTimeout(() => done(), timeoutMs)
    function done(): void {
      window.removeEventListener('resize', check)
      clearTimeout(timer)
      resolve()
    }
    window.addEventListener('resize', check)
  })
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
 * - Opening a sidebar when both will not fit floats the new one over the chat; the open one is left alone.
 *   Only the layout switcher ever widens the window.
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
  /** A sidebar the person asked for that cannot dock in this window, shown floating over the chat instead. */
  overlay: Side | null
  /** Width the sidebar last had while docked, so the floating copy matches it. */
  overlayWidth: number
  closeOverlay: () => void
  /** What is on screen right now, for the layout switcher's icon. */
  layout: LayoutState
  setLayout: (layout: LayoutId) => void
  /** True for a moment after a layout change, so the panels glide instead of jumping. */
  animating: boolean
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
  const [settled, setSettled] = useState(false)
  const [animating, setAnimating] = useState(false)
  const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [overlay, setOverlayState] = useState<Side | null>(null)
  const overlayRef = useRef<Side | null>(null)
  const setOverlay = useCallback((side: Side | null) => {
    overlayRef.current = side
    setOverlayState(side)
  }, [])
  // ignore the sizes the panels report while they are first laid out
  const ready = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => {
      ready.current = true
      setSettled(true)
    }, 700)
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
  // timestamp until which onResize should ignore programmatic panel layout changes
  const busyUntil = useRef(0)
  // true while the layout switcher is resizing the window: nothing may collapse or re-open a sidebar meanwhile
  const layoutBusy = useRef(false)
  const prevWin = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    screenX: typeof window !== 'undefined' ? window.screenX : 0
  })

  const markBusy = useCallback(() => {
    busyUntil.current = performance.now() + 90
  }, [])

  const dockWidth = useCallback((left: boolean, right: boolean) => widthToDock(left, right, widths.current.left), [])

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
      markBusy()
      auto.current[side] = collapse && byAuto // before the resize event it causes, so it is not taken for the person's choice
      if (collapse && !panel.isCollapsed()) panel.collapse()
      if (!collapse && panel.isCollapsed()) {
        panel.expand()
        panel.resize(widths.current[side]) // exact remembered width, not the library's guess
      }
      if (!byAuto) remember(side, collapse)
    },
    [refFor, remember, markBusy]
  )

  const reconcile = useCallback(() => {
    const width = window.innerWidth
    const screenX = window.screenX
    const deltaW = width - prevWin.current.width
    const deltaX = Math.abs(screenX - prevWin.current.screenX)
    prevWin.current = { width, screenX }
    if (layoutBusy.current) return

    const left = leftRef.current
    const right = rightRef.current

    // 0. a floating sidebar docks again once the window has room for it beside the chat and the other
    // sidebar. It never pushes the other one away: it stays floating until both fit.
    const floating = overlayRef.current
    if (floating) {
      const other: Side = floating === 'left' ? 'right' : 'left'
      const otherPanel = refFor(other).current
      const otherDocked = Boolean(otherPanel && !otherPanel.isCollapsed())
      const bothFit = width >= dockWidth(true, true)
      if (!sidebarNeedsOverlay(width, floating) && (!otherDocked || bothFit)) {
        setOverlay(null)
        setCollapsed(floating, false, false)
      }
    }

    // 1. left sidebar: it needs its own width plus the chat's minimum
    if (left) {
      const fitsLeft = width >= LEFT_MIN_PX + CENTER_MIN_PX
      if (!fitsLeft && !left.isCollapsed()) setCollapsed('left', true, true)
      else if (fitsLeft && auto.current.left && left.isCollapsed())
        setCollapsed('left', false, false)
    }

    // 2. right sidebar: whatever is left after the left sidebar and the chat's minimum
    if (right) {
      const leftPx = left && !left.isCollapsed() ? left.getSize().inPixels : 0
      const room = width - leftPx - CENTER_MIN_PX
      if (room < RIGHT_MIN_PX) {
        if (!right.isCollapsed()) setCollapsed('right', true, true)
      } else {
        if (auto.current.right && right.isCollapsed()) setCollapsed('right', false, false)
        const currentRightPx = right.getSize().inPixels
        const resizedFromRightEdge = deltaW !== 0 && deltaX <= 4

        if (!right.isCollapsed() && resizedFromRightEdge) {
          // Resizing the window from its right edge directly grows/shrinks the open right panel
          const maxRight = Math.max(RIGHT_MIN_PX, Math.min(room, Math.round(width * 0.55)))
          const nextRight = Math.max(
            RIGHT_MIN_PX,
            Math.min(maxRight, Math.round(currentRightPx + deltaW))
          )
          widths.current.right = nextRight
          persist()
          markBusy()
          right.resize(nextRight)
        } else if (!right.isCollapsed() && currentRightPx > room + 1) {
          // too wide for this window: narrow it for now without forgetting the width the person chose
          markBusy()
          right.resize(room)
        } else if (
          !right.isCollapsed() &&
          currentRightPx < widths.current.right - 1 &&
          room > currentRightPx
        ) {
          // and give the chosen width back once there is room
          markBusy()
          right.resize(Math.min(widths.current.right, room))
        }
      }
    }
  }, [leftRef, rightRef, refFor, setOverlay, setCollapsed, markBusy, persist, dockWidth])

  useEffect(() => {
    reconcile()
    window.addEventListener('resize', reconcile)
    return () => window.removeEventListener('resize', reconcile)
  }, [reconcile])

  const flashAnimation = useCallback(() => {
    setAnimating(true)
    busyUntil.current = Math.max(busyUntil.current, performance.now() + 360)
    clearTimeout(animTimer.current)
    animTimer.current = setTimeout(() => setAnimating(false), 340)
  }, [])
  useEffect(() => () => clearTimeout(animTimer.current), [])

  /**
   * The layout switcher: show exactly the sidebars asked for. This is the only thing that widens the window.
   * One click does everything: it widens the window, waits until the page really has the new width AND the
   * panels have measured it (docking before that used the old width, so the sidebar snapped shut again and
   * a second click was needed), then docks and checks that the sidebars stayed the way they were asked for.
   * Only when the window cannot grow (maximized, small screen) does a sidebar float over the chat instead.
   */
  const applyLayout = useCallback(
    async (wantLeft: boolean, wantRight: boolean) => {
      setOverlay(null)
      flashAnimation()
      layoutBusy.current = true
      const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))
      const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      try {
        const need = dockWidth(wantLeft, wantRight)
        const fit = await window.api?.window?.fit(need, true).catch(() => null)
        await widthReaches(Math.min(need, fit?.contentWidth ?? need))
        // the panel group measures its new width on the next frames; wait for that before docking anything
        await nextFrame()
        await nextFrame()
        const width = window.innerWidth
        let left = wantLeft
        let right = wantRight
        let float: Side | null = null
        if (width < need) {
          left = wantLeft && width >= dockWidth(true, false)
          right = wantRight && width >= dockWidth(left, true)
          if (wantRight && !right) float = 'right'
          if (wantLeft && !left) float = 'left'
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          setCollapsed('left', !left, false)
          setCollapsed('right', !right, false)
          await pause(attempt === 0 ? 120 : 160)
          const l = leftRef.current
          const r = rightRef.current
          // done when both panels are in the state that was asked for; otherwise something reverted it: do it again
          if (l && r && l.isCollapsed() === !left && r.isCollapsed() === !right) break
        }
        if (float) setOverlay(float)
      } finally {
        layoutBusy.current = false
        prevWin.current = { width: window.innerWidth, screenX: window.screenX }
        requestAnimationFrame(reconcile)
      }
    },
    [setOverlay, flashAnimation, setCollapsed, reconcile, dockWidth, leftRef, rightRef]
  )

  /**
   * A sidebar button, shortcut or "open this tab": never resizes the window. If the sidebar fits beside the chat
   * (and the other sidebar, when it is open) it docks; otherwise it floats over the chat and the open one stays.
   */
  const toggle = useCallback(
    (side: Side) => {
      const panel = refFor(side).current
      if (!panel) return
      if (overlayRef.current === side) {
        setOverlay(null)
        return
      }
      if (panel.isCollapsed()) {
        const other: Side = side === 'left' ? 'right' : 'left'
        const otherPanel = refFor(other).current
        const otherDocked = Boolean(otherPanel && !otherPanel.isCollapsed())
        const wantLeft = side === 'left' || (otherDocked && other === 'left')
        const wantRight = side === 'right' || (otherDocked && other === 'right')
        setOverlay(null)
        if (window.innerWidth >= dockWidth(wantLeft, wantRight)) {
          flashAnimation()
          setCollapsed(side, false, false)
          requestAnimationFrame(reconcile)
        } else setOverlay(side)
        return
      }
      flashAnimation()
      setOverlay(null)
      setCollapsed(side, true, false)
      requestAnimationFrame(reconcile)
    },
    [refFor, setCollapsed, setOverlay, reconcile, flashAnimation, dockWidth]
  )

  const setLayout = useCallback(
    (layout: LayoutId) => {
      const { left, right } = layoutSides(layout)
      void applyLayout(left, right)
    },
    [applyLayout]
  )

  // The window's minimum width follows the layout that is docked, so nothing can be squeezed below its minimum.
  useEffect(() => {
    if (!settled) return
    void window.api?.window?.fit(minContentWidth(!leftCollapsed, !rightCollapsed), false)
  }, [settled, leftCollapsed, rightCollapsed])

  const onResize = useCallback(
    (side: Side, px: number) => {
      const isBusy = performance.now() < busyUntil.current
      const collapsed = px < 1
      if (side === 'left') setLeftCollapsed(collapsed)
      else setRightCollapsed(collapsed)
      if (ready.current && !isBusy && !auto.current[side]) remember(side, collapsed)
      if (collapsed) return
      auto.current[side] = false // gained width by any route => no longer "auto" collapsed
      // Remember widths only when user-dragged (not during programmatic window-fit adjustments)
      if (ready.current && !isBusy && px >= MINS[side]) {
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
    toggleRight: () => toggle('right'),
    overlay,
    overlayWidth: overlay ? widths.current[overlay] : 0,
    closeOverlay: () => setOverlay(null),
    layout: layoutOf(!leftCollapsed || overlay === 'left', !rightCollapsed || overlay === 'right'),
    setLayout,
    animating
  }
}
