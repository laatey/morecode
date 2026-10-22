import { skillIcon, type CustomCommand, type Skill } from '@/features/skills/skills-data'
import {
  BarChart3,
  Brush,
  CircleHelp,
  Command,
  NotebookText,
  Puzzle,
  ClipboardList,
  Cpu,
  Gauge,
  Layers,
  Minimize2,
  ScanSearch,
  Shield,
  Sparkles,
  type LucideIcon
} from 'lucide-react'

export type PanelId =
  | 'model'
  | 'context'
  | 'help'
  | 'usage'
  | 'status'
  | 'skills'
  | 'commands'
export type ActionId = 'clear' | 'compact' | 'permissions' | 'notes'
export type CommandGroup =
  | 'Conversation'
  | 'Workspace'
  | 'Skills'
  | 'Your commands'
  | 'Insights'
  | 'Shortcuts'

export type SlashCommand = {
  id: string
  description: string
  icon: LucideIcon
  group: CommandGroup
  /** Hint shown after the name when the command takes extra text, e.g. "[what to focus on]". */
  hint?: string
  /** Small tag on the right, e.g. "new". */
  badge?: string
} & (
  | { kind: 'panel'; panel: PanelId }
  | { kind: 'action'; action: ActionId }
  | { kind: 'prompt'; prompt: string }
  | { kind: 'skill'; skill: Skill }
  | { kind: 'custom'; command: CustomCommand }
)

export const PLAN_PROMPT =
  'Make a step-by-step plan for the current task. Do not change any files yet.'

/** Add a command here and it appears in the "/" menu. Panels render in panels/. */
export const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    id: 'plan',
    description: 'Plan first, change nothing yet',
    icon: ClipboardList,
    group: 'Conversation',
    kind: 'prompt',
    prompt: PLAN_PROMPT
  },
  {
    id: 'review',
    description: 'Check changes for bugs',
    icon: ScanSearch,
    group: 'Conversation',
    kind: 'prompt',
    prompt: 'Review the changes on this branch and point out bugs, risks and missing tests.'
  },
  {
    id: 'compact',
    description: 'Summarise to free up space',
    icon: Minimize2,
    group: 'Conversation',
    kind: 'action',
    action: 'compact'
  },
  {
    id: 'clear',
    description: 'Start a fresh conversation',
    icon: Brush,
    group: 'Conversation',
    kind: 'action',
    action: 'clear'
  },
  {
    id: 'init',
    description: 'Write or edit project notes',
    icon: Sparkles,
    group: 'Workspace',
    kind: 'action',
    action: 'notes'
  },
  {
    id: 'skills',
    description: 'Browse and manage skills',
    icon: Puzzle,
    group: 'Workspace',
    kind: 'panel',
    panel: 'skills',
    badge: 'new'
  },
  {
    id: 'commands',
    description: 'Your own / commands',
    icon: Command,
    group: 'Workspace',
    kind: 'panel',
    panel: 'commands'
  },
  {
    id: 'permissions',
    description: 'Toggle auto-accept edits',
    icon: Shield,
    group: 'Workspace',
    kind: 'action',
    action: 'permissions'
  },
  {
    id: 'model',
    description: 'Choose a model',
    icon: Cpu,
    group: 'Workspace',
    kind: 'panel',
    panel: 'model'
  },
  {
    id: 'context',
    description: 'What fills the context',
    icon: Layers,
    group: 'Insights',
    kind: 'panel',
    panel: 'context'
  },
  {
    id: 'usage',
    description: 'Plan limits and usage',
    icon: BarChart3,
    group: 'Insights',
    kind: 'panel',
    panel: 'usage'
  },
  {
    id: 'status',
    description: 'Current status',
    icon: Gauge,
    group: 'Insights',
    kind: 'panel',
    panel: 'status'
  },
  {
    id: 'help',
    description: 'Commands and shortcuts',
    icon: CircleHelp,
    group: 'Shortcuts',
    kind: 'panel',
    panel: 'help'
  }
]

export const SLASH_COMMANDS = BUILT_IN_COMMANDS

export const GROUP_ORDER: CommandGroup[] = [
  'Conversation',
  'Workspace',
  'Skills',
  'Your commands',
  'Insights',
  'Shortcuts'
]

/** Built-in commands plus the skills that are switched on and the person's own commands. */
export function buildCommands(skills: Skill[], custom: CustomCommand[]): SlashCommand[] {
  return [
    ...BUILT_IN_COMMANDS,
    ...skills.map(
      (skill): SlashCommand => ({
        id: skill.id,
        description: skill.description,
        icon: skillIcon(skill.icon),
        group: 'Skills',
        hint: '[what to use it on]',
        kind: 'skill',
        skill
      })
    ),
    ...custom.map(
      (command): SlashCommand => ({
        id: command.id,
        description: command.description || 'Your command',
        icon: NotebookText,
        group: 'Your commands',
        hint: command.prompt.includes('$ARGUMENTS') ? '[text]' : undefined,
        kind: 'custom',
        command
      })
    )
  ]
}

const grouped = (list: SlashCommand[]): SlashCommand[] =>
  GROUP_ORDER.flatMap((g) => list.filter((c) => c.group === g))

/** Commands that start with the query first, then ones that only contain it. */
export function filterCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase()
  if (!q) return grouped(list) // grouped order, so the keyboard index matches what is drawn
  const starts = list.filter((c) => c.id.startsWith(q))
  const rest = list.filter(
    (c) => !c.id.startsWith(q) && (c.id.includes(q) || c.description.toLowerCase().includes(q))
  )
  return [...starts, ...rest]
}

/** "/code-review src/app.ts" → the command and what was typed after it. */
export function parseSlash(
  list: SlashCommand[],
  text: string
): { command: SlashCommand; args: string } | null {
  const m = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!m) return null
  const command = list.find((c) => c.id === m[1])
  return command ? { command, args: m[2] ?? '' } : null
}
