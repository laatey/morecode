import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileDiff } from '@/components/diff-view'
import type { Settings } from '@/features/settings/settings-store'
import { AgentError } from './agent/errors'
import { mockAgent } from './agent/mock-agent'
import { SEED_DIFFS } from './sample-data'
import type {
  AgentEvent,
  AgentRunner,
  Attachment,
  Decision,
  ErrorKind,
  Msg,
  Part,
  PermissionRequest,
  PermissionState,
  ToolBlock
} from './types'

const uid = (): string => crypto.randomUUID().slice(0, 8)

const edit = (id: string, diff: FileDiff): ToolBlock => ({
  kind: 'edit',
  id,
  path: diff.path,
  added: diff.additions,
  removed: diff.deletions,
  status: 'done',
  review: 'pending',
  diff
})

/** Sample conversation the first chat starts with. */
export const DEMO_MESSAGES: Msg[] = [
  { id: 'm1', role: 'user', text: 'the easing feels bouncy — make it snap instead of overshoot' },
  {
    id: 'm2',
    role: 'agent',
    durationMs: 25000,
    tokens: 38500,
    parts: [
      {
        type: 'tool',
        tool: {
          kind: 'thinking',
          id: 'th0',
          status: 'done',
          durationMs: 4000,
          text: 'The bounce comes from the back-out easing curve overshooting the target. A hard stop needs a curve that never exceeds 1, so I will swap it for an ease-out and clamp the result.'
        }
      },
      { type: 'text', text: 'Swapping the back-out curve for a hard-stop snap.' },
      { type: 'tool', tool: edit('a', SEED_DIFFS.grid) },
      {
        type: 'tool',
        tool: {
          kind: 'command',
          id: 'b',
          label: 'Checked code style',
          command: 'npm run lint',
          status: 'done',
          output: '✔ no problems found'
        }
      },
      { type: 'tool', tool: edit('c', SEED_DIFFS.gridTwo) },
      { type: 'tool', tool: edit('d', SEED_DIFFS.easing) },
      {
        type: 'tool',
        tool: {
          kind: 'command',
          id: 'e',
          label: 'Checked types',
          command: 'npm run typecheck',
          status: 'done',
          output: 'Found 0 errors.'
        }
      },
      {
        type: 'tool',
        tool: {
          kind: 'todos',
          id: 'f',
          items: ['Read the implementation', 'Swap the curve', 'Verify'].map((text) => ({
            text,
            status: 'done' as const
          }))
        }
      },
      { type: 'text', text: 'Done.' }
    ]
  }
]

function applyEvent(
  msg: Extract<Msg, { role: 'agent' }>,
  e: AgentEvent,
  autoAccept: boolean
): Extract<Msg, { role: 'agent' }> {
  const parts: Part[] = [...msg.parts]
  if (e.type === 'tool') {
    let tool = e.tool
    // a finished edit waits for review, unless auto-accept is on
    if (tool.kind === 'edit' && tool.status === 'done' && !tool.review) {
      tool = { ...tool, review: autoAccept ? 'accepted' : 'pending' }
    }
    const i = parts.findIndex((p) => p.type === 'tool' && p.tool.id === tool.id)
    if (i >= 0) parts[i] = { type: 'tool', tool }
    else parts.push({ type: 'tool', tool })
    return { ...msg, parts }
  }
  if (e.type === 'text') {
    const last = parts[parts.length - 1]
    if (last?.type === 'text') parts[parts.length - 1] = { type: 'text', text: last.text + e.delta }
    else parts.push({ type: 'text', text: e.delta })
    return { ...msg, parts }
  }
  return { ...msg, tokens: (msg.tokens ?? 0) + e.tokens }
}

type AgentMsg = Extract<Msg, { role: 'agent' }>

const agentApi = (): Window['api']['agent'] | undefined =>
  typeof window === 'undefined' ? undefined : window.api?.agent

