import { app, ipcMain } from 'electron'

/** Version details for the About page, and the interface-size setting. */
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
}
