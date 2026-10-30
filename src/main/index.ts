import { app, shell, BrowserWindow, Menu } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { buildAppMenu, registerMenuIpc } from './menu'
import { registerGitIpc } from './git'
import { registerAgentIpc, stopAllAgents } from './agent/ipc'
import { enableBrowserDebugging, registerBrowserIpc } from './agent/browser'
import { registerApiProxy } from './api-proxy'
import { registerTerminalIpc } from './terminal'
import { registerWorkspaceIpc } from './workspace'
import { registerAppIpc } from './app-info'
import { registerSecretsIpc } from './secrets'
import { attachBackground, registerBackground, showWindow, startedHidden } from './tray'
import { loadWindowState, trackWindowState, MIN_HEIGHT, MIN_WIDTH } from './window-state'

const BG_COLOR = '#272726'
const TITLEBAR_HEIGHT = 38

function createWindow(): void {
  const state = loadWindowState()
  // Windows wants an .ico for the taskbar; the other systems use the .png
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, `icon.${process.platform === 'win32' ? 'ico' : 'png'}`)
    : join(app.getAppPath(), `resources/icon.${process.platform === 'win32' ? 'ico' : 'png'}`)

  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: BG_COLOR,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG_COLOR, symbolColor: '#9ca3af', height: TITLEBAR_HEIGHT },
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // the preload only uses Electron's own bridge, so the window can run in Chromium's sandbox
      sandbox: true,
      // lets the Browser tab show real web pages (locked down in will-attach-webview below)
      webviewTag: true,
      // a hidden window must keep its timers running, or routines would stop when the window is closed to the tray
      backgroundThrottling: false
    }
  })

  if (process.platform === 'win32' && existsSync(iconPath)) {
    mainWindow.setAppDetails({
      appId: 'com.morecode.app',
      appIconPath: iconPath,
      relaunchCommand: `"${process.execPath}"`,
      relaunchDisplayName: 'MoreCode'
    })
  }

  // maximizing would also show the window, which a start-in-the-tray launch must not do
  if (state.isMaximized && !startedHidden) mainWindow.maximize()
  mainWindow.on('ready-to-show', () => {
    if (!startedHidden) mainWindow.show()
  })
  attachBackground(mainWindow)
  trackWindowState(mainWindow)

  // Only hand http(s) links to the OS; deny everything else.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window may only ever show the app itself. A link or script that tries to navigate it elsewhere is stopped,
  // because this window has the app's private bridge to the computer.
  const ownPage = process.env['ELECTRON_RENDERER_URL']
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !(ownPage && url.startsWith(ownPage))) event.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// the AI's browser control connects to the Browser tab through a local-only debugging port (set before the app is ready)
enableBrowserDebugging()

// one copy only: opening MoreCode again brings the hidden one back instead of starting a second
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
app.on('second-instance', showWindow)

app.whenReady().then(() => {
  if (!gotLock) return
  registerBackground()
  if (process.platform === 'win32') app.setAppUserModelId('com.morecode.app')

  // F12 toggles DevTools while developing. Installed copies do not get it.
  if (!app.isPackaged) {
    app.on('browser-window-created', (_, window) => {
      window.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
          window.webContents.toggleDevTools()
          event.preventDefault()
        }
      })
    })
  }

  registerWorkspaceIpc()
  registerTerminalIpc()
  registerAgentIpc()
  registerBrowserIpc()
  registerApiProxy()
  app.on('before-quit', stopAllAgents)
  registerGitIpc()
  registerAppIpc()
  registerSecretsIpc()

  // Pages shown in the Browser tab get no access to Node or to this app's own bridge.
  app.on('web-contents-created', (_, contents) => {
    // links that want a new window open in the user's normal browser instead
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
      })
    }
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.contextIsolation = true
      if (!/^(https?:\/\/|about:blank)/i.test(params.src ?? '')) event.preventDefault()
    })
  })

  const menu = buildAppMenu(createWindow)
  Menu.setApplicationMenu(menu)
  registerMenuIpc(menu)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
