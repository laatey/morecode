import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

export const MIN_WIDTH = 460
export const MIN_HEIGHT = 500

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const statePath = (): string => join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1280, height: 800, isMaximized: false }
  try {
    const data = JSON.parse(readFileSync(statePath(), 'utf-8'))
    if (typeof data.width !== 'number' || typeof data.height !== 'number') return fallback

    const state: WindowState = {
      width: Math.max(MIN_WIDTH, data.width),
      height: Math.max(MIN_HEIGHT, data.height),
      isMaximized: Boolean(data.isMaximized)
    }
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      const onScreen = screen.getAllDisplays().some(({ bounds }) => {
        return (
          data.x >= bounds.x - 20 &&
          data.y >= bounds.y - 20 &&
          data.x < bounds.x + bounds.width - 100 &&
          data.y < bounds.y + bounds.height - 100
        )
      })
      if (onScreen) {
        state.x = data.x
        state.y = data.y
      }
    }
    return state
  } catch {
    return fallback
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isMaximized()) {
      let prev: Partial<WindowState> = {}
      try {
        prev = JSON.parse(readFileSync(statePath(), 'utf-8'))
      } catch {
        // no previous state
      }
      writeFileSync(statePath(), JSON.stringify({ ...prev, isMaximized: true }))
    } else if (!win.isMinimized() && !win.isFullScreen()) {
      writeFileSync(statePath(), JSON.stringify({ ...win.getBounds(), isMaximized: false }))
    }
  } catch {
    // persistence is best-effort
  }
}

/** Persists size/position/maximized state (debounced) for the given window. */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveWindowState(win), 250)
  }
  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    saveWindowState(win)
  })
}
