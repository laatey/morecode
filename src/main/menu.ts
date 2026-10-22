import { BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'

export function buildAppMenu(createWindow: () => void): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: createWindow },
        { type: 'separator' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { type: 'separator' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { type: 'separator' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { type: 'separator' },
        { role: 'copy' },
        { type: 'separator' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    { type: 'separator' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { type: 'separator' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { type: 'separator' },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { type: 'separator' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { type: 'separator' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: (): void => {
            void shell.openExternal('https://morecode.app')
          }
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

/** Registers the IPC channel the renderer uses to pop up the native app menu. */
export function registerMenuIpc(menu: Menu): void {
  ipcMain.on('app-menu:show', (event, pos: { x: number; y: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    menu.popup({ window, x: Math.round(pos.x), y: Math.round(pos.y) })
  })
}