/** One line per thing the AI did, so a later turn knows what already happened. */
function toolLine(t: ToolBlock): string | null {
  if (t.kind === 'edit') return `[Edited ${t.path} (+${t.added} −${t.removed})${t.review === 'discarded' ? '; the person undid this change' : ''}]`
  if (t.kind === 'command') return `[Ran \`${t.command}\`${t.status === 'error' ? ' and it failed' : ''}]`
  if (t.kind === 'plan') return `[Showed a plan: ${t.title} (${t.state === 'approved' ? 'approved' : 'not yet approved'})]`
  if (t.kind === 'permission' && (t.state === 'denied' || t.state === 'blocked')) return `[The person did not allow: ${t.command}]`
  return null
}

/** The chat so far as plain text turns (what a real agent needs as context). */
export function toHistory(msgs: Msg[]): { role: 'user' | 'assistant'; text: string }[] {
  return msgs.flatMap<{ role: 'user' | 'assistant'; text: string }>((m) => {
    if (m.role === 'user') return [{ role: 'user' as const, text: m.text }]
    if (m.role !== 'agent') return []
    const lines = m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : p.type === 'tool' ? [toolLine(p.tool)] : []))
    const text = lines.filter(Boolean).join('\n')
    return text ? [{ role: 'assistant' as const, text }] : []
  })
}

/** Put files back the way they were before these messages (newest edit first, so repeated edits unwind). */
function undoEditsIn(msgs: Msg[]): void {
  const ids = msgs.flatMap((m) =>
    m.role === 'agent'
      ? m.parts.flatMap((p) => (p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review !== 'discarded' ? [p.tool.id] : []))
      : []
  )
  for (const id of ids.reverse()) void agentApi()?.revert(id)
}

/** Change one tool block, wherever it sits in the conversation. */
const mapTool = (all: Msg[], id: string, fn: (t: ToolBlock) => ToolBlock): Msg[] =>
  all.map((m) =>
    m.role !== 'agent'
      ? m
      : {
          ...m,
          parts: m.parts.map((p) =>
            p.type === 'tool' && p.tool.id === id ? { type: 'tool' as const, tool: fn(p.tool) } : p
          )
        }
  )

/** What the person's settings say about risky actions, read fresh whenever the agent asks. */
export interface Policy {
  rules: Settings['rules']
  allowed: string[]
  remember: (command: string) => void
  notify: (title: string, body?: string) => void
}

export interface ChatTotals {
  /** Lines and files in edits that are still waiting for review. */
  added: number
  removed: number
  files: number
  tokens: number
}

