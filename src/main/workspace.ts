import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join, resolve, sep } from 'path'

/**
 * The folder the app works in. The Docs and Terminal tabs both start here.
 * It is remembered between launches in the app's data folder.
 */
const stateFile = (): string => join(app.getPath('userData'), 'workspace.json')

function defaultRoot(): string {
  // while developing, work in the project itself; installed builds start in Documents
  return app.isPackaged ? app.getPath('documents') : process.cwd()
}

let root: string | null = null

export function getWorkspaceRoot(): string {
  if (root) return root
  try {
    const saved = JSON.parse(readFileSync(stateFile(), 'utf8')) as { root?: string }
    if (saved.root && existsSync(saved.root) && statSync(saved.root).isDirectory()) {
      root = saved.root
      return root
    }
  } catch {
    // no saved folder yet
  }
  root = defaultRoot()
  return root
}

/** A predictable home for projects created by the AI, separate from any open project. */
export function getNewProjectRoot(): string {
  const folder = join(app.getPath('documents'), 'MoreCode Projects')
  try {
    mkdirSync(folder, { recursive: true })
  } catch {
    // The create-project tool will report a useful error if Documents is unavailable.
  }
  return folder
}

export function setWorkspaceRoot(next: string): void {
  root = next
  try {
    writeFileSync(stateFile(), JSON.stringify({ root: next }))
  } catch {
    // not being able to remember the folder is not worth interrupting the user
  }
}

const info = (): { root: string; name: string } => ({
  root: getWorkspaceRoot(),
  name: basename(getWorkspaceRoot()) || getWorkspaceRoot()
})

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.markdown'])
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.cache',
  '.venv',
  'venv',
  'vendor',
  'target'
])
const MAX_DEPTH = 4
const MAX_FILES = 300
const MAX_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

export interface DocInfo {
  /** Path relative to the workspace, always with forward slashes. */
  path: string
  name: string
  dir: string
  size: number
  modified: number
}

function listDocs(): DocInfo[] {
  const base = getWorkspaceRoot()
  const found: DocInfo[] = []
  const walk = (dir: string, depth: number): void => {
    if (found.length >= MAX_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // unreadable folders are simply skipped
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.') && depth < MAX_DEPTH) {
          walk(full, depth + 1)
        }
      } else if (entry.isFile() && DOC_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        try {
          const st = statSync(full)
          const rel = full.slice(base.length + 1).split(sep).join('/')
          const name = entry.name
          found.push({
            path: rel,
            name,
            dir: rel.slice(0, Math.max(0, rel.length - name.length - 1)),
            size: st.size,
            modified: st.mtimeMs
          })
        } catch {
          // file vanished while scanning
        }
      }
    }
  }
  walk(base, 0)
  return found
}

const MAX_LISTED = 4000
const LIST_DEPTH = 8

/** Every file in the project for @ mentions, skipping folders like node_modules and hidden ones. */
function listFiles(): string[] {
  const base = getWorkspaceRoot()
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (found.length >= MAX_LISTED) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= MAX_LISTED) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.') && depth < LIST_DEPTH) walk(full, depth + 1)
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        found.push(full.slice(base.length + 1).split(sep).join('/'))
      }
    }
  }
  walk(base, 0)
  return found.sort((a, b) => a.length - b.length || a.localeCompare(b))
}

/** Resolve a relative doc path, refusing anything that escapes the workspace. */
function safeDocPath(rel: string): string | null {
  const base = getWorkspaceRoot()
  const full = resolve(base, rel)
  if (full !== base && !full.startsWith(base + sep)) return null
  if (!DOC_EXTENSIONS.has(extname(full).toLowerCase())) return null
  return full
}


export interface DocMatch {
  path: string
  /** 1-based line number, or 0 when only the file name matched. */
  line: number
  text: string
}

