import type { AgentEvent, AgentRunner, ToolBlock } from '../types'
import { AgentError } from './errors'

type Api = Window['api']['agent']
type Message = Parameters<Parameters<Api['onEvent']>[0]>[0]
export type UsageDetail = Extract<Extract<Message, { kind: 'evt' }>['evt'], { type: 'usage' }>['detail']

export interface RealConfig {
  /** Null when no key has been added yet. */
  apiKey: string | null
  style: 'new' | 'some' | 'pro'
  /** Set when the AI is reached through the MoreCode server instead of directly. */
  baseUrl?: string
  hosted?: boolean
  /** What is missing before this can run (shown in the chat when there is no key or sign-in). */
  missing?: string | null
  /** Set only for a chat that was explicitly added to a project. */
  projectPath?: string
  /** Called with the real token counts after every step the AI takes. */
  onUsage: (detail: UsageDetail) => void
}

/**
 * The real AI. The work happens in the main process (it can touch your files and keep your key
 * out of the page); this turns its messages into the events the chat already understands.
 */
export function makeRealRunner(getConfig: () => RealConfig): AgentRunner {
  return async function* (req): AsyncGenerator<AgentEvent> {
    const api = window.api.agent
    const cfg = getConfig()
    if (!cfg.apiKey) {
      throw new AgentError(
        'failed',
        cfg.missing ?? 'Add your API key in Settings, under Models, to start chatting.'
      )
    }

    const runId = crypto.randomUUID()
    const queue: Message[] = []
    let wake: (() => void) | null = null
    const push = (m: Message): void => {
      queue.push(m)
      wake?.()
      wake = null
    }

    // permission questions are answered as they arrive, without holding up the stream
    const off = api.onEvent((m) => {
      if (m.runId !== runId) return
      if (m.kind === 'ask') {
        void req.askPermission({ ...m.req }).then((decision) => api.decide(runId, m.req.id, decision))
      } else push(m)
    })
    const onAbort = (): void => {
      api.abort(runId)
      // if the main process never answers, do not leave the chat waiting forever
      setTimeout(() => push({ runId, kind: 'done' }), 3000)
    }
    req.signal.addEventListener('abort', onAbort, { once: true })

    try {
      const started = await api.start({
        runId,
        apiKey: cfg.apiKey,
        model: req.model,
        baseUrl: cfg.baseUrl,
        projectPath: cfg.projectPath,
        headers: cfg.hosted ? { 'x-morecode-run': runId, 'x-tz-offset': String(new Date().getTimezoneOffset()) } : undefined,
        prompt: req.prompt,
        images: req.images,
        attachments: req.attachments.map((a) => ({ kind: a.kind, name: a.name, path: a.path })),
        history: req.history,
        progress: req.progress,
        noTools: req.noTools,
        style: cfg.style
      })
      if (!started) throw new AgentError('failed', 'Could not start the AI. Please try again.')

      for (;;) {
        while (!queue.length) await new Promise<void>((resolve) => (wake = resolve))
        const m = queue.shift() as Message
        if (m.kind === 'done') return
        if (m.kind === 'error') throw new AgentError(m.error.kind, m.error.message, m.error.retryAfter)
        if (m.kind !== 'evt') continue
        const e = m.evt
        if (e.type === 'tool') yield { type: 'tool', tool: e.tool as unknown as ToolBlock }
        else if (e.type === 'text') yield { type: 'text', delta: e.delta }
        else if (e.type === 'project') {
          window.dispatchEvent(
            new CustomEvent('workspace:project-created', { detail: { name: e.name, path: e.path } })
          )
        }
        else {
          cfg.onUsage(e.detail)
          yield { type: 'usage', tokens: e.tokens }
        }
      }
    } finally {
      off()
      req.signal.removeEventListener('abort', onAbort)
    }
  }
}
