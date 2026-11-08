/**
 * What the app is allowed to ask the AI service for through this server. The server pays for every request, so it
 * forwards only the fields the app really uses, and drops anything that would cost extra or reach outside:
 * Anthropic's own paid tools (web search and the like), MCP connections made from their side, and so on.
 */
const FIELDS = ['model', 'max_tokens', 'messages', 'system', 'tools', 'tool_choice', 'stream', 'temperature', 'top_p', 'top_k', 'stop_sequences', 'thinking']
const TOOL_CHOICES = new Set(['auto', 'any', 'tool', 'none'])
const MAX_MESSAGES = 2000
const MAX_TOOLS = 128
export const MAX_THINKING = 16_000

/** Returns the request cleaned for forwarding, or `{ error }` when it is not something the app would send. */
export function cleanRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'The request must be a JSON object.' }
  const out = {}
  for (const k of FIELDS) if (input[k] !== undefined) out[k] = input[k]
  if (typeof out.model !== 'string' || !out.model) return { error: 'The request needs a model.' }
  if (!Array.isArray(out.messages) || out.messages.length === 0 || out.messages.length > MAX_MESSAGES) return { error: 'The request needs between 1 and 2000 messages.' }
  if (out.system !== undefined && typeof out.system !== 'string' && !Array.isArray(out.system)) return { error: 'The system prompt must be text.' }

  // only tools the app defines itself (a name and a schema): Anthropic's paid server-side tools are dropped
  if (out.tools !== undefined) {
    if (!Array.isArray(out.tools)) return { error: 'Tools must be a list.' }
    out.tools = out.tools
      .filter((t) => t && typeof t === 'object' && typeof t.name === 'string' && t.input_schema && typeof t.input_schema === 'object' && (t.type === undefined || t.type === 'custom'))
      .slice(0, MAX_TOOLS)
      .map((t) => ({ name: t.name, ...(typeof t.description === 'string' ? { description: t.description } : {}), input_schema: t.input_schema, ...(t.cache_control ? { cache_control: t.cache_control } : {}) }))
    if (!out.tools.length) delete out.tools
  }
  if (out.tool_choice !== undefined && !(out.tool_choice && TOOL_CHOICES.has(out.tool_choice.type))) delete out.tool_choice

  // extended thinking is allowed, with a ceiling on how much
  if (out.thinking !== undefined) {
    const t = out.thinking
    if (t && t.type === 'enabled' && Number.isFinite(t.budget_tokens)) out.thinking = { type: 'enabled', budget_tokens: Math.max(1024, Math.min(MAX_THINKING, Math.floor(t.budget_tokens))) }
    else delete out.thinking
  }
  out.max_tokens = Math.min(Number(out.max_tokens) || 4096, 16_000)
  if (out.thinking && out.thinking.budget_tokens >= out.max_tokens) out.max_tokens = Math.min(16_000, out.thinking.budget_tokens + 1024)
  return { body: out }
}
