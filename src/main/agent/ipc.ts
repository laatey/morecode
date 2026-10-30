import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { existsSync, statSync } from 'fs'
import { getChatRoot } from '../workspace'
import { authorize } from '../mcp/oauth'
import { disconnect, disconnectAll, testConnector } from '../mcp/manager'
import type { McpConfig } from '../mcp/client'
import { ApiFailure, looksDropped } from './anthropic'
import { dropJob, getJob, listJobSnapshots, onJobsChange, stopAllJobs, stopJob } from './background'
import { runAgent, type RunInput, type SkillInput, type Style } from './run'
import { keepEdit, revertEdit, type Decision } from './tools'

interface Live {
  abort: AbortController
  waiting: Map<string, (d: Decision) => void>
  sender: WebContents
}
const runs = new Map<string, Live>()

type Payload = Omit<RunInput, 'cwd'>

// Keep in step with the model ids in the app (renderer/features/ai-assistant/models.ts).
const MODELS = /^(claude-[a-z0-9.-]+|anthropic\/claude-sonnet-5|openrouter\/free)$/i

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
    (x.chatId === undefined || (typeof x.chatId === 'string' && x.chatId.length < 80)) &&
    (x.projectPath === undefined || typeof x.projectPath === 'string') &&
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
        ))) &&
    (x.connectors === undefined || (Array.isArray(x.connectors) && x.connectors.length < 30 && x.connectors.every(goodConfig))) &&
    (x.skills === undefined || (Array.isArray(x.skills) && x.skills.length < 100 && x.skills.every(goodSkill)))
  )
}

function goodSkill(s: unknown): s is SkillInput {
  const x = s as SkillInput
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.description === 'string' &&
    typeof x.instructions === 'string' &&
    (x.bundle === undefined || (typeof x.bundle === 'object' && x.bundle !== null && Object.values(x.bundle).every((v) => typeof v === 'string')))
  )
}

function goodConfig(c: unknown): c is McpConfig {
  const x = c as McpConfig
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    (x.kind === 'http' || x.kind === 'stdio') &&
    (x.url === undefined || typeof x.url === 'string') &&
    (x.command === undefined || typeof x.command === 'string') &&
    (x.args === undefined || (Array.isArray(x.args) && x.args.every((a) => typeof a === 'string'))) &&
    (x.headers === undefined || (typeof x.headers === 'object' && Object.values(x.headers).every((v) => typeof v === 'string'))) &&
    (x.oauth === undefined || (typeof x.oauth === 'object' && typeof x.oauth.access_token === 'string')) &&
    (x.env === undefined || (typeof x.env === 'object' && Object.values(x.env).every((v) => typeof v === 'string')))
  )
}

export type CheckResult = { ok: boolean; message?: string }

type ProviderCheck =
  | { provider: 'anthropic' | 'openrouter'; key: string }
  | { provider: 'gateway'; key: string; endpoint: string }

const PROVIDER_NAME = { anthropic: 'API', openrouter: 'OpenRouter', gateway: 'gateway' } as const

function shape(c: unknown): ProviderCheck | null {
  const x = c as Partial<ProviderCheck> | null
  if (!x || typeof x.key !== 'string') return null
  const key = x.key.trim()
  if (key.length < 20 || key.length > 300) return null
  if (x.provider === 'anthropic' || x.provider === 'openrouter')
    return { provider: x.provider, key }
  if (
    x.provider === 'gateway' &&
    typeof x.endpoint === 'string' &&
    /^https:\/\//i.test(x.endpoint)
  ) {
    return { provider: 'gateway', key, endpoint: x.endpoint.trim().replace(/\/$/, '') }
  }
  return null
}

