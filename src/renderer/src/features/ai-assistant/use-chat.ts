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
  PermissionAction,
  PermissionRequest,
  PermissionState,
  QuestionAnswer,
  QuestionRequest,
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

/** Older chats may hold "[Edited x]" lines a model typed as text. They are not history, so they are dropped. */
const FAKE_ACTIVITY = /\[(?:Edited|Ran|Showed a plan|The person did not allow)[^\]]*\]/g

/** The chat so far as plain text turns. A compaction summary replaces everything before it. */
export function toHistory(msgs: Msg[]): { role: 'user' | 'assistant'; text: string }[] {
  const out: { role: 'user' | 'assistant'; text: string }[] = []
  for (const m of msgs) {
    if (m.role === 'system') {
      if (m.summary) {
        out.length = 0
        out.push({ role: 'user', text: `Summary of the earlier conversation, so you keep the context:\n${m.summary}` })
      }
    } else if (m.role === 'user') out.push({ role: 'user', text: m.text })
    else {
      const text = m.parts
        .flatMap((p) => (p.type === 'text' ? [p.text.replace(FAKE_ACTIVITY, '').trim()] : []))
        .filter(Boolean)
        .join('\n')
      if (text) out.push({ role: 'assistant', text })
    }
  }
  return out
}

/**
 * What the AI really did so far, as facts: files, commands, the task list, the plan and how the last run ended.
 * Sent with every request so "continue" resumes the work instead of starting over.
 */
export function progressOf(msgs: Msg[]): string {
  const files = new Map<string, string>()
  const commands: string[] = []
  let todos: Extract<ToolBlock, { kind: 'todos' }> | null = null
  let plan: Extract<ToolBlock, { kind: 'plan' }> | null = null
  let lastEnd = ''
  for (const m of msgs) {
    if (m.role !== 'agent') continue
    lastEnd = ''
    for (const p of m.parts) {
      if (p.type === 'error') lastEnd = `The last run was cut short: ${p.message}`
      if (p.type !== 'tool') continue
      const t = p.tool
      if (t.kind === 'edit' && t.status === 'done') files.set(t.path, t.review === 'discarded' ? 'undone by the person' : 'written')
      else if (t.kind === 'command') commands.push(`${t.command} → ${t.status === 'error' ? `FAILED${t.output ? `: ${t.output.trim().slice(-160)}` : ''}` : t.status === 'done' ? 'ok' : 'did not finish'}`)
      else if (t.kind === 'todos') todos = t
      else if (t.kind === 'plan') plan = t
    }
    if (m.stopped && !lastEnd) lastEnd = 'The person stopped the last run before it finished.'
  }
  const out: string[] = []
  if (plan) out.push(`Plan: ${plan.title} (${plan.state === 'approved' ? 'approved by the person' : 'not approved yet'}).`)
  if (todos) out.push(`Task list:\n${todos.items.map((i) => `- ${i.status === 'done' ? 'done' : i.status === 'active' ? 'in progress' : 'to do'}: ${i.text}`).join('\n')}`)
  if (files.size) out.push(`Files the AI has written in this chat:\n${[...files].slice(-40).map(([f, how]) => `- ${f} (${how})`).join('\n')}`)
  if (commands.length) out.push(`Recent commands:\n${commands.slice(-8).map((c) => `- ${c}`).join('\n')}`)
  if (lastEnd) out.push(lastEnd)
  return out.join('\n\n').slice(0, 4000)
}

