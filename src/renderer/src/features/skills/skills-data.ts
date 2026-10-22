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

const c = (
  id: string,
  name: string,
  category: SkillCategory,
  icon: string,
  description: string,
  instructions: string,
  example: string,
  triggers: string[]
): Skill => ({
  id,
  name,
  category,
  icon,
  description,
  instructions,
  example,
  triggers,
  files: [],
  source: 'catalog'
})

/** Skills anyone can add from the library. Replace with a real catalogue later. */
export const CATALOG: Skill[] = [
  c(
    'code-review',
    'Code review',
    'Quality',
    'review',
    'Checks your changes for bugs, risks and missing tests.',
    '1. Look at what changed.\n2. Point out bugs and anything risky, most serious first.\n3. Say which changes have no tests.\n4. Suggest the smallest fix for each problem.',
    'Review my latest changes before I commit.',
    ['review my', 'check my changes', 'look over']
  ),
  c(
    'write-tests',
    'Write tests',
    'Quality',
    'test',
    'Adds tests for the code you point at, in your existing style.',
    '1. Read the code and the tests already in the project.\n2. Write tests in the same style and tools.\n3. Cover the normal case, edge cases and errors.\n4. Run them and fix anything that fails.',
    'Write tests for the sign-in form.',
    ['write tests', 'add tests', 'unit test']
  ),
  c(
    'fix-bug',
    'Fix a bug',
    'Quality',
    'bug',
    'Finds the cause of a problem and fixes it with the smallest change.',
    '1. Ask for the error message or steps if they are missing.\n2. Find the cause, not just the symptom.\n3. Make the smallest safe fix.\n4. Explain what was wrong in plain words.',
    'The save button does nothing when I click it.',
    ['bug', 'not working', 'broken', 'crash', 'error']
  ),
  c(
    'explain-code',
    'Explain this code',
    'Learning',
    'learn',
    'Walks through how a file or feature works, in plain language.',
    '1. Start with what it is for, in one sentence.\n2. Walk through the main parts in order.\n3. Avoid jargon, or explain it when used.\n4. Finish with where to look to change it.',
    'Explain how login works in this project.',
    ['explain', 'how does', 'what does this']
  ),
  c(
    'refactor',
    'Tidy up code',
    'Maintenance',
    'refactor',
    'Makes code simpler and easier to read without changing what it does.',
    '1. Do not change behaviour.\n2. Remove duplication and unclear names.\n3. Work in small steps.\n4. Run the tests after each step.',
    'Tidy up the settings page code.',
    ['refactor', 'clean up', 'tidy', 'simplify']
  ),
  c(
    'write-docs',
    'Write docs',
    'Writing',
    'docs',
    'Writes a clear README or guide for a part of your project.',
    '1. Say what it does and who it is for.\n2. Show how to set it up and use it.\n3. Use short sections and real examples.\n4. Save it as a Markdown file in the project.',
    'Write a README for this project.',
    ['readme', 'document this', 'write docs']
  ),
  c(
    'commit-message',
    'Commit message',
    'Writing',
    'commit',
    'Writes a clear commit message from what you changed.',
    '1. Read the staged changes.\n2. Write a short summary line.\n3. Add a few lines on why, if it is not obvious.',
    'Write a commit message for my changes.',
    ['commit message']
  ),
  c(
    'security-check',
    'Security check',
    'Quality',
    'security',
    'Looks for common security problems such as leaked keys and unsafe input.',
    '1. Look for secrets and keys in the code.\n2. Check how user input is handled.\n3. Check dependencies for known problems.\n4. Rank what you find and how to fix it.',
    'Check this project for security problems.',
    ['security', 'vulnerab', 'leaked key']
  ),
  c(
    'speed-up',
    'Speed up',
    'Maintenance',
    'speed',
    'Finds what makes your app slow and suggests fixes.',
    '1. Find the slowest parts by measuring, not guessing.\n2. Fix the biggest one first.\n3. Measure again and report the difference.',
    'The dashboard loads slowly. Find out why.',
    ['slow', 'performance', 'speed up', 'faster']
  ),
  c(
    'update-packages',
    'Update packages',
    'Maintenance',
    'package',
    'Updates outdated packages safely, one group at a time.',
    '1. List what is outdated.\n2. Update small groups, starting with low risk.\n3. Run the tests and build after each group.\n4. Report anything that needs a manual fix.',
    'Update my outdated packages.',
    ['outdated', 'update packages', 'upgrade dependencies']
  )
]

/** Skills that are already added the first time. */
export const DEFAULT_INSTALLED = ['code-review', 'explain-code', 'fix-bug']

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
  `Use the “${s.name}” skill${args.trim() ? ` on this: ${args.trim()}` : '.'}`

export const customPrompt = (c: CustomCommand, args: string): string =>
  c.prompt.includes('$ARGUMENTS')
    ? c.prompt.replaceAll('$ARGUMENTS', args.trim()).trim()
    : `${c.prompt}${args.trim() ? `\n\n${args.trim()}` : ''}`
