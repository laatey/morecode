import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/* ---------- undo ---------- */

export interface Snapshot {
  abs: string
  /** null means the file did not exist before the AI created it. */
  original: string | null
}
export const snapshots = new Map<string, Snapshot>()
/** What each file looked like before its first edit that is still waiting for review, to count the real net change. */
export const baselines = new Map<string, string | null>()
const releaseBaseline = (abs: string): void => {
  if (![...snapshots.values()].some((s) => s.abs === abs)) baselines.delete(abs)
}

/** What a file looked like right after an edit that was then undone, so the undo itself can be undone. */
const undone = new Map<string, { abs: string; restored: string | null; after: string | null }>()

/**
 * Re-applies an edit that was undone. Only when the file still holds exactly what the undo wrote:
 * if the person changed it since, it is left alone ('changed').
 */
export function restoreEdit(id: string): 'restored' | 'changed' | 'none' {
  const u = undone.get(id)
  if (!u) return 'none'
  try {
    const current = existsSync(u.abs) ? readFileSync(u.abs, 'utf8') : null
    if (current !== u.restored) return 'changed'
    if (u.after === null) {
      if (existsSync(u.abs)) unlinkSync(u.abs)
    } else {
      mkdirSync(dirname(u.abs), { recursive: true })
      writeFileSync(u.abs, u.after)
    }
  } catch {
    return 'changed'
  }
  undone.delete(id)
  snapshots.set(id, { abs: u.abs, original: u.restored })
  return 'restored'
}

/** Put a file back the way it was before one edit. Returns false if there is nothing to undo. */
export function revertEdit(id: string): boolean {
  const snap = snapshots.get(id)
  if (!snap) return false
  let after: string | null = null
  try {
    after = existsSync(snap.abs) ? readFileSync(snap.abs, 'utf8') : null
  } catch {
    after = null
  }
  try {
    if (snap.original === null) {
      if (existsSync(snap.abs)) unlinkSync(snap.abs)
    } else {
      writeFileSync(snap.abs, snap.original)
    }
  } catch {
    return false
  }
  undone.set(id, { abs: snap.abs, restored: snap.original, after })
  snapshots.delete(id)
  releaseBaseline(snap.abs)
  return true
}

/** The person kept an edit; the undo copy is no longer needed. */
export function keepEdit(id: string): void {
  const snap = snapshots.get(id)
  snapshots.delete(id)
  if (snap) releaseBaseline(snap.abs)
}