/** Put files back the way they were before these messages (newest edit first, so repeated edits unwind). */
function undoEditsIn(msgs: Msg[], onEditReverted?: (id: string) => void): void {
  const ids = msgs.flatMap((m) =>
    m.role === 'agent'
      ? m.parts.flatMap((p) => (p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review !== 'discarded' ? [p.tool.id] : []))
      : []
  )
  for (const id of ids.reverse()) {
    void agentApi()?.revert(id)
    onEditReverted?.(id)
  }
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

/** The setting that governs each kind of action. */
export const ruleKey = (action: PermissionAction): keyof Settings['rules'] => (action === 'command' ? 'commands' : action)

/** Kinds of action where "Always allow" means "stop asking about this kind", not "allow this exact text". */
const WHOLE_KIND: PermissionAction[] = ['browse', 'web', 'git']

/** What the person's settings say about risky actions, read fresh whenever the agent asks. */
export interface Policy {
  rules: Settings['rules']
  allowed: string[]
  remember: (command: string) => void
  /** "Always allow" for a whole kind of action (browsing, searching, git): switches its rule to allow. */
  allowAction: (action: keyof Settings['rules']) => void
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
  getPolicy?: () => Policy,
  onEdit?: (tool: Extract<ToolBlock, { kind: 'edit' }>) => void,
  onEditReverted?: (id: string) => void
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
  markRoutine: (toolId: string, savedId: string | undefined) => void
  decide: (toolId: string, decision: Decision) => void
  /** Questions the AI is waiting on, shown above the message box. */
  question: QuestionRequest | null
  answerQuestion: (id: string, answers: QuestionAnswer[] | null) => void
  send: (
    prompt: string,
    images: string[],
    model: string,
    autoAccept: boolean,
    attachments?: Attachment[],
    shown?: string
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
  /** Write a summary of the chat so far and use it as the AI's memory of it. The chat itself stays on screen. */
  compact: (model: string) => void
} {
  const [messages, setMessages] = useState<Msg[]>(initial)
  const [owner, setOwner] = useState(initialOwner)
  const [running, setRunning] = useState(false)
  const [question, setQuestion] = useState<QuestionRequest | null>(null)
  const questionWaiting = useRef<{ id: string; resolve: (a: QuestionAnswer[] | null) => void } | null>(null)
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
      autoAccept: boolean,
      shown?: string
    ) => {
      if (controller.current) return
      const agentId = uid()
      const started = Date.now()
      const user: Msg = {
        id: uid(),
        role: 'user',
        text: prompt,
        ...(shown ? { shown } : {}),
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
        const rule = policy?.rules[ruleKey(req.action)] ?? 'ask'
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

      const askQuestion = (req: QuestionRequest): Promise<QuestionAnswer[] | null> =>
        new Promise((resolve) => {
          questionWaiting.current = { id: req.id, resolve }
          setQuestion(req)
          getPolicy?.().notify('MoreCode has a question', req.items[0]?.question)
          ctl.signal.addEventListener(
            'abort',
            () => {
              if (questionWaiting.current?.id === req.id) questionWaiting.current = null
              setQuestion((q) => (q?.id === req.id ? null : q))
              resolve(null)
            },
            { once: true }
          )
        })

      void (async () => {
        let failed = false
        try {
          for await (const e of runner({
            prompt,
            images,
            attachments,
            model,
            history: toHistory(base),
            progress: progressOf(base),
            signal: ctl.signal,
            askPermission,
            askQuestion
          })) {
            if (e.type === 'tool' && e.tool.kind === 'edit' && e.tool.status === 'done') onEdit?.(e.tool)
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
              if (t.kind === 'question' && t.state === 'pending') {
                return { type: 'tool', tool: { ...t, state: 'skipped' } }
              }
              if ('status' in t && t.status === 'running') {
                return { type: 'tool', tool: { ...t, status: stopped || failed ? 'error' : 'done' } as ToolBlock }
              }
              return p
            })
          }))
          controller.current = null
          questionWaiting.current = null
          setQuestion(null)
          setRunning(false)
        }
      })()
    },
    [runner, getPolicy, onEdit]
  )

  const send = useCallback(
    (prompt: string, images: string[], model: string, autoAccept: boolean, attachments: Attachment[] = [], shown?: string) =>
      run(latest.current, prompt, images, attachments, model, autoAccept, shown),
    [run]
  )

  /** Run again from a sent message, optionally with new wording. */
  const redo = useCallback(
    (userId: string, text: string | undefined, model: string, autoAccept: boolean) => {
      const all = latest.current
      const i = all.findIndex((m) => m.id === userId)
      const u = all[i]
      if (i < 0 || !u || u.role !== 'user') return
      undoEditsIn(all.slice(i), onEditReverted) // running it again starts from the files as they were
      run(all.slice(0, i), text ?? u.text, u.images ?? [], u.attachments ?? [], model, autoAccept, text === undefined ? u.shown : undefined)
    },
    [run, onEditReverted]
  )
  const retry = useCallback(
    (agentId: string, model: string, autoAccept: boolean) => {
      const all = latest.current
      const i = all.findIndex((m) => m.id === agentId)
      const msg = all[i]
      // a run that already did work is continued, never wiped: its edits and tool rows stay put
      if (msg?.role === 'agent' && i === all.length - 1 && msg.parts.some((p) => p.type === 'error') && msg.parts.some((p) => p.type === 'tool' && ['edit', 'command', 'todos'].includes(p.tool.kind))) {
        const kept = all.map((m) => (m.id === agentId && m.role === 'agent' ? { ...m, parts: m.parts.filter((p) => p.type !== 'error') } : m))
        return run(kept, 'Continue from where you stopped. Do not redo work that is already done.', [], [], model, autoAccept, 'Continue')
      }
      for (let j = i - 1; j >= 0; j--) {
        if (all[j].role === 'user') return redo(all[j].id, undefined, model, autoAccept)
      }
    },
    [redo, run]
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
    undoEditsIn(all.slice(i), onEditReverted)
    setMessages(all.slice(0, i))
    return u
  }, [onEditReverted])

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
    (model: string) => {
      if (controller.current) return
      const all = latest.current
      const noteId = uid()
      const note = (text: string, summary?: string): void =>
        setMessages((cur) => cur.map((m) => (m.id === noteId ? { id: noteId, role: 'system' as const, text, ...(summary ? { summary } : {}) } : m)))
      if (!all.some((m) => m.role === 'user')) {
        setMessages([...all, { id: noteId, role: 'system', text: 'Nothing to compact yet.' }])
        return
      }
      const ctl = new AbortController()
      controller.current = ctl
      setRunning(true)
      setMessages([...all, { id: noteId, role: 'system', text: 'Compacting the conversation…' }])
      void (async () => {
        let summary = ''
        try {
          for await (const e of runner({
            prompt:
              'Write a summary of this conversation so far, to replace the earlier messages. Cover: what the person wants, decisions made, files created or changed (with paths), commands run and how they went, anything still open, and the next steps. Plain sentences and short lists, under 350 words. Do not use any tools.',
            images: [],
            attachments: [],
            model,
            history: toHistory(all),
            progress: progressOf(all),
            noTools: true,
            signal: ctl.signal,
            askPermission: () => Promise.resolve('deny')
          })) {
            if (e.type === 'text') summary += e.delta
          }
          summary = summary.trim()
          if (ctl.signal.aborted) note('Compacting was stopped. Nothing changed.')
          else if (!summary) note('Could not compact the conversation (no summary came back). Nothing changed.')
          else note(`Conversation compacted. ${all.length} earlier messages are summarised for the AI; nothing was removed from this chat.`, summary)
        } catch (err) {
          if ((err as Error).name === 'AbortError') note('Compacting was stopped. Nothing changed.')
          else note(`Could not compact the conversation${err instanceof AgentError ? `: ${err.message}` : ''}. Nothing changed.`)
        } finally {
          controller.current = null
          setRunning(false)
        }
      })()
    },
    [runner]
  )

  const review = useCallback(
    (to: 'accepted' | 'discarded') => {
      const pending = latest.current.flatMap((m) =>
        m.role === 'agent'
          ? m.parts.flatMap((p) =>
              p.type === 'tool' && p.tool.kind === 'edit' && p.tool.review === 'pending' ? [p.tool.id] : []
            )
          : []
      )
      if (to === 'discarded')
        [...pending].reverse().forEach((id) => {
          void agentApi()?.revert(id)
          onEditReverted?.(id)
        })
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
    },
    [onEditReverted]
  )
  const reviewOne = useCallback((toolId: string, to: 'accepted' | 'discarded') => {
    if (to === 'discarded') {
      void agentApi()?.revert(toolId)
      onEditReverted?.(toolId)
    } else agentApi()?.keep(toolId)
    setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'edit' ? { ...t, review: to } : t)))
  }, [onEditReverted])
  const acceptAll = useCallback(() => review('accepted'), [review])
  const discardAll = useCallback(() => review('discarded'), [review])

  /** Remember which saved routine a draft in the chat became (or clear it after an undo). */
  const markRoutine = useCallback((toolId: string, savedId: string | undefined) => {
    setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'routine-draft' ? { ...t, savedId } : t)))
  }, [])

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
              if (WHOLE_KIND.includes(p.tool.action)) getPolicy?.().allowAction(ruleKey(p.tool.action))
              else getPolicy?.().remember(p.tool.command)
            }
          }
        }
      }
      setMessages((all) => mapTool(all, toolId, (t) => (t.kind === 'permission' ? { ...t, state } : t)))
      resolve(decision)
    },
    [getPolicy]
  )

  /** The person answered (or skipped, with null) the question above the message box. */
  const answerQuestion = useCallback((id: string, answers: QuestionAnswer[] | null) => {
    const w = questionWaiting.current
    if (!w || w.id !== id) return
    questionWaiting.current = null
    setQuestion(null)
    w.resolve(answers)
  }, [])

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
    let tokens = 0
    // per file: the real net change, so rewriting the same file five times counts once
    const byPath = new Map<string, { a: number; r: number; net: boolean }>()
    for (const m of messages) {
      if (m.role !== 'agent') continue
      tokens += m.tokens ?? 0
      for (const p of m.parts) {
        if (p.type !== 'tool' || p.tool.kind !== 'edit' || p.tool.review !== 'pending') continue
        const t = p.tool
        const prev = byPath.get(t.path)
        if (t.netAdded !== undefined && t.netRemoved !== undefined) byPath.set(t.path, { a: t.netAdded, r: t.netRemoved, net: true })
        else byPath.set(t.path, { a: (prev && !prev.net ? prev.a : 0) + t.added, r: (prev && !prev.net ? prev.r : 0) + t.removed, net: false })
      }
    }
    let added = 0
    let removed = 0
    for (const v of byPath.values()) {
      added += v.a
      removed += v.r
    }
    return { added, removed, files: byPath.size, tokens }
  }, [messages])

  return {
    messages,
    owner,
    load,
    running,
    totals,
    reviewOne,
    approvePlan,
    markRoutine,
    decide,
    question,
    answerQuestion,
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
