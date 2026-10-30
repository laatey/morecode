/**
 * Minimal streaming client for the Anthropic Messages API (no SDK, so nothing extra to install).
 * Sends one request and turns the server-sent events into plain callbacks.
 */

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result'
      tool_use_id: string
      content: string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>
      is_error?: boolean
    }

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface StreamRequest {
  apiKey: string
  baseUrl?: string
  model: string
  system: string
  messages: ApiMessage[]
  tools: ToolDef[]
  maxTokens?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
}

export interface StreamResult {
  content: ContentBlock[]
  stopReason: string | null
  usage: Usage
}

/** True when a provider message means the connection was cut, not that the request was wrong. */
export const looksDropped = (m: string): boolean => /stream|closed|terminated|socket|ECONN|reset|timed? ?out|overloaded|fetch failed/i.test(m)

/** Something the UI can explain to the person: a kind, a plain message, and when to retry. */
export class ApiFailure extends Error {
  kind: 'rate_limit' | 'offline' | 'failed' | 'interrupted'
  retryAfter?: number
  status?: number
  constructor(kind: ApiFailure['kind'], message: string, status?: number, retryAfter?: number) {
    super(message)
    this.name = 'ApiFailure'
    this.kind = kind
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function explain(res: Response): Promise<ApiFailure> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    // the body was not JSON; the status code alone will do
  }
  if (res.status === 401 || res.status === 403) {
    return new ApiFailure('failed', 'Your API key was not accepted. Check it in Settings.', res.status)
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after'))
    return new ApiFailure('rate_limit', detail || 'You are sending requests faster than your plan allows.', 429, Number.isFinite(wait) && wait > 0 ? wait : undefined)
  }
  if (res.status === 402) {
    return new ApiFailure('failed', 'The configured AI gateway is out of credits. Add credits or connect another provider.', 402)
  }
  if (res.status === 529 || res.status >= 500) {
    return new ApiFailure('failed', 'The AI service is busy right now. Try again in a moment.', res.status)
  }
  return new ApiFailure('failed', detail || `The request was refused (${res.status}).`, res.status)
}

/** Parse "event: x\ndata: {...}\n\n" frames from a byte stream. */
async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let at: number
    while ((at = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length) yield { event, data: data.join('\n') }
    }
  }
}

export async function streamMessage(
  req: StreamRequest,
  on: { text?: (delta: string) => void }
): Promise<StreamResult> {
  const doFetch = req.fetchImpl ?? fetch
  const isOpenRouter = req.baseUrl?.replace(/\/$/, '') === 'https://openrouter.ai/api'
  let res: Response
  try {
    res = await doFetch(`${req.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': req.apiKey,
        ...(isOpenRouter ? { authorization: `Bearer ${req.apiKey}` } : {}),
        'anthropic-version': '2023-06-01',
        ...(req.headers ?? {})
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 8192,
        stream: true,
        // Anthropic supports prompt caching. The OpenRouter free router can select providers
        // that do not, so keep that request portable by omitting Anthropic-only cache fields.
        system: isOpenRouter
          ? req.system
          : [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        ...(req.tools.length
          ? {
              tools: isOpenRouter
              ? req.tools
              : req.tools.map((t, i) =>
                  i === req.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
                )
            }
          : {}),
        messages: req.messages
      })
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiFailure('offline', 'Could not reach the AI service. Check your internet connection.')
  }
  if (!res.ok || !res.body) throw await explain(res)

  const blocks: (ContentBlock & { raw?: string })[] = []
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let stopReason: string | null = null

  try {
  for await (const f of frames(res.body)) {
    // what the provider sent back: its shape is checked field by field below
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: Record<string, any>
    try {
      data = JSON.parse(f.data)
    } catch {
      continue // a malformed frame is skipped rather than ending the whole answer
    }
    switch (data.type) {
      case 'message_start': {
        const u = data.message?.usage ?? {}
        usage.input = u.input_tokens ?? 0
        usage.cacheRead = u.cache_read_input_tokens ?? 0
        usage.cacheWrite = u.cache_creation_input_tokens ?? 0
        usage.output = u.output_tokens ?? 0
        break
      }
      case 'content_block_start': {
        const b = data.content_block
        if (b.type === 'text') blocks[data.index] = { type: 'text', text: b.text ?? '' }
        else if (b.type === 'tool_use') blocks[data.index] = { type: 'tool_use', id: b.id, name: b.name, input: {}, raw: '' }
        else blocks[data.index] = { type: 'text', text: '' } // blocks we do not use (for example thinking) are ignored
        break
      }
      case 'content_block_delta': {
        const b = blocks[data.index]
        const d = data.delta
        if (!b) break
        if (d.type === 'text_delta' && b.type === 'text') {
          b.text += d.text
          on.text?.(d.text)
        } else if (d.type === 'input_json_delta' && b.type === 'tool_use') {
          b.raw = (b.raw ?? '') + d.partial_json
        }
        break
      }
      case 'content_block_stop': {
        const b = blocks[data.index]
        if (b?.type === 'tool_use') {
          try {
            b.input = b.raw ? JSON.parse(b.raw) : {}
          } catch {
            // cut off or malformed: mark it so the tool reports it instead of running with nothing
            b.input = { __invalid: true }
          }
          delete b.raw
        }
        break
      }
      case 'message_delta':
        stopReason = data.delta?.stop_reason ?? stopReason
        if (data.usage?.output_tokens != null) usage.output = data.usage.output_tokens
        break
      case 'error':
        {
          const msg: string = data.error?.message ?? 'The AI service reported an error.'
          throw new ApiFailure(
            data.error?.type === 'rate_limit_error' ? 'rate_limit' : looksDropped(msg) ? 'interrupted' : 'failed',
            looksDropped(msg) ? 'The connection to the AI dropped before it finished.' : msg
          )
        }
    }
  }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || err instanceof ApiFailure) throw err
    throw new ApiFailure('interrupted', 'The connection to the AI dropped before it finished.')
  }

  // the stream ended without a stop reason while a tool call was still being written: it was cut off
  const last = blocks.filter(Boolean).at(-1)
  if (!stopReason && (!last || last.type === 'tool_use')) {
    throw new ApiFailure('interrupted', 'The connection to the AI dropped before it finished.')
  }

  // empty text blocks are dropped: the API refuses to receive them back in the next turn
  const content = blocks.filter(Boolean).filter((b) => !(b.type === 'text' && b.text === ''))
  return { content, stopReason, usage }
}
