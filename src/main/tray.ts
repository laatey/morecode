import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Background mode. Closing the window hides it instead of quitting, so routines keep running.
 * The tray icon brings the window back, and its menu is the way to really quit.
 */

interface Prefs {
  /** Closing the window hides it (true) or quits (false). */
  background: boolean
  openAtLogin: boolean
  /** The "still running" notice has been shown once. */
  told: boolean
}

const file = (): string => join(app.getPath('userData'), 'background.json')
let prefs: Prefs = { background: true, openAtLogin: false, told: false }

function loadPrefs(): void {
  try {
    if (existsSync(file())) prefs = { ...prefs, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Prefs>) }
  } catch {
    // unreadable settings: keep the defaults
  }
}

function savePrefs(): void {
  try {
    writeFileSync(file(), JSON.stringify(prefs))
  } catch {
    // not saving a preference is not worth an error
  }
}

/** Set once the person really quits (tray, Cmd+Q, system shutdown), so the close handler lets the window go. */
let quitting = false
/** Started by "Start when I sign in": come up in the tray without opening a window. */
export const startedHidden = process.argv.includes('--hidden')

let tray: Tray | null = null
let win: BrowserWindow | null = null

const windowState = (): { visible: boolean; focused: boolean } => ({
  visible: Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()),
  focused: Boolean(win && !win.isDestroyed() && win.isFocused())
})

const sendState = (): void => {
  if (win && !win.isDestroyed()) win.webContents.send('window:state', windowState())
}

export function showWindow(): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function applyLogin(): void {
  // registering the development copy of Electron to start at sign-in would be wrong
  if (!app.isPackaged || process.platform === 'linux') return
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, args: ['--hidden'] })
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open MoreCode', click: showWindow },
    { type: 'separator' },
    {
      label: 'Keep running in the background when closed',
      type: 'checkbox',
      checked: prefs.background,
      click: (item) => {
        prefs.background = item.checked
        savePrefs()
      }
    },
    ...(process.platform === 'linux'
      ? []
      : [
          {
            label: 'Start when I sign in',
            type: 'checkbox' as const,
            checked: prefs.openAtLogin,
            click: (item: Electron.MenuItem): void => {
              prefs.openAtLogin = item.checked
              applyLogin()
              savePrefs()
            }
          }
        ]),
    { type: 'separator' },
    {
      label: 'Quit MoreCode',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

function ensureTray(): void {
  if (tray && !tray.isDestroyed()) return
  const iconPath = join(__dirname, `../../resources/icon.${process.platform === 'win32' ? 'ico' : 'png'}`)
  const image = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(process.platform === 'darwin' ? image.resize({ width: 18, height: 18 }) : image.resize({ width: 20, height: 20 }))
  tray.setToolTip('MoreCode')
  tray.setContextMenu(buildMenu())
  // on Windows and Linux a plain click brings the window back; macOS shows the menu
  tray.on('click', showWindow)
}

/** Call once, before the first window exists. */
export function registerBackground(): void {
  loadPrefs()
  app.on('before-quit', () => {
    quitting = true
  })
  ipcMain.handle('window:get-state', () => windowState())
  applyLogin()
}

/** Call for every window the app creates. */
export function attachBackground(window: BrowserWindow): void {
  win = window
  ensureTray()
  window.on('close', (event) => {
    if (quitting || !prefs.background) return
    event.preventDefault()
    window.hide()
    if (!prefs.told && Notification.isSupported()) {
      prefs.told = true
      savePrefs()
      new Notification({
        title: 'MoreCode is still running',
        body: 'Your routines keep running in the background. To stop them, quit from the MoreCode icon in the system tray.'
      }).show()
    }
  })
  window.on('show', sendState)
  window.on('hide', sendState)
  window.on('focus', sendState)
  window.on('blur', sendState)
  window.on('minimize', sendState)
  window.on('restore', sendState)
}