/** Search inside every doc, so a word can be found even when it is not in the file name. */
function searchDocs(query: string): DocMatch[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const base = getWorkspaceRoot()
  const out: DocMatch[] = []
  for (const doc of listDocs()) {
    if (out.length >= 80) break
    if (doc.path.toLowerCase().includes(q)) out.push({ path: doc.path, line: 0, text: doc.name })
    if (doc.size > MAX_BYTES) continue
    let text = ''
    try {
      text = readFileSync(join(base, doc.path), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    let perFile = 0
    for (let i = 0; i < lines.length && perFile < 3 && out.length < 80; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        out.push({ path: doc.path, line: i + 1, text: lines[i].trim().slice(0, 200) })
        perFile++
      }
    }
  }
  return out
}

/** Any file inside the project (not just docs), refusing anything that escapes it. */
function safeFilePath(rel: string): string | null {
  const base = getWorkspaceRoot()
  const full = resolve(base, rel)
  return full === base || !full.startsWith(base + sep) ? null : full
}

const cleanDocName = (raw: string): string | null => {
  const parts = raw
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim().replace(/[<>:"|?*\u0000-\u001f]/g, ''))
    .filter((p) => p && p !== '.' && p !== '..')
  if (!parts.length) return null
  const last = parts[parts.length - 1]
  parts[parts.length - 1] = DOC_EXTENSIONS.has(extname(last).toLowerCase()) ? last : `${last}.md`
  return parts.join('/')
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:get', () => info())

  ipcMain.handle('workspace:choose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose your project folder',
      defaultPath: getWorkspaceRoot(),
      properties: ['openDirectory' as const]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    setWorkspaceRoot(result.filePaths[0])
    return info()
  })

  /** Make an already-existing folder the active project without opening a picker. */
  ipcMain.handle('workspace:open', (_event, folder: unknown) => {
    if (typeof folder !== 'string' || !existsSync(folder) || !statSync(folder).isDirectory()) return null
    setWorkspaceRoot(folder)
    return info()
  })

  ipcMain.handle('workspace:files', () => listFiles())

  ipcMain.handle('workspace:read-file', (_event, rel: string): { ok: true; text: string } | { ok: false; error: string } => {
    const full = typeof rel === 'string' ? safeFilePath(rel) : null
    if (!full) return { ok: false, error: 'That file is outside your project.' }
    try {
      if (statSync(full).size > MAX_BYTES) return { ok: false, error: 'This file is too large to preview.' }
      return { ok: true, text: readFileSync(full, 'utf8') }
    } catch {
      return { ok: false, error: 'Could not open this file. It may have been moved or deleted.' }
    }
  })

  ipcMain.handle('workspace:read-image', (_event, rel: string): { ok: true; dataUrl: string } | { ok: false; error: string } => {
    const full = typeof rel === 'string' ? safeFilePath(rel) : null
    const mime = full ? IMAGE_TYPES[extname(full).toLowerCase()] : undefined
    if (!full || !mime) return { ok: false, error: 'That is not a supported image file.' }
    try {
      if (statSync(full).size > MAX_BYTES * 4) return { ok: false, error: 'This image is too large to preview.' }
      return { ok: true, dataUrl: `data:${mime};base64,${readFileSync(full).toString('base64')}` }
    } catch {
      return { ok: false, error: 'Could not open this image. It may have been moved or deleted.' }
    }
  })

  ipcMain.handle('workspace:reveal', async (_event, path?: string) => {
    const target =
      typeof path === 'string' && existsSync(path) && statSync(path).isDirectory() ? path : getWorkspaceRoot()
    await shell.openPath(target)
  })

  ipcMain.handle('docs:list', () => listDocs())

  ipcMain.handle('docs:read', (_event, rel: string): { ok: true; text: string } | { ok: false; error: string } => {
    const full = typeof rel === 'string' ? safeDocPath(rel) : null
    if (!full) return { ok: false, error: 'That file is outside your project.' }
    try {
      if (statSync(full).size > MAX_BYTES) return { ok: false, error: 'This file is too large to preview.' }
      return { ok: true, text: readFileSync(full, 'utf8') }
    } catch {
      return { ok: false, error: 'Could not open this file. It may have been moved or deleted.' }
    }
  })

  ipcMain.handle('docs:open', async (_event, rel: string) => {
    const full = typeof rel === 'string' ? safeDocPath(rel) : null
    if (full) await shell.openPath(full)
  })

  ipcMain.handle('workspace:open-file', async (_event, rel: string): Promise<{ ok: boolean; error?: string }> => {
    const full = typeof rel === 'string' ? safeFilePath(rel) : null
    if (!full || !existsSync(full)) return { ok: false, error: 'This file is not in your project folder yet.' }
    const problem = await shell.openPath(full)
    return problem ? { ok: false, error: 'Could not open this file.' } : { ok: true }
  })

  ipcMain.handle('workspace:reveal-file', (_event, rel: string): boolean => {
    const full = typeof rel === 'string' ? safeFilePath(rel) : null
    if (!full || !existsSync(full)) return false
    shell.showItemInFolder(full)
    return true
  })

  ipcMain.handle('docs:search', (_event, query: string) => (typeof query === 'string' ? searchDocs(query) : []))

  ipcMain.handle(
    'docs:write',
    (_event, rel: string, text: string): { ok: true } | { ok: false; error: string } => {
      const full = typeof rel === 'string' ? safeDocPath(rel) : null
      if (!full || typeof text !== 'string') return { ok: false, error: 'That file is outside your project.' }
      try {
        writeFileSync(full, text, 'utf8')
        return { ok: true }
      } catch {
        return { ok: false, error: 'Could not save. Check that the file is not read-only.' }
      }
    }
  )

  ipcMain.handle(
    'docs:create',
    (_event, name: string): { ok: true; doc: DocInfo } | { ok: false; error: string } => {
      const rel = typeof name === 'string' ? cleanDocName(name) : null
      if (!rel) return { ok: false, error: 'Type a name for the new doc.' }
      const full = safeDocPath(rel)
      if (!full) return { ok: false, error: 'That name is not allowed.' }
      if (existsSync(full)) return { ok: false, error: 'A doc with that name already exists.' }
      try {
        mkdirSync(dirname(full), { recursive: true })
        const file = basename(full)
        const heading = file.replace(/\.(md|mdx|markdown)$/i, '').replace(/[-_]+/g, ' ')
        writeFileSync(full, `# ${heading.charAt(0).toUpperCase()}${heading.slice(1)}\n\n`, 'utf8')
        const st = statSync(full)
        return {
          ok: true,
          doc: {
            path: rel,
            name: file,
            dir: rel.slice(0, Math.max(0, rel.length - file.length - 1)),
            size: st.size,
            modified: st.mtimeMs
          }
        }
      } catch {
        return { ok: false, error: 'Could not create the doc. Check that the folder is writable.' }
      }
    }
  )
}
