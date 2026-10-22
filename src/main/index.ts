import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { buildAppMenu, registerMenuIpc } from './menu'
import { registerGitIpc } from './git'
import { registerAgentIpc, stopAllAgents } from './agent/ipc'
import { registerApiProxy } from './api-proxy'
import { registerTerminalIpc } from './terminal'
import { registerWorkspaceIpc } from './workspace'
import { registerAppIpc } from './app-info'
import { loadWindowState, trackWindowState, MIN_HEIGHT, MIN_WIDTH } from './window-state'

const BG_COLOR = '#272726'
const TITLEBAR_HEIGHT = 38

function createWindow(): void {
  const state = loadWindowState()

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
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // lets the Browser tab show real web pages (locked down in will-attach-webview below)
      webviewTag: true
    }
  })

  if (state.isMaximized) mainWindow.maximize()
  mainWindow.on('ready-to-show', () => mainWindow.show())
  trackWindowState(mainWindow)

  // Only hand http(s) links to the OS; deny everything else.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.morecode.app')

  // F12 toggles DevTools
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  })

  registerWorkspaceIpc()
  registerTerminalIpc()
  registerAgentIpc()
  registerApiProxy()
  app.on('before-quit', stopAllAgents)
  registerGitIpc()
  registerAppIpc()

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
