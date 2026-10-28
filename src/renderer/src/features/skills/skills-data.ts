import {
  Bug,
  FileText,
  GitCommitHorizontal,
  Gauge,
  GraduationCap,
  Package,
  ScanSearch,
  Shield,
  Sparkles,
  TestTube2,
  Wand2,
  type LucideIcon
} from 'lucide-react'

export type SkillCategory = 'Quality' | 'Writing' | 'Learning' | 'Maintenance'
export const CATEGORIES: SkillCategory[] = ['Quality', 'Writing', 'Learning', 'Maintenance']

export type Skill = {
  /** Also the slash command: /code-review */
  id: string
  name: string
  description: string
  /** What the AI is told to do. Shown in plain text in the details. */
  instructions: string
  /** A sample message that shows how to use it. */
  example: string
  category: SkillCategory
  icon: string
  /** Words in a message that make the AI suggest this skill. */
  triggers: string[]
  /** Names of example files the person attached when creating it. */
  files: string[]
  source: 'catalog' | 'custom'
}

export type CustomCommand = {
  id: string
  description: string
  /** Use $ARGUMENTS where the text typed after the command should go. */
  prompt: string
}

export const ICONS: Record<string, LucideIcon> = {
  review: ScanSearch,
  test: TestTube2,
  learn: GraduationCap,
  bug: Bug,
  refactor: Wand2,
  docs: FileText,
  commit: GitCommitHorizontal,
  security: Shield,
  speed: Gauge,
  package: Package,
  spark: Sparkles
}
export const skillIcon = (key: string): LucideIcon => ICONS[key] ?? Sparkles

/** No built-in skills: everything in the list is made by the person. */
export const CATALOG: Skill[] = []

/** Skills that are already added the first time. */
export const DEFAULT_INSTALLED: string[] = []

const RESERVED = new Set([
  'plan', 'review', 'compact', 'clear', 'init', 'permissions', 'model', 'context',
  'usage', 'status', 'help', 'skills', 'commands'
])

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

/** Returns a plain-language problem, or null when the name can be used. */
export function nameProblem(id: string, taken: string[]): string | null {
  if (!id) return 'Give it a name.'
  if (RESERVED.has(id)) return `“/${id}” is already a built-in command.`
  if (taken.includes(id)) return `You already have “/${id}”.`
  return null
}

/** What gets sent to the AI when a skill is used. */
export const skillPrompt = (s: Skill, args: string): string =>
  `Use the “${s.name}” skill. Follow these instructions:\n\n${s.instructions}\n\n${
    args.trim() ? `Task: ${args.trim()}` : 'Task: apply it to what we are working on in this chat.'
  }`

/** What the person sees in the chat for a skill or command: just what they typed. */
export const slashLabel = (id: string, args: string): string => `/${id}${args.trim() ? ` ${args.trim()}` : ''}`

export const customPrompt = (c: CustomCommand, args: string): string =>
  c.prompt.includes('$ARGUMENTS')
    ? c.prompt.replaceAll('$ARGUMENTS', args.trim()).trim()
    : `${c.prompt}${args.trim() ? `\n\n${args.trim()}` : ''}`
