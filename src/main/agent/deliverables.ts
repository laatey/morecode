import { readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

/**
 * Files a command made that a person would want to open or keep (a PDF, a spreadsheet, a zip), found by looking at
 * the working folder before and after the command runs. Code and images are left out: they are project files, not results.
 */
const DELIVERABLE = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'csv', 'epub', 'mp3', 'mp4', 'wav'])
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', 'target'])
const MAX_ENTRIES = 4000
const MAX_DEPTH = 4

export interface FileInfo {
  /** Relative to the working folder, with forward slashes. */
  path: string
  name: string
  size: number
}

type Snapshot = Map<string, { mtimeMs: number; size: number }>

export function snapshotDeliverables(root: string): Snapshot {
  const found: Snapshot = new Map()
  let seen = 0
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || seen > MAX_ENTRIES) return
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (++seen > MAX_ENTRIES) return
      if (SKIP.has(name) || name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full, depth + 1)
      else if (st.isFile() && DELIVERABLE.has(name.split('.').pop()?.toLowerCase() ?? '')) found.set(full, { mtimeMs: st.mtimeMs, size: st.size })
    }
  }
  walk(root, 0)
  return found
}

/** What is new or was rewritten between two looks. */
export function changedDeliverables(root: string, before: Snapshot, after: Snapshot): FileInfo[] {
  const out: FileInfo[] = []
  for (const [full, now] of after) {
    const was = before.get(full)
    if (was && was.mtimeMs === now.mtimeMs && was.size === now.size) continue
    const path = relative(root, full).split(sep).join('/')
    out.push({ path, name: path.split('/').pop() ?? path, size: now.size })
  }
  return out.slice(0, 12)
}
