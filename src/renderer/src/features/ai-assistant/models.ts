export interface ModelInfo {
  /** The model name sent to the API. */
  id: string
  name: string
  description: string
}

export const KAGGLE_QWEN_MODEL = 'qwen2.5-coder-14b-kaggle'

export const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', description: 'Most capable, for complex work' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', description: 'Balanced speed and quality' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', description: 'Fastest, for quick edits' },
  {
    id: KAGGLE_QWEN_MODEL,
    name: 'Qwen Coder 14B (Kaggle)',
    description: 'Your temporary private Kaggle notebook endpoint'
  }
]

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

/** A saved model name that no longer exists (from an older version) falls back to the default. */
export const resolveModel = (id: string): string =>
  MODELS.some((m) => m.id === id) ? id : DEFAULT_MODEL

export const modelName = (id: string): string => MODELS.find((m) => m.id === id)?.name ?? id

export const isKaggleQwen = (id: string): boolean => id === KAGGLE_QWEN_MODEL
