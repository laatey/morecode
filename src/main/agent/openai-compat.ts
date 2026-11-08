/**
 * Streaming client for providers that speak OpenAI-style chat completions (ModelScope). It takes the same request
 * the Anthropic client takes and gives back the same result, so the agent loop does not know which one answered.
 */
import { ApiFailure, explain, frames, type StreamRequest, type StreamResult } from './anthropic'
import { readOpenAIStream, StreamProblem, toOpenAIMessages, toOpenAITools } from './openai-format'

/**
 * Other names ModelScope's API may know a model by. ModelScope's website and its API do not always agree on the
 * owner (GLM is "ZhipuAI" on the site and "zai-org" in the API), so when it answers "Invalid model id" the next
 * name is tried. Keep in step with MODELSCOPE_MODELS in renderer/features/ai-assistant/models.ts.
 */
const ALTERNATE_IDS: Record<string, string[]> = {
  // none needed right now; add 'name': ['other name'] if ModelScope's API ever disagrees with its website
}

/** Reply sizes asked for, biggest first. A service that refuses one is asked again with the next. */
const CAPS = [32768, 16384, 8192]
/** The size each model last accepted, so the next request does not go down the list again. */
const accepted = new Map<string, number>()
/** Services that did not accept being told not to think: it is not sent to them again. */
const thinkingParamRefused = new Set<string>()
const CAP_REFUSED = /max_tokens|max_completion_tokens|maximum|too large|exceed|out of range|less than or equal|at most/i

export async function streamOpenAI(
  req: StreamRequest,
  on: { text?: (delta: string) => void; progress?: (chars: number, thinking?: boolean) => void; thinking?: (delta: string) => void }
): Promise<StreamResult> {
  const doFetch = req.fetchImpl ?? fetch
  const base = (req.baseUrl ?? '').replace(/\/$/, '')
  const who = base.includes('groq.com') ? 'Groq' : 'ModelScope'

  const send = (withUsage: boolean, model: string, cap: number): Promise<Response> =>
    doFetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      signal: req.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: cap,
        stream: true,
        ...(req.noThinking && !thinkingParamRefused.has(`${base}|${model}`) ? { enable_thinking: false } : {}),
        ...(withUsage ? { stream_options: { include_usage: true } } : {}),
        messages: toOpenAIMessages(req.system, req.messages),
        ...(req.tools.length ? { tools: toOpenAITools(req.tools) } : {})
      })
    })

  let res!: Response
  try {
    for (const model of [req.model, ...(ALTERNATE_IDS[req.model] ?? [])]) {
      const want = Math.min(req.maxTokens ?? CAPS[0], CAPS[0])
      const known = accepted.get(`${base}|${model}`)
      const caps = [...new Set([known ?? want, ...CAPS.filter((c) => c <= (known ?? want))])]
      let stop = false
      for (let i = 0; i < caps.length; i++) {
        res = await send(true, model, caps[i])
        // a server that does not know stream_options is asked again without it; the answer just has no token counts
        if (res.status === 400) {
          const said400 = await res.clone().text().catch(() => '')
          // a reply size the service refuses: try the next smaller one
          // not told to skip thinking: this service does not know that setting, so ask again without it
          if (req.noThinking && /enable_thinking|thinking/i.test(said400) && !thinkingParamRefused.has(`${base}|${model}`)) {
            thinkingParamRefused.add(`${base}|${model}`)
            i--
            continue
          }
          if (CAP_REFUSED.test(said400) && !/invalid model id/i.test(said400) && i < caps.length - 1) continue
          res = await send(false, model, caps[i])
        }
        if (res.ok) {
          accepted.set(`${base}|${model}`, caps[i])
          stop = true
        }
        break
      }
      if (stop) break
      // only an unknown name moves on to the next name; any other refusal is the real answer
      const said = await res
        .clone()
        .text()
        .catch(() => '')
      if (!/invalid model id/i.test(said)) break
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiFailure('offline', `Could not reach ${who}. Check your internet connection.`)
  }

  if (!res.ok || !res.body) {
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after'))
      throw new ApiFailure(
        'rate_limit',
        `${who}'s free limit for this model is used up for now. Try another ${who} model, or try again later.`,
        429,
        Number.isFinite(wait) && wait > 0 ? wait : undefined
      )
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiFailure(
        'failed',
        `Your ${who} key was not accepted. Check it in Settings, under Models.`,
        res.status
      )
    }
    if (res.status === 404 && who !== 'Groq') {
      throw new ApiFailure(
        'failed',
        `${who} does not offer this model through its free API right now. Choose another one.`,
        404
      )
    }
    const failure = await explain(res)
    // ModelScope's own wording for a model it does not serve to this account: say where to pick another
    if (/no provider supported|invalid model id|not (found|exist|supported)/i.test(failure.message)) {
      throw new ApiFailure(
        'failed',
        `${failure.message.replace(/[.\s]+$/, '')}. Pick another from the ${who} models in the model menu.`,
        failure.status
      )
    }
    throw failure
  }

  async function* payloads(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    for await (const f of frames(body)) yield f.data
  }

  try {
    return await readOpenAIStream(payloads(res.body), on)
  } catch (err) {
    if ((err as Error).name === 'AbortError' || err instanceof ApiFailure) throw err
    if (err instanceof StreamProblem) {
      throw new ApiFailure(
        err.kind,
        err.kind === 'interrupted'
          ? 'The connection to the AI dropped before it finished.'
          : err.message
      )
    }
    throw new ApiFailure('interrupted', 'The connection to the AI dropped before it finished.')
  }
}
