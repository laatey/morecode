import { useEffect, useState } from 'react'

/** Shown when the app runs in a plain browser, where there is no project folder to read. */
const SAMPLE = [
  'src/App.tsx',
  'src/main.tsx',
  'src/components/AlignmentGrid.tsx',
  'src/lib/easing.ts',
  'src/lib/utils.ts',
  'package.json',
  'README.md'
]

/** Every file in the project (skipping node_modules and the like), as relative paths. */
export function useWorkspaceFiles(projectKey: string): string[] {
  const [files, setFiles] = useState<string[]>([])
  useEffect(() => {
    let stale = false
    const api = window.api?.workspace
    if (!api?.files) {
      setFiles(SAMPLE)
      return
    }
    api
      .files()
      .then((list) => !stale && setFiles(list))
      .catch(() => !stale && setFiles([]))
    return () => {
      stale = true
    }
  }, [projectKey])
  return files
}

/** Best matches first: file name starts with the text, then name contains it, then path contains it. */
export function matchFiles(files: string[], query: string, limit = 8): string[] {
  const q = query.toLowerCase()
  if (!q) return files.slice(0, limit)
  const scored: { f: string; s: number }[] = []
  for (const f of files) {
    const lower = f.toLowerCase()
    const name = lower.slice(lower.lastIndexOf('/') + 1)
    const s = name.startsWith(q) ? 0 : name.includes(q) ? 1 : lower.includes(q) ? 2 : -1
    if (s >= 0) scored.push({ f, s })
  }
  return scored.sort((a, b) => a.s - b.s || a.f.length - b.f.length).slice(0, limit).map((x) => x.f)
}