export function useChat(
  runner: AgentRunner = mockAgent,
  initial: Msg[] = [],
  initialOwner = '',
  getPolicy?: () => Policy
): {
  messages: Msg[]
  /** Which chat `messages` belong to; changes in the same render as the messages. */
  owner: string
  /** Swap in another chat's messages (stops any run in progress). */
  load: (owner: string, messages: Msg[]) => void
  running: boolean
  totals: ChatTotals
  reviewOne: (toolId: string, to: 'accepted' | 'discarded') => void
  approvePlan: (toolId: string) => void
  decide: (toolId: string, decision: Decision) => void
  send: (
    prompt: string,
    images: string[],
    model: string,
    autoAccept: boolean,
    attachments?: Attachment[]
  ) => void
  /** Run the message before this reply again. */
  retry: (agentId: string, model: string, autoAccept: boolean) => void
  /** Replace a sent message and run it again from there. */
  edit: (userId: string, text: string, model: string, autoAccept: boolean) => void
  /** Go back to before a message was sent. Returns the message so it can be put back in the box. */
  rewind: (userId: string) => Extract<Msg, { role: 'user' }> | null
  rate: (agentId: string, value: 'up' | 'down') => void
  acceptAll: () => void
  discardAll: () => void
  stop: () => void
  clear: () => void
  compact: () => void
} {
  const [messages, setMessages] = useState<Msg[]>(initial)
  const [owner, setOwner] = useState(initialOwner)
  const [running, setRunning] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const latest = useRef<Msg[]>(initial)
  const waiting = useRef(new Map<string, (d: Decision) => void>())

  useEffect(() => {
    latest.current = messages
  }, [messages])

  const run = useCallback(
    (
      base: Msg[],
      prompt: string,
      images: string[],
      attachments: Attachment[],
      model: string,
      autoAccept: boolean
    ) => {
      if (controller.current) return
      const agentId = uid()
      const started = Date.now()
      const user: Msg = {
        id: uid(),
        role: 'user',
        text: prompt,
        ...(images.length ? { images } : {}),
        ...(attachments.length ? { attachments } : {})
      }

      // no connection: say so straight away instead of starting a run that cannot work
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setMessages([
          ...base,
          user,
          {
            id: agentId,
            role: 'agent',
            parts: [{ type: 'error', kind: 'offline', message: 'No internet connection.', at: started }]
          }
        ])
        return
      }

      const ctl = new AbortController()
      controller.current = ctl
      setRunning(true)
      setMessages([...base, user, { id: agentId, role: 'agent', parts: [], running: true, startedAt: started }])

      const patch = (fn: (m: AgentMsg) => AgentMsg): void =>
        setMessages((all) => all.map((m) => (m.id === agentId && m.role === 'agent' ? fn(m) : m)))

      const askPermission = (req: PermissionRequest): Promise<Decision> => {
        const policy = getPolicy?.()
        const rule = policy?.rules[req.action === 'command' ? 'commands' : req.action] ?? 'ask'
        const show = (state: PermissionState): void =>
          patch((m) => applyEvent(m, { type: 'tool', tool: { kind: 'permission', state, ...req } }, autoAccept))
        if (rule === 'block') {
          show('blocked')
          return Promise.resolve('deny')
        }
        if (rule === 'allow' || policy?.allowed.includes(req.command)) return Promise.resolve('once')
        show('pending')
        policy?.notify('MoreCode needs your OK', req.title)
        return new Promise<Decision>((resolve) => {
          waiting.current.set(req.id, resolve)
          ctl.signal.addEventListener(
            'abort',
            () => {
              waiting.current.delete(req.id)
              resolve('deny')
            },
            { once: true }
          )
        })
      }

      void (async () => {
        let failed = false
        try {
          for await (const e of runner({
            prompt,
            images,
            attachments,
            model,
            history: toHistory(base),
            signal: ctl.signal,
            askPermission
          })) {
            patch((m) => applyEvent(m, e, autoAccept))
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            failed = true
            const known = err instanceof AgentError
            const kind: ErrorKind = known ? err.kind : 'failed'
            const message = known ? err.message : 'Something went wrong running that request.'
            const retryAfter = known ? err.retryAfter : undefined
            patch((m) => ({
              ...m,
              parts: [...m.parts, { type: 'error', kind, message, retryAfter, at: Date.now() }]
            }))
          }
        } finally {
          const stopped = ctl.signal.aborted
          // anything still waiting or running when we stop (or fail) is closed off
          patch((m) => ({
            ...m,
            running: false,
            stopped,
            durationMs: Date.now() - started,
            parts: m.parts.map((p): Part => {
              if (p.type !== 'tool') return p
              const t = p.tool
              if (t.kind === 'permission' && t.state === 'pending') {
                return { type: 'tool', tool: { ...t, state: 'denied' } }
              }
              if ('status' in t && t.status === 'running') {
                return { type: 'tool', tool: { ...t, status: stopped || failed ? 'error' : 'done' } as ToolBlock }
              }
              return p
            })
          }))
          controller.current = null
          setRunning(false)
        }
      })()
    },
    [runner, getPolicy]
  )

  const send = useCallback(
    (prompt: string, images: string[], model: string, autoAccept: boolean, attachments: Attachment[] = []) =>
      run(latest.current, prompt, images, attachments, model, autoAccept),
    [run]
  )

  /** Run again from a sent message, optionally with new wording. */
  const redo = useCallback(
    (userId: string, text: string | undefined, model: string, autoAccept: boolean) => {
      const all = latest.current
      const i = all.findIndex((m) => m.id === userId)
      const u = all[i]
      if (i < 0 || !u || u.role !== 'user') return
      undoEditsIn(all.slice(i)) // running it again starts from the files as they were
      run(all.slice(0, i), text ?? u.text, u.images ?? [], u.attachments ?? [], model, autoAccept)
    },
    [run]
  )
  const retry = useCallback(
    (agentId: string, model: string, autoAccept: boolean) => {
      const all = latest.current
      const i = all.findIndex((m) => m.id === agentId)
      for (let j = i - 1; j >= 0; j--) {
        if (all[j].role === 'user') return redo(all[j].id, undefined, model, autoAccept)
      }
    },
    [redo]
  )
  const edit = useCallback(
    (userId: string, text: string, model: string, autoAccept: boolean) => redo(userId, text, model, autoAccept),
    [redo]
  )
  const rewind = useCallback((userId: string) => {
    const all = latest.current
    const i = all.findIndex((m) => m.id === userId)
    const u = all[i]
    if (i < 0 || !u || u.role !== 'user') return null
    controller.current?.abort()
    undoEditsIn(all.slice(i))
    setMessages(all.slice(0, i))
    return u
  }, [])

  const stop = useCallback(() => controller.current?.abort(), [])
  const load = useCallback((id: string, list: Msg[]) => {
    controller.current?.abort()
    latest.current = list
    setMessages(list)
    setOwner(id)
  }, [])
  const clear = useCallback(() => {
    controller.current?.abort()
    setMessages([])
  }, [])
  const compact = useCallback(
    () =>
      setMessages((m) => [
        {
          id: uid(),
          role: 'system',
          text: `Conversation compacted (${m.length} messages summarised).`
        }
      ]),
    []
  )

  const review = useCallback((to: 'accepted' | 'discarded') => {
    const pending = latest.current.flatMap((m) =>
      m.role === 'agent'
        ? m.parts.flatMap((p) => (p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review === 'pending' ? [p.tool.id] : []))
        : []
    )
    if (to === 'discarded') [...pending].reverse().forEach((id) => void agentApi()?.revert(id))
    else pending.forEach((id) => agentApi()?.keep(id))
    setMessages((all) =>
      all.map((m) =>
        m.role !== 'agent'
          ? m
          : {
              ...m,
              parts: m.parts.map((p) =>
                p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review === 'pending'
                  ? { type: 'tool' as const, tool: { ...p.tool, review: to } }
                  : p
              )
            }
      )
    )
  }, [])
  const reviewOne = useCallback((toolId: string, to: 'accepted' | 'discarded') => {
    if (to === 'discarded') void agentApi()?.revert(toolId)
    else agentApi()?.keep(toolId)
    setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'edit' ? { ...t, review: to } : t)))
  }, [])
  const acceptAll = useCallback(() => review('accepted'), [review])
  const discardAll = useCallback(() => review('discarded'), [review])

  const approvePlan = useCallback((toolId: string) => {
    setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'plan' ? { ...t, state: 'approved' } : t)))
  }, [])

  const decide = useCallback(
    (toolId: string, decision: Decision) => {
      const resolve = waiting.current.get(toolId)
      if (!resolve) return
      waiting.current.delete(toolId)
      const state: PermissionState =
        decision === 'deny' ? 'denied' : decision === 'always' ? 'always' : 'allowed'
      if (decision === 'always') {
        for (const m of latest.current) {
          if (m.role !== 'agent') continue
          for (const p of m.parts) {
            if (p.type === 'tool' && p.tool.id === toolId && p.tool.kind === 'permission') {
              getPolicy?.().remember(p.tool.command)
            }
          }
        }
      }
      setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'permission' ? { ...t, state } : t)))
      resolve(decision)
    },
    [getPolicy]
  )

  const rate = useCallback((agentId: string, value: 'up' | 'down') => {
    setMessages((all) =>
      all.map((m) =>
        m.id === agentId && m.role === 'agent'
          ? { ...m, feedback: m.feedback === value ? undefined : value }
          : m
      )
    )
  }, [])

  const totals = useMemo<ChatTotals>(() => {
    let added = 0
    let removed = 0
    let tokens = 0
    const files = new Set<string>()
    for (const m of messages) {
      if (m.role !== 'agent') continue
      tokens += m.tokens ?? 0
      for (const p of m.parts) {
        if (p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review === 'pending') {
          added += p.tool.added
          removed += p.tool.removed
          files.add(p.tool.path)
        }
      }
    }
    return { added, removed, files: files.size, tokens }
  }, [messages])

  return {
    messages,
    owner,
    load,
    running,
    totals,
    reviewOne,
    approvePlan,
    decide,
    send,
    retry,
    edit,
    rewind,
    rate,
    acceptAll,
    discardAll,
    stop,
    clear,
    compact
  }
}
