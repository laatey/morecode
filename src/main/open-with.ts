import { app, BrowserWindow, ipcMain } from 'electron'
import { statSync } from 'fs'
import { resolve } from 'path'

/**
 * Things that start MoreCode from outside the app: right-click a folder → "Open with MoreCode", the
 * taskbar and Start menu jump list (New chat, New project, recent projects), or `morecode.exe <folder>`.
 */
export type OpenAction = { kind: 'folder'; path: string } | { kind: 'new-chat' } | { kind: 'new-project' } | { kind: 'settings' }

const FLAGS: Record<string, OpenAction> = {
  '--new-chat': { kind: 'new-chat' },
  '--new-project': { kind: 'new-project' },
  '--settings': { kind: 'settings' }
}

/** What a command line asks for. A folder wins over nothing; flags win over folders. */
export function actionFromArgv(argv: string[], cwd: string = process.cwd()): OpenAction | null {
  // installed: [exe, ...args]. Development: [electron, '.', ...args]
  const args = argv.slice(app.isPackaged ? 1 : 2)
  for (const a of args) if (FLAGS[a]) return FLAGS[a]
  for (const a of args) {
    if (a.startsWith('-')) continue
    try {
      const path = resolve(cwd, a)
      if (statSync(path).isDirectory()) return { kind: 'folder', path }
    } catch {
      // not a folder: ignore it
    }
  }
  return null
}

let pending: OpenAction | null = null
let listening = false

/** Hand the action to the window now, or keep it until the window is ready to take it. */
export function deliverAction(action: OpenAction): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (win && listening && !win.webContents.isLoading()) win.webContents.send('app:open-action', action)
  else pending = action
}

export function setupJumpList(recent: { name: string; path: string }[] = []): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const task = (title: string, args: string, description: string) => ({
    program: process.execPath,
    arguments: args,
    iconPath: process.execPath,
    iconIndex: 0,
    title,
    description
  })
  try {
    app.setUserTasks([
      task('New chat', '--new-chat', 'Start a new chat'),
      task('New project', '--new-project', 'Start a new project'),
      task('Settings', '--settings', 'Open settings')
    ])
    app.setJumpList(
      recent.length
        ? [
            {
              type: 'custom',
              name: 'Recent projects',
              items: recent.slice(0, 8).map((p) => ({
                type: 'task' as const,
                title: p.name.slice(0, 60),
                description: p.path,
                program: process.execPath,
                args: `"${p.path}"`,
                iconPath: process.execPath,
                iconIndex: 0
              }))
            }
          ]
        : []
    )
  } catch {
    // the jump list is a convenience: never let it stop the app
  }
}

export function registerOpenWithIpc(): void {
  ipcMain.handle('app:take-pending-action', (): OpenAction | null => {
    listening = true // the window has its listener now
    const a = pending
    pending = null
    return a
  })
  ipcMain.on('app:set-recent-projects', (_e, list: unknown) => {
    if (!Array.isArray(list)) return
    const clean = list
      .filter((x): x is { name: string; path: string } => Boolean(x) && typeof x.name === 'string' && typeof x.path === 'string')
      .slice(0, 8)
    setupJumpList(clean)
  })
}
