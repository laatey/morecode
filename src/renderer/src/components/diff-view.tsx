import { FileDiff as PierreFileDiff } from '@pierre/diffs/react'
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs'
import { useMemo, type CSSProperties, type JSX } from 'react'

export type DiffLine = {
  type: 'ctx' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}
export type DiffHunk = { oldStart: number; newStart: number; lines: DiffLine[] }
export type FileDiff = {
  path: string
  action: 'create' | 'update' | 'delete'
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

function makePatch(file: FileDiff): string {
  const oldName = file.action === 'create' ? '/dev/null' : `a/${file.path}`
  const newName = file.action === 'delete' ? '/dev/null' : `b/${file.path}`
  const hunks = file.hunks.map((h) => {
    const oldCount = h.lines.filter((line) => line.type !== 'add').length
    const newCount = h.lines.filter((line) => line.type !== 'del').length
    const body = h.lines
      .map((line) => `${line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}${line.text}`)
      .join('\n')
    return `@@ -${h.oldStart},${oldCount} +${h.newStart},${newCount} @@\n${body}`
  })
  return [`diff --git a/${file.path} b/${file.path}`, `--- ${oldName}`, `+++ ${newName}`, ...hunks].join('\n')
}

function pierreDiff(file: FileDiff): FileDiffMetadata | null {
  try {
    return parsePatchFiles(makePatch(file), `morecode:${file.path}`, true)[0]?.files[0] ?? null
  } catch {
    return null
  }
}

/** Pierre supplies a virtualized Shiki-backed unified diff while MoreCode owns its surrounding UI. */
export function DiffView({ file }: { file: FileDiff }): JSX.Element {
  const diff = useMemo(() => pierreDiff(file), [file])
  if (!diff) return <p className="px-4 py-6 text-xs text-muted-foreground">No textual changes.</p>

  return (
    <PierreFileDiff
      fileDiff={diff}
      className="morecode-pierre-diff"
      style={
        {
          '--diffs-bg': '#272726',
          '--diffs-bg-context': '#272726',
          '--diffs-bg-separator': '#2f2f2e',
          '--diffs-fg': '#d6d6d3'
        } as CSSProperties
      }
      options={{
        theme: 'pierre-dark',
        themeType: 'dark',
        diffStyle: 'unified',
        diffIndicators: 'bars',
        disableFileHeader: true,
        overflow: 'scroll',
        hunkSeparators: 'simple',
        // AI edits contain only changed hunks, not the entire before/after file.
        // Keep the review focused on those supplied hunks instead of asking Pierre to hydrate missing context.
        expandUnchanged: false,
        lineDiffType: 'word'
      }}
    />
  )
}
