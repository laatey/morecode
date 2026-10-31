/**
 * Translation between the shapes the agent loop speaks (Anthropic messages, tool_use / tool_result blocks) and
 * the OpenAI chat-completions shape that providers like ModelScope speak. Pure functions with no network and no
 * Electron, so they can be tested on their own.
 */
import type { ApiMessage, ContentBlock, ToolDef, Usage } from './anthropic'

export const MODELSCOPE_URL = 'https://api-inference.modelscope.cn'
/** ModelScope's international site. A token made on one site is not always accepted on the other. */
export const MODELSCOPE_INTL_URL = 'https://api-inference.modelscope.ai'
export type ModelScopeSite = 'cn' | 'ai'
export const modelScopeUrl = (site: ModelScopeSite): string =>
  site === 'ai' ? MODELSCOPE_INTL_URL : MODELSCOPE_URL

/** True for providers reached through chat completions instead of the Anthropic messages API. */
export const usesOpenAIFormat = (baseUrl?: string): boolean => {
  const base = baseUrl?.replace(/\/$/, '')
  return base === MODELSCOPE_URL || base === MODELSCOPE_INTL_URL
}

export type OpenAIPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAIPart[] }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
  | { role: 'tool'; tool_call_id: string; content: string }

type ToolResultContent = Extract<ContentBlock, { type: 'tool_result' }>['content']

function resultText(content: ToolResultContent, isError?: boolean): string {
  const text =
    typeof content === 'string'
      ? content
      : content.map((c) => (c.type === 'text' ? c.text : '[image omitted]')).join('\n')
  return isError ? `Error: ${text}` : text
}

export function toOpenAIMessages(system: string, messages: ApiMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content })
      continue
    }

    if (m.role === 'assistant') {
      const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      const calls = m.content.flatMap((b) =>
        b.type === 'tool_use'
          ? [
              {
                id: b.id,
                type: 'function' as const,
                function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }
              }
            ]
          : []
      )
      if (!text && !calls.length) continue
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {})
      })
      continue
    }

    // The person's turn. Tool results come first: each must directly follow the assistant message that asked for it.
    for (const b of m.content) {
      if (b.type === 'tool_result') {
        out.push({
          role: 'tool',
          tool_call_id: b.tool_use_id,
          content: resultText(b.content, b.is_error)
        })
      }
    }
    const parts: OpenAIPart[] = []
    for (const b of m.content) {
      if (b.type === 'text' && b.text) parts.push({ type: 'text', text: b.text })
      else if (b.type === 'image') {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` }
        })
      }
    }
    if (parts.length) {
      // plain text stays a plain string: many models only accept that form
      const textOnly = parts.every((p) => p.type === 'text')
      out.push({
        role: 'user',
        content: textOnly ? parts.map((p) => (p as { text: string }).text).join('\n\n') : parts
      })
    }
  }
  return out
}

export function toOpenAITools(tools: ToolDef[]): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))
}

/** A problem found while reading a stream; the caller turns it into the app's own failure type. */
export class StreamProblem extends Error {
  kind: 'rate_limit' | 'interrupted' | 'failed'
  constructor(kind: StreamProblem['kind'], message: string) {
    super(message)
    this.name = 'StreamProblem'
    this.kind = kind
  }
}

const DROPPED = /stream|closed|terminated|socket|ECONN|reset|timed? ?out|overloaded|fetch failed/i

/**
 * Read the `data:` payloads of a chat-completions stream and rebuild what the agent loop expects: content blocks,
 * a stop reason in Anthropic's words, and token counts.
 */
export async function readOpenAIStream(
  chunks: AsyncIterable<string>,
  on: { text?: (delta: string) => void }
): Promise<{ content: ContentBlock[]; stopReason: string | null; usage: Usage }> {
  let text = ''
  const calls = new Map<number, { id: string; name: string; args: string }>()
  let lastIndex = 0
  let finish: string | null = null
  let done = false
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

  for await (const raw of chunks) {
    const payload = raw.trim()
    if (payload === '[DONE]') {
      done = true
      break
    }
    // what the provider sent back: read field by field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: Record<string, any>
    try {
      data = JSON.parse(payload)
    } catch {
      continue // a malformed frame is skipped rather than ending the whole answer
    }

    if (data.error) {
      const msg: string = data.error.message ?? 'The AI service reported an error.'
      const limited = /rate|quota|limit|too many/i.test(msg)
      throw new StreamProblem(
        limited ? 'rate_limit' : DROPPED.test(msg) ? 'interrupted' : 'failed',
        msg
      )
    }

    if (data.usage) {
      usage.input = data.usage.prompt_tokens ?? usage.input
      usage.output = data.usage.completion_tokens ?? usage.output
      usage.cacheRead = data.usage.prompt_tokens_details?.cached_tokens ?? usage.cacheRead
    }

    const choice = data.choices?.[0]
    if (!choice) continue
    const delta = choice.delta ?? {}

    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content
      on.text?.(delta.content)
    }

    for (const tc of delta.tool_calls ?? []) {
      const index: number = typeof tc.index === 'number' ? tc.index : tc.id ? calls.size : lastIndex
      lastIndex = index
      const entry = calls.get(index) ?? { id: '', name: '', args: '' }
      if (tc.id) entry.id = tc.id
      if (tc.function?.name && !entry.name) entry.name = tc.function.name
      if (typeof tc.function?.arguments === 'string') entry.args += tc.function.arguments
      calls.set(index, entry)
    }

    if (choice.finish_reason) finish = choice.finish_reason
  }

  // the stream ended with no finish and no [DONE]: it was cut off
  if (!finish && !done)
    throw new StreamProblem('interrupted', 'The connection to the AI dropped before it finished.')

  const content: ContentBlock[] = []
  if (text) content.push({ type: 'text', text })
  for (const [index, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
    if (!c.name) continue
    let input: Record<string, unknown>
    try {
      input = c.args ? JSON.parse(c.args) : {}
    } catch {
      // cut off or malformed: marked so the tool reports it instead of running with nothing
      input = { __invalid: true }
    }
    content.push({ type: 'tool_use', id: c.id || `call_${index}`, name: c.name, input })
  }

  const usedTool = content.some((b) => b.type === 'tool_use')
  const stopReason = usedTool ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn'
  return { content, stopReason, usage }
}
