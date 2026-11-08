import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync, statSync } from 'fs'
import { basename, isAbsolute, relative, resolve } from 'path'
import { getWorkspaceRoot } from './workspace'

/** Show a file the AI made in its folder, or save a copy somewhere the person chooses. Only files inside the open folder. */
function inside(rel: unknown): string | null {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel)) return null
  const root = getWorkspaceRoot()
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  if (back.startsWith('..') || isAbsolute(back)) return null
  try {
    return existsSync(abs) && statSync(abs).isFile() ? abs : null
  } catch {
    return null
  }
}

export function registerDeliverablesIpc(): void {
  ipcMain.handle('files:reveal', (_e, rel: unknown): boolean => {
    const abs = inside(rel)
    if (abs) shell.showItemInFolder(abs)
    return Boolean(abs)
  })
  ipcMain.handle('files:save-as', async (e, rel: unknown): Promise<boolean> => {
    const abs = inside(rel)
    if (!abs) return false
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const choice = await dialog.showSaveDialog(win!, { defaultPath: basename(abs) })
    if (choice.canceled || !choice.filePath) return false
    copyFileSync(abs, choice.filePath)
    return true
  })
}
