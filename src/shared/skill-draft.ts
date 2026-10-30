export interface SkillDraft {
  id: string
  name: string
  description: string
  instructions: string
  example: string
}

const RESERVED = new Set([
  'plan',
  'compact',
  'init',
  'clear',
  'permissions',
  'skills',
  'commands',
  'context',
  'usage',
  'help'
])

/** Drafts are plain instructions, never executable files or library writes. */
export function validateSkillDraft(input: Record<string, unknown>): SkillDraft {
  const text = (key: string, max: number, optional = false): string => {
    const value = input[key]
    if (optional && value === undefined) return ''
    if (
      typeof value !== 'string' ||
      (!optional && !value.trim()) ||
      value.length > max ||
      value.includes('\0')
    ) {
      throw new Error(
        `${key} must be ${optional ? 'optional ' : 'non-empty '}text of at most ${max} characters.`
      )
    }
    return value.trim()
  }
  const id = text('id', 64)
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || RESERVED.has(id)) {
    throw new Error('Choose a lowercase hyphenated skill id that is not a built-in command.')
  }
  return {
    id,
    name: text('name', 80),
    description: text('description', 500),
    instructions: text('instructions', 30000),
    example: text('example', 1000, true)
  }
}

export function skillDraftCollision(
  id: string,
  skills: { id: string }[],
  commands: { id: string }[]
): boolean {
  return RESERVED.has(id) || [...skills, ...commands].some((item) => item.id === id)
}