/** One cheap request per provider: a one-token message, or the gateway's health page. Sends no project data. */
async function checkProvider(raw: unknown): Promise<CheckResult> {
  const c = shape(raw)
  if (!c) return { ok: false, message: 'That does not look like a valid key.' }
  const name = PROVIDER_NAME[c.provider]
  const message = JSON.stringify({
    model: c.provider === 'openrouter' ? 'openrouter/free' : 'claude-haiku-5-5',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }]
  })
  try {
    const res =
      c.provider === 'gateway'
        ? await fetch(`${c.endpoint}/health`, {
            headers: { 'x-api-key': c.key },
            signal: AbortSignal.timeout(20_000)
          })
        : await fetch(
            c.provider === 'openrouter'
              ? 'https://openrouter.ai/api/v1/messages'
              : 'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'anthropic-version': '2023-06-01',
                ...(c.provider === 'openrouter'
                  ? { authorization: `Bearer ${c.key}` }
                  : { 'x-api-key': c.key })
              },
              body: message,
              signal: AbortSignal.timeout(20_000)
            }
          )
    if (res.ok || (res.status === 429 && c.provider !== 'gateway')) return { ok: true } // a busy key is still a real key
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: `That ${name} key was not accepted. Check it and try again.` }
    return { ok: false, message: `The ${name} could not be checked right now (${res.status}).` }
  } catch {
    return {
      ok: false,
      message:
        c.provider === 'gateway'
          ? 'Could not reach the gateway. Check its address and that it is running.'
          : `Could not reach ${name === 'API' ? 'the AI service' : name} to check the key. Check your connection.`
    }
  }
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

    // A chat is in exactly one environment:
    //  - in a project whose folder exists  -> that folder
    //  - anything else (no project, or the folder is gone/not on this computer) -> its own private,
    //    empty folder. Never the last project that happened to be open, and never the folder that
    //    holds every project.
    const projectOk =
      !!payload.projectPath && existsSync(payload.projectPath) && statSync(payload.projectPath).isDirectory()
    const project = projectOk ? payload.projectPath : undefined

    void runAgent(
      {
        ...payload,
        projectPath: project,
        cwd: project ?? getChatRoot(payload.chatId ?? payload.runId)
      },
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
        const dropped = !known && looksDropped(err.message)
        send({
          kind: 'error',
          error: {
            kind: known ? err.kind : dropped ? 'interrupted' : 'failed',
            message: known
              ? err.message
              : dropped
                ? 'The connection to the AI dropped before it finished.'
                : 'Something went wrong running that request.',
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

  // Find out whether a key really works before it is saved. One handler for every provider the app can use.
  ipcMain.handle('agent:test-provider', (_e, check: unknown): Promise<CheckResult> =>
    checkProvider(check)
  )

  // Connectors: try one (connects and lists its tools), or let one go.
  ipcMain.handle('mcp:test', (_e, config: unknown) => (goodConfig(config) ? testConnector(config) : { ok: false, error: 'That connector is not set up correctly.' }))
  ipcMain.handle('mcp:authorize', async (_e, url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'Enter the full address, starting with https://' }
    try {
      return { ok: true, oauth: await authorize(url) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.on('mcp:disconnect', (_e, id: unknown) => {
    if (typeof id === 'string') disconnect(id)
  })

  ipcMain.handle('agent:revert', (_e, id: string): boolean =>
    typeof id === 'string' ? revertEdit(id) : false
  )
  ipcMain.on('agent:keep', (_e, id: string) => {
    if (typeof id === 'string') keepEdit(id)
  })

  ipcMain.handle('agent:jobs', () => listJobSnapshots())
  ipcMain.handle('agent:stop-job', async (_e, id: unknown): Promise<boolean> => {
    if (typeof id !== 'string') return false
    const job = getJob(id)
    if (!job) return false
    await stopJob(job)
    dropJob(id)
    return true
  })
  ipcMain.on('agent:drop-job', (_e, id: unknown) => {
    if (typeof id === 'string') dropJob(id)
  })

  onJobsChange((list) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('agent:jobs', list)
    }
  })
}

/** Stop anything still running when the app quits, so no command is left behind. */
export function stopAllAgents(): void {
  runs.forEach((r) => r.abort.abort())
  stopAllJobs()
  disconnectAll()
}
