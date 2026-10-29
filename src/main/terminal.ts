import { app, ipcMain } from 'electron'
import { getWorkspaceRoot, isChatSpace } from './workspace'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, resolve } from 'path'

/**
 * Runs one command at a time per terminal tab and streams its output back.
 * This is a command runner, not a full terminal emulator: programs that draw their own screen
 * (vim, htop) need a real pseudo-terminal such as node-pty + xterm.js.
 */
const running = new Map<string, ChildProcess>()

const isDir = (p: string): boolean => {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => undefined)
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM') // the whole group, not just the shell
    } catch {
      child.kill('SIGTERM')
    }
  }
}

export function registerTerminalIpc(): void {
  // A terminal starts in the folder of the project it belongs to (or the home folder for a loose chat).
  ipcMain.handle('term:start-dir', (_event, folder: unknown) => {
    if (typeof folder === 'string' && isDir(folder)) return folder
    // a chat with no project: its own empty folder (the app points the workspace there), else home
    const here = getWorkspaceRoot()
    return isChatSpace(here) && isDir(here) ? here : homedir()
  })

  ipcMain.handle(
    'term:cd',
    (_event, cwd: string, target: string): { ok: true; cwd: string } | { ok: false; error: string } => {
      // cmd.exe style: "cd /d D:\\x" and a bare drive letter "D:" both just change folder
      let raw = (target ?? '').trim().replace(/^\/d\s+/i, '').replace(/^["']|["']$/g, '')
      if (/^[a-z]:$/i.test(raw)) raw = `${raw}\\`
      const dest =
        raw === '' || raw === '~'
          ? homedir()
          : raw.startsWith('~/') || raw.startsWith('~\\')
            ? resolve(homedir(), raw.slice(2))
            : isAbsolute(raw)
              ? raw
              : resolve(cwd, raw)
      return isDir(dest)
        ? { ok: true, cwd: dest }
        : { ok: false, error: `No such folder: ${raw}` }
    }
  )

  ipcMain.on('term:run', (event, req: { id: string; command: string; cwd: string }) => {
    const { id, command, cwd } = req
    const send = (channel: string, payload: unknown): void => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    }
    if (running.has(id)) {
      send('term:data', { id, stream: 'err', chunk: 'A command is already running here.\n' })
      return
    }
    if (typeof command !== 'string' || !command.trim() || !isDir(cwd)) {
      send('term:exit', { id, code: 1 })
      return
    }
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '1' }
    })
    running.set(id, child)
    child.stdout?.on('data', (d: Buffer) => send('term:data', { id, stream: 'out', chunk: d.toString('utf8') }))
    child.stderr?.on('data', (d: Buffer) => send('term:data', { id, stream: 'err', chunk: d.toString('utf8') }))
    child.on('error', (err) => send('term:data', { id, stream: 'err', chunk: `${err.message}\n` }))
    child.on('close', (code, signal) => {
      running.delete(id)
      send('term:exit', { id, code, signal })
    })
  })

  ipcMain.on('term:kill', (_event, id: string) => {
    const child = running.get(id)
    if (child) killTree(child)
  })

  app.on('before-quit', () => running.forEach(killTree))
}
