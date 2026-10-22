import type { FileDiff } from '@/components/diff-view'

/** Small helper so demo edits carry a real diff the Changes tab can show. */
export function makeDiff(
  path: string,
  startLine: number,
  removed: string[],
  added: string[],
  before: string[] = [],
  after: string[] = []
): FileDiff {
  const lines = [
    ...before.map((text, i) => ({
      type: 'ctx' as const,
      text,
      oldNo: startLine + i,
      newNo: startLine + i
    })),
    ...removed.map((text, i) => ({
      type: 'del' as const,
      text,
      oldNo: startLine + before.length + i,
      newNo: null
    })),
    ...added.map((text, i) => ({
      type: 'add' as const,
      text,
      oldNo: null,
      newNo: startLine + before.length + i
    })),
    ...after.map((text, i) => ({
      type: 'ctx' as const,
      text,
      oldNo: startLine + before.length + removed.length + i,
      newNo: startLine + before.length + added.length + i
    }))
  ]
  return {
    path,
    action: 'update',
    additions: added.length,
    deletions: removed.length,
    hunks: [{ oldStart: startLine, newStart: startLine, lines }]
  }
}

export const SEED_DIFFS = {
  grid: makeDiff(
    'src/components/AlignmentGrid.tsx',
    38,
    ['  const eased = easeOutBack(t)', '  return start + (end - start) * eased'],
    [
      '  // hard stop: no overshoot past the target',
      '  const eased = Math.min(1, easeOutQuart(t))',
      '  return start + (end - start) * eased'
    ],
    ['export function animateTo(start: number, end: number, t: number) {'],
    ['}']
  ),
  gridTwo: makeDiff(
    'src/components/AlignmentGrid.tsx',
    71,
    ['    setPos(snapTo(value))'],
    ['    setPos(snapTo(value, GRID_STEP))', '    onSnap?.(value)'],
    ['  const handleRelease = (value: number) => {'],
    ['  }']
  ),
  easing: makeDiff(
    'src/lib/easing.ts',
    1,
    [],
    [
      'export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4)',
      '',
      '/** Kept for reference: the bouncy curve we replaced. */',
      'export const easeOutBack = (t: number): number => {',
      '  const c1 = 1.70158',
      '  const c3 = c1 + 1',
      '  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)',
      '}'
    ]
  )
}
