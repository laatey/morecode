import type { FileDiff } from '@/components/diff-view'
import { AgentError } from './errors'
import type { AgentEvent, AgentRunner, TodoItem, ToolBlock } from '../types'

/**
 * Stand-in for a real agent backend. It streams the same events a real one would
 * (tools starting/finishing, text, token usage), so the UI is already wired for it.
 * To go live, write another AgentRunner (e.g. over IPC to the main process) and pass it to useChat.
 */

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true }
    )
  })

function diff(path: string, removed: string[], added: string[]): FileDiff {
  const ctxBefore = ['', 'export function snap(value: number, grid: number) {']
  const ctxAfter = ['}']
  const lines = [
    ...ctxBefore.map((text, i) => ({ type: 'ctx' as const, text, oldNo: 10 + i, newNo: 10 + i })),
    ...removed.map((text, i) => ({ type: 'del' as const, text, oldNo: 12 + i, newNo: null })),
    ...added.map((text, i) => ({ type: 'add' as const, text, oldNo: null, newNo: 12 + i })),
    ...ctxAfter.map((text, i) => ({
      type: 'ctx' as const,
      text,
      oldNo: 12 + removed.length + i,
      newNo: 12 + added.length + i
    }))
  ]
  return {
    path,
    action: 'update',
    additions: added.length,
    deletions: removed.length,
    hunks: [{ oldStart: 10, newStart: 10, lines }]
  }
}

const todos = (done: number): TodoItem[] =>
  ['Read the current implementation', 'Update the snapping logic', 'Run lint and typecheck'].map(
    (text, i) => ({ text, status: i < done ? 'done' : i === done ? 'active' : 'pending' })
  )

