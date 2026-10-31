/**
 * Where a model is reached from:
 * - `claude`:     Anthropic's Claude models. Through your MoreCode plan, or directly with your own API key.
 * - `gateway`:    an AI gateway you run yourself.
 * - `openrouter`: OpenRouter's free model router, with your own OpenRouter key.
 * - `modelscope`: the fixed set of ModelScope models below, with your own ModelScope key. They carry the
 *                 MODELSCOPE_PREFIX. There is no lookup: only these models are offered.
 */
export type ModelSource = 'claude' | 'gateway' | 'openrouter' | 'modelscope'

export interface ModelInfo {
  /** The model name sent to the API. */
  id: string
  name: string
  description: string
  source: ModelSource
}

export const MORLINE_GATEWAY_MODEL = 'anthropic/claude-sonnet-5'
export const OPENROUTER_FREE_MODEL = 'openrouter/free'

/** A ModelScope model is saved as "modelscope:owner/name" so it can never clash with another provider's id. */
export const MODELSCOPE_PREFIX = 'modelscope:'

/** The only ModelScope models offered. ModelScope's own names ("owner/name"). To add or drop one, edit this list. */
export const MODELSCOPE_MODELS: { name: string; description: string }[] = [
  { name: 'zai-org/GLM-5.2', description: 'Zhipu GLM, long coding and agent work' },
  { name: 'nex-agi/Nex-N2.5-mini', description: 'Nex, light and quick' },
  { name: 'nex-agi/Nex-N2.5-Pro', description: 'Nex, built for agent tasks' },
  { name: 'deepseek-ai/DeepSeek-V4-Pro-0813', description: 'DeepSeek, strongest reasoning and coding' },
  { name: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', description: 'DeepSeek, fast and light' },
  { name: 'opencompass/CompassJudger-1-32B-Instruct', description: 'OpenCompass, judges and scores answers' }
]

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
  },
  ...MODELSCOPE_MODELS.map(
    (m): ModelInfo => ({
      id: `${MODELSCOPE_PREFIX}${m.name}`,
      name: m.name.split('/').pop() ?? m.name,
      description: m.description,
      source: 'modelscope'
    })
  )
]

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

export const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn'
/** ModelScope has a China site and an international one; a token works on the site it was made on. */
export type ModelScopeSite = 'cn' | 'ai'
export const modelScopeBase = (site: ModelScopeSite): string =>
  site === 'ai' ? 'https://api-inference.modelscope.ai' : MODELSCOPE_BASE_URL
export const isModelScope = (id: string): boolean => id.startsWith(MODELSCOPE_PREFIX)
/** The name ModelScope itself uses ("owner/name"). */
export const fromModelScopeId = (id: string): string => id.slice(MODELSCOPE_PREFIX.length)

/** A saved model that is not on the list any more (from an older version, or a looked-up ModelScope model) falls back to the default. */
export const resolveModel = (id: string): string => {
  // GLM was first saved under ModelScope's website name; its API knows it as zai-org
  const current = id === `${MODELSCOPE_PREFIX}ZhipuAI/GLM-5.2` ? `${MODELSCOPE_PREFIX}zai-org/GLM-5.2` : id
  return MODELS.some((m) => m.id === current) ? current : DEFAULT_MODEL
}

export const modelName = (id: string): string => MODELS.find((m) => m.id === id)?.name ?? id

export const sourceOf = (id: string): ModelSource => MODELS.find((m) => m.id === id)?.source ?? 'claude'
