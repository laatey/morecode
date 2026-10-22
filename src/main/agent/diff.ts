/** Line diff of two texts, in the shape the Changes tab draws. No dependencies, so it is easy to test. */

export interface DiffLine {
  type: 'ctx' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}
export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: DiffLine[]
}
export interface FileDiff {
  path: string
  action: 'create' | 'update' | 'delete'
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

const CONTEXT = 3
/** Beyond this many cells the exact diff would be slow; the changed middle is shown as one block. */
const MAX_CELLS = 4_000_000

const split = (text: string): string[] => {
  if (text === '') return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop() // a trailing newline is not an extra empty line
  return lines
}

type Op = { type: 'ctx' | 'add' | 'del'; text: string }

/** Edit script between two line arrays: trim the shared start and end, then LCS the middle. */
function script(a: string[], b: string[]): Op[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const head: Op[] = a.slice(0, start).map((text) => ({ type: 'ctx', text }))
  const tail: Op[] = a.slice(endA).map((text) => ({ type: 'ctx', text }))
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  let mid: Op[]

  if (midA.length * midB.length > MAX_CELLS) {
    mid = [...midA.map((text): Op => ({ type: 'del', text })), ...midB.map((text): Op => ({ type: 'add', text }))]
  } else {
    const n = midA.length
    const m = midB.length
    // lcs[i][j] = length of the longest common run of midA[i..] and midB[j..]
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
      }
    }
    mid = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        mid.push({ type: 'ctx', text: midA[i] })
        i++
        j++
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        mid.push({ type: 'del', text: midA[i++] })
      } else {
        mid.push({ type: 'add', text: midB[j++] })
      }
    }
    while (i < n) mid.push({ type: 'del', text: midA[i++] })
    while (j < m) mid.push({ type: 'add', text: midB[j++] })
  }
  return [...head, ...mid, ...tail]
}

export function diffFiles(path: string, before: string | null, after: string | null): FileDiff {
  const a = split(before ?? '')
  const b = split(after ?? '')
  const ops = script(a, b)

  // number every line, then group changes with CONTEXT unchanged lines around them
  let oldNo = 1
  let newNo = 1
  const lines: DiffLine[] = ops.map((op) => {
    if (op.type === 'ctx') return { type: 'ctx', text: op.text, oldNo: oldNo++, newNo: newNo++ }
    if (op.type === 'del') return { type: 'del', text: op.text, oldNo: oldNo++, newNo: null }
    return { type: 'add', text: op.text, oldNo: null, newNo: newNo++ }
  })

  const changed = lines.map((l, i) => (l.type === 'ctx' ? -1 : i)).filter((i) => i >= 0)
  const hunks: DiffHunk[] = []
  let k = 0
  while (k < changed.length) {
    let from = Math.max(0, changed[k] - CONTEXT)
    let to = Math.min(lines.length - 1, changed[k] + CONTEXT)
    k++
    // changes close together share one hunk
    while (k < changed.length && changed[k] - CONTEXT <= to + 1) {
      to = Math.min(lines.length - 1, changed[k] + CONTEXT)
      k++
    }
    from = Math.max(0, from)
    const slice = lines.slice(from, to + 1)
    const first = slice[0]
    hunks.push({
      oldStart: first.oldNo ?? (slice.find((l) => l.oldNo !== null)?.oldNo ?? 1),
      newStart: first.newNo ?? (slice.find((l) => l.newNo !== null)?.newNo ?? 1),
      lines: slice
    })
  }

  return {
    path,
    action: before === null ? 'create' : after === null ? 'delete' : 'update',
    additions: lines.filter((l) => l.type === 'add').length,
    deletions: lines.filter((l) => l.type === 'del').length,
    hunks
  }
}