export const mockAgent: AgentRunner = async function* ({
  prompt,
  attachments,
  signal,
  askPermission
}) {
  const emit = (e: AgentEvent): AgentEvent => e

  // Try these in the message box to see each error state:
  //   "simulate rate limit", "simulate failure"
  if (/simulate rate ?limit/i.test(prompt)) {
    await sleep(500, signal)
    throw new AgentError('rate_limit', 'You have sent a lot of requests in a short time.', 30)
  }
  // ids must be unique per run so reviewing one edit never touches an earlier message
  const run = crypto.randomUUID().slice(0, 6)
  const edit = (id: string, path: string, d: FileDiff, status: 'running' | 'done'): ToolBlock => ({
    kind: 'edit',
    id,
    path,
    added: d.additions,
    removed: d.deletions,
    status,
    diff: d
  })

  // reasoning first: text streams in while the block shows "Thinking…"
  const thoughts = [
    'Looking at how the request maps onto the code. ',
    'The snap logic lives in the grid component and the curve in the easing helpers. ',
    'I will change the curve first, then tighten the threshold, then run the checks.'
  ]
  const thinkStart = Date.now()
  let thought = ''
  for (const chunk of thoughts) {
    thought += chunk
    yield emit({
      type: 'tool',
      tool: { kind: 'thinking', id: `think-${run}`, text: thought, status: 'running' }
    })
    await sleep(450, signal)
  }
  yield emit({
    type: 'tool',
    tool: {
      kind: 'thinking',
      id: `think-${run}`,
      text: thought,
      status: 'done',
      durationMs: Date.now() - thinkStart
    }
  })

  // "/plan" style requests only produce a plan; nothing is changed until it is approved
  if (/do not change any files/i.test(prompt)) {
    yield emit({
      type: 'tool',
      tool: {
        kind: 'plan',
        id: `plan-${run}`,
        title: 'Make the grid snap instead of bounce',
        summary:
          'Replace the overshooting curve with a hard stop and make snapping feel firm, without changing how the grid is laid out.',
        steps: [
          'Replace the bouncy easing curve with a smooth ease-out that never overshoots',
          'Clamp the animation so it stops exactly on the grid line',
          'Only snap when the item is close to a line, so dragging stays free',
          'Run the style and type checks',
          'Try it in the browser tab and adjust the feel'
        ],
        state: 'draft'
      }
    })
    yield emit({ type: 'usage', tokens: 2100 })
    for (const word of 'Here is a plan. Approve it in the Plan tab and I will start, or tell me what to change.'.split(
      /(?<= )/
    )) {
      await sleep(25, signal)
      yield emit({ type: 'text', delta: word })
    }
    return
  }

  // files the person @-mentioned or attached are read first
  const mentioned = [
    ...(prompt.match(/(?<=^|\s)@[^\s@]+/g) ?? []).map((m) => m.slice(1)),
    ...attachments.map((a) => a.name)
  ]
  if (mentioned.length) {
    const paths = [...new Set(mentioned)]
    yield emit({ type: 'tool', tool: { kind: 'read', id: `r-${run}`, paths, status: 'running' } })
    await sleep(600, signal)
    yield emit({ type: 'tool', tool: { kind: 'read', id: `r-${run}`, paths, status: 'done' } })
  }

  // adding packages needs a yes first
  if (/\b(install|dependenc|package)/i.test(prompt)) {
    const answer = await askPermission({
      id: `p-install-${run}`,
      action: 'install',
      title: 'Install packages',
      command: 'npm install',
      reason: 'The change needs libraries that are not in your project yet.'
    })
    if (answer === 'deny') {
      for (const word of 'Okay, I will not install anything. Tell me if you would like another approach.'.split(
        /(?<= )/
      )) {
        await sleep(25, signal)
        yield emit({ type: 'text', delta: word })
      }
      return
    }
    yield emit({
      type: 'tool',
      tool: { kind: 'command', id: `c0-${run}`, label: 'Installed packages', command: 'npm install', status: 'running' }
    })
    await sleep(1000, signal)
    yield emit({
      type: 'tool',
      tool: {
        kind: 'command',
        id: `c0-${run}`,
        label: 'Installed packages',
        command: 'npm install',
        status: 'done',
        output: 'added 12 packages in 3s'
      }
    })
  }

  yield emit({ type: 'tool', tool: { kind: 'todos', id: `t-${run}`, items: todos(0) } })
  await sleep(300, signal)

  const d1 = diff(
    'src/components/AlignmentGrid.tsx',
    ['  return Math.round(value / grid) * grid'],
    [
      '  const snapped = Math.round(value / grid) * grid',
      '  return Math.abs(snapped - value) < grid / 4 ? snapped : value'
    ]
  )
  yield emit({ type: 'tool', tool: edit(`e1-${run}`, d1.path, d1, 'running') })
  await sleep(700, signal)
  yield emit({ type: 'tool', tool: edit(`e1-${run}`, d1.path, d1, 'done') })
  yield emit({ type: 'usage', tokens: 4200 })

  // running the checks needs a yes too; one answer covers both
  const checks = await askPermission({
    id: `p-checks-${run}`,
    action: 'command',
    title: 'Run code checks',
    command: 'npm run lint && npm run typecheck',
    reason: 'To make sure the change did not break anything.'
  })
  if (checks === 'deny') {
    for (const word of 'I made the change but skipped the checks, since you did not allow them.'.split(/(?<= )/)) {
      await sleep(25, signal)
      yield emit({ type: 'text', delta: word })
    }
    return
  }

  yield emit({
    type: 'tool',
    tool: {
      kind: 'command',
      id: `c1-${run}`,
      label: 'Checked code style',
      command: 'npm run lint',
      status: 'running'
    }
  })
  await sleep(800, signal)
  if (/simulate fail/i.test(prompt)) {
    yield emit({
      type: 'tool',
      tool: {
        kind: 'command',
        id: `c1-${run}`,
        label: 'Code style check failed',
        command: 'npm run lint',
        status: 'error',
        output: "src/lib/easing.ts\n  3:7  error  'cubic' is defined but never used"
      }
    })
    throw new AgentError('failed', 'The code style check found a problem.')
  }
  yield emit({
    type: 'tool',
    tool: {
      kind: 'command',
      id: `c1-${run}`,
      label: 'Checked code style',
      command: 'npm run lint',
      status: 'done',
      output: '✔ no problems found'
    }
  })
  yield emit({ type: 'tool', tool: { kind: 'todos', id: `t-${run}`, items: todos(2) } })

  const d2 = diff(
    'src/lib/easing.ts',
    ['export const ease = cubic(0.34, 1.56, 0.64, 1)'],
    ['export const ease = cubic(0.2, 0.8, 0.2, 1)']
  )
  yield emit({ type: 'tool', tool: edit(`e2-${run}`, d2.path, d2, 'running') })
  await sleep(600, signal)
  yield emit({ type: 'tool', tool: edit(`e2-${run}`, d2.path, d2, 'done') })

  yield emit({
    type: 'tool',
    tool: {
      kind: 'command',
      id: `c2-${run}`,
      label: 'Checked types',
      command: 'npm run typecheck',
      status: 'running'
    }
  })
  await sleep(900, signal)
  yield emit({
    type: 'tool',
    tool: {
      kind: 'command',
      id: `c2-${run}`,
      label: 'Checked types',
      command: 'npm run typecheck',
      status: 'done',
      output: 'Found 0 errors.'
    }
  })
  yield emit({ type: 'tool', tool: { kind: 'todos', id: `t-${run}`, items: todos(3) } })
  yield emit({ type: 'usage', tokens: 6800 })

  const reply = `Done. I handled **${prompt.slice(0, 80)}** by tightening the snap threshold and swapping the bouncy curve for a hard stop. Everything checks out.`
  for (const word of reply.split(/(?<= )/)) {
    await sleep(25, signal)
    yield emit({ type: 'text', delta: word })
  }
}
