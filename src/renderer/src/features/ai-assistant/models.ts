/**
 * Where a model is reached from:
 * - `claude`:     Anthropic's Claude models. Through your MoreCode plan, or directly with your own API key.
 * - `gateway`:    an AI gateway you run yourself.
 * - `openrouter`: OpenRouter's free model router, with your own OpenRouter key.
 */
export type ModelSource = 'claude' | 'gateway' | 'openrouter'

export interface ModelInfo {
  /** The model name sent to the API. */
  id: string
  name: string
  description: string
  source: ModelSource
}

export const MORLINE_GATEWAY_MODEL = 'anthropic/claude-sonnet-5'
export const OPENROUTER_FREE_MODEL = 'openrouter/free'

export const MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    description: 'Most capable, for complex work',
    source: 'claude'
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Sonnet 5.5',
    description: 'Balanced speed and quality',
    source: 'claude'
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Haiku 5.5',
    description: 'Fastest, for quick edits',
    source: 'claude'
  },
  {
    id: MORLINE_GATEWAY_MODEL,
    name: 'Claude Sonnet (Gateway)',
    description: 'Through your own AI gateway',
    source: 'gateway'
  },
  {
    id: OPENROUTER_FREE_MODEL,
    name: 'OpenRouter Free',
    description: 'Free community models, best for personal testing',
    source: 'openrouter'
  }
]

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

/** A saved model name that no longer exists (from an older version) falls back to the default. */
export const resolveModel = (id: string): string =>
  MODELS.some((m) => m.id === id) ? id : DEFAULT_MODEL

export const modelName = (id: string): string => MODELS.find((m) => m.id === id)?.name ?? id

export const sourceOf = (id: string): ModelSource =>
  MODELS.find((m) => m.id === id)?.source ?? 'claude'
