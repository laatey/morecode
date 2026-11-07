import { app, ipcMain } from 'electron'
import { addMany, clearScope, editEntry, forgetChat, isStale, listProjects, loadEntries, addEntry, removeEntry, type MemoryEntry, type ProjectSummary, type Scope } from './agent/memory'

/** What the manager shows: every note with whether it is old, plus which projects have notes. */
export interface MemoryView {
  global: (MemoryEntry & { stale: boolean })[]
  project: (MemoryEntry & { stale: boolean })[]
  projects: ProjectSummary[]
}

const dir = (): string => app.getPath('userData')
const scopeOf = (v: unknown): Scope | null => (v === 'global' || v === 'project' ? v : null)
const pathOf = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 && v.length < 1000 ? v : undefined)
const mark = (list: MemoryEntry[]): MemoryView['global'] => list.map((e) => ({ ...e, stale: isStale(e) }))

function view(projectPath?: string): MemoryView {
  return { global: mark(loadEntries(dir(), 'global')), project: mark(loadEntries(dir(), 'project', projectPath)), projects: listProjects(dir()) }
}

type Result = { ok: true; view: MemoryView } | { ok: false; error: string }
const run = (projectPath: string | undefined, fn: () => void): Result => {
  try {
    fn()
    return { ok: true, view: view(projectPath) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

type ImportResult = { ok: true; view: MemoryView; added: number; duplicates: number; rejected: { text: string; reason: string }[] } | { ok: false; error: string }

export function registerMemoryIpc(): void {
  ipcMain.handle('memory:list', (_e, projectPath: unknown): MemoryView => view(pathOf(projectPath)))
  ipcMain.handle('memory:add', (_e, scope: unknown, projectPath: unknown, text: unknown, pinned: unknown): Result => {
    const s = scopeOf(scope)
    const p = pathOf(projectPath)
    if (!s || typeof text !== 'string') return { ok: false, error: 'That note could not be saved.' }
    return run(p, () => void addEntry(dir(), s, p, text, { pinned: pinned === true }))
  })
  ipcMain.handle('memory:import', (_e, projectPath: unknown, items: unknown): ImportResult => {
    const p = pathOf(projectPath)
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) return { ok: false, error: 'There is nothing to import.' }
    const batch: { scope: Scope; projectPath?: string; text: string }[] = []
    const early: { text: string; reason: string }[] = []
    for (const it of items as { scope?: unknown; text?: unknown }[]) {
      const s = scopeOf(it?.scope)
      if (!s || typeof it.text !== 'string' || it.text.length > 2000) continue
      if (s === 'project' && !p) early.push({ text: it.text.slice(0, 120), reason: 'There is no project to keep it in.' })
      else batch.push({ scope: s, ...(s === 'project' ? { projectPath: p } : {}), text: it.text })
    }
    try {
      const r = addMany(dir(), batch)
      return { ok: true, view: view(p), added: r.added, duplicates: r.duplicates, rejected: [...early, ...r.rejected] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('memory:edit', (_e, scope: unknown, projectPath: unknown, id: unknown, patch: unknown): Result => {
    const s = scopeOf(scope)
    const p = pathOf(projectPath)
    const x = patch as { text?: unknown; pinned?: unknown } | null
    if (!s || typeof id !== 'string' || !x) return { ok: false, error: 'That note could not be changed.' }
    return run(p, () => {
      const changed = editEntry(dir(), s, p, id, { ...(typeof x.text === 'string' ? { text: x.text } : {}), ...(typeof x.pinned === 'boolean' ? { pinned: x.pinned } : {}) })
      if (!changed) throw new Error('That note no longer exists.')
    })
  })
  ipcMain.handle('memory:remove', (_e, scope: unknown, projectPath: unknown, id: unknown): Result => {
    const s = scopeOf(scope)
    const p = pathOf(projectPath)
    if (!s || typeof id !== 'string') return { ok: false, error: 'That note could not be removed.' }
    return run(p, () => void removeEntry(dir(), s, p, id))
  })
  ipcMain.handle('memory:forget-chat', (_e, chatId: unknown, projectPath: unknown): number =>
    typeof chatId === 'string' && chatId ? forgetChat(dir(), chatId, pathOf(projectPath)) : 0
  )
  ipcMain.handle('memory:clear', (_e, scope: unknown, projectPath: unknown): Result => {
    const s = scopeOf(scope)
    const p = pathOf(projectPath)
    if (!s) return { ok: false, error: 'Nothing to clear.' }
    return run(p, () => clearScope(dir(), s, p))
  })
}
