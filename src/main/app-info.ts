import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** The colours of the native window frame, which only the main process can paint. */
export interface WindowChrome {
  background: string
  symbol: string
  dark: boolean
  /** Automatic mode: leave the native theme on the OS setting so `prefers-color-scheme` keeps reporting it. */
  system: boolean
}

/** What a brand-new install uses: the default MoreCode Dark theme. */
export const DEFAULT_CHROME: WindowChrome = {
  background: '#272726',
  symbol: '#9ca3af',
  dark: true,
  system: false
}

const HEX = /^#[0-9a-f]{6}$/i
const chromeFile = (): string => join(app.getPath('userData'), 'window-chrome.json')

function valid(v: unknown): v is WindowChrome {
  const c = v as Partial<WindowChrome> | null
  return (
    !!c &&
    typeof c.background === 'string' &&
    HEX.test(c.background) &&
    typeof c.symbol === 'string' &&
    HEX.test(c.symbol) &&
    typeof c.dark === 'boolean' &&
    typeof c.system === 'boolean'
  )
}

/** The frame colours from the last session, so the window opens already in the chosen theme (no flash). */
export function loadChrome(): WindowChrome {
  try {
    const file = chromeFile()
    if (existsSync(file)) {
      const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (valid(saved)) return saved
    }
  } catch {
    // unreadable file: use the default
  }
  return DEFAULT_CHROME
}

/** Version details for the About page, the interface-size setting, and the theme's window colours. */
export function registerAppIpc(): void {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }))
  ipcMain.on('app:set-zoom', (e, factor: number) => {
    if (typeof factor === 'number' && factor >= 0.5 && factor <= 2) e.sender.setZoomFactor(factor)
  })
  ipcMain.on('app:set-theme', (e, chrome: unknown) => {
    if (!valid(chrome)) return
    // native dialogs, menus, form controls and web pages follow the theme's light/dark side; in automatic mode the
    // native theme stays on the OS setting, because that is what the renderer watches to pick the theme
    nativeTheme.themeSource = chrome.system ? 'system' : chrome.dark ? 'dark' : 'light'
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(chrome.background)
      // the overlay controls exist on Windows and Linux; macOS draws its own traffic lights
      if (process.platform !== 'darwin') {
        try {
          win.setTitleBarOverlay({ color: chrome.background, symbolColor: chrome.symbol })
        } catch {
          // a window created without an overlay cannot take one
        }
      }
    }
    try {
      writeFileSync(chromeFile(), JSON.stringify(chrome))
    } catch {
      // not saved: the next launch opens in the default colours and corrects itself once the page loads
    }
  })
}
