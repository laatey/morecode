import { ipcMain, type WebContents } from 'electron'
import { getNewProjectRoot, getWorkspaceRoot } from '../workspace'
import { ApiFailure } from './anthropic'
import { runAgent, type RunInput, type Style } from './run'
import { keepEdit, revertEdit, type Decision } from './tools'

interface Live {
  abort: AbortController
  waiting: Map<string, (d: Decision) => void>
  sender: WebContents
}
const runs = new Map<string, Live>()

type Payload = Omit<RunInput, 'cwd'>

const MODELS = /^(claude-[a-z0-9.-]+|qwen2\.5-coder-14b-kaggle)$/i

function valid(p: unknown): p is Payload {
  const x = p as Payload
  return (
    !!x &&
    typeof x.runId === 'string' &&
    typeof x.apiKey === 'string' &&
    x.apiKey.length > 8 &&
    typeof x.model === 'string' &&
    MODELS.test(x.model) &&
    typeof x.prompt === 'string' &&
    Array.isArray(x.images) &&
    Array.isArray(x.attachments) &&
    Array.isArray(x.history) &&
    ['new', 'some', 'pro'].includes(x.style as Style) &&
    (x.baseUrl === undefined ||
      (typeof x.baseUrl === 'string' && /^https?:\/\//i.test(x.baseUrl))) &&
    (x.headers === undefined ||
      (typeof x.headers === 'object' &&
        Object.entries(x.headers).every(
          ([k, v]) => /^x-morecode-[a-z-]+$/.test(k) && typeof v === 'string' && v.length < 80
        )))
  )
}

export function registerAgentIpc(): void {
  ipcMain.handle('agent:start', (event, payload: unknown): boolean => {
    if (!valid(payload) || runs.has(payload.runId)) return false
    const sender = event.sender
    const live: Live = { abort: new AbortController(), waiting: new Map(), sender }
    runs.set(payload.runId, live)
    const send = (msg: Record<string, unknown>): void => {
      if (!sender.isDestroyed()) sender.send('agent:event', { runId: payload.runId, ...msg })
    }

    void runAgent(
      { ...payload, cwd: getWorkspaceRoot(), newProjectRoot: getNewProjectRoot() },
      {
        signal: live.abort.signal,
        emit: (evt) => send({ kind: 'evt', evt }),
        ask: (req) =>
          new Promise<Decision>((resolve) => {
            live.waiting.set(req.id, resolve)
            live.abort.signal.addEventListener('abort', () => resolve('deny'), { once: true })
            send({ kind: 'ask', req })
          })
      }
    )
      .then(() => send({ kind: 'done' }))
      .catch((err: Error) => {
        if (err.name === 'AbortError' || live.abort.signal.aborted) return send({ kind: 'done' })
        const known = err instanceof ApiFailure
        send({
          kind: 'error',
          error: {
            kind: known ? err.kind : 'failed',
            message: known ? err.message : 'Something went wrong running that request.',
            retryAfter: known ? err.retryAfter : undefined
          }
        })
      })
      .finally(() => runs.delete(payload.runId))
    return true
  })

  ipcMain.on('agent:permission', (_e, runId: string, id: string, decision: Decision) => {
    const live = runs.get(runId)
    const resolve = live?.waiting.get(id)
    if (resolve && ['once', 'always', 'deny'].includes(decision)) {
      live!.waiting.delete(id)
      resolve(decision)
    }
  })

  ipcMain.on('agent:abort', (_e, runId: string) => runs.get(runId)?.abort.abort())

  // One-token request to find out whether a key really works before it is saved.
  ipcMain.handle(
    'agent:test-key',
    async (_e, key: unknown): Promise<{ ok: boolean; message?: string }> => {
      if (typeof key !== 'string' || key.length < 20 || key.length > 300)
        return { ok: false, message: 'That does not look like a valid key.' }
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-5-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }]
          }),
          signal: AbortSignal.timeout(15_000)
        })
        if (res.ok || res.status === 429) return { ok: true } // a busy key is still a real key
        if (res.status === 401 || res.status === 403)
          return { ok: false, message: 'That key was not accepted. Check it and try again.' }
        return { ok: false, message: `The key could not be checked right now (${res.status}).` }
      } catch {
        return {
          ok: false,
          message: 'Could not reach the AI service to check the key. Check your connection.'
        }
      }
    }
  )

  /** Check a live personal Kaggle endpoint without sending any project data. */
  ipcMain.handle(
    'agent:test-endpoint',
    async (_e, endpoint: unknown, token: unknown): Promise<{ ok: boolean; message?: string }> => {
      if (
        typeof endpoint !== 'string' ||
        !/^https:\/\//i.test(endpoint) ||
        typeof token !== 'string' ||
        token.length < 20
      ) {
        return { ok: false, message: 'Enter the HTTPS endpoint and its notebook token.' }
      }
      try {
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/health`, {
          headers: { 'x-api-key': token },
          signal: AbortSignal.timeout(20_000)
        })
        if (res.ok) return { ok: true }
        if (res.status === 401 || res.status === 403)
          return { ok: false, message: 'That notebook token was not accepted.' }
        return { ok: false, message: `The endpoint did not become ready (${res.status}).` }
      } catch {
        return {
          ok: false,
          message:
            'Could not reach the endpoint. Start the Kaggle notebook and copy its current tunnel URL.'
        }
      }
    }
  )

  ipcMain.handle('agent:revert', (_e, id: string): boolean =>
    typeof id === 'string' ? revertEdit(id) : false
  )
  ipcMain.on('agent:keep', (_e, id: string) => {
    if (typeof id === 'string') keepEdit(id)
  })
}

/** Stop anything still running when the app quits, so no command is left behind. */
export function stopAllAgents(): void {
  runs.forEach((r) => r.abort.abort())
}
