import { skillIcon, type CustomCommand, type Skill } from '@/features/skills/skills-data'
import { BarChart3, CircleHelp, ClipboardList, Command, Eraser, FileText, Gauge, Minimize2, NotebookText, Puzzle, ShieldCheck, type IconComponent } from '@/components/icons'

export type PanelId =
  | 'model'
  | 'context'
  | 'help'
  | 'usage'
  | 'skills'
  | 'commands'
export type ActionId = 'compact' | 'clear' | 'permissions'
export type CommandGroup =
  | 'Conversation'
  | 'Skills'
  | 'Your commands'
  | 'Workspace'
  | 'Insights'
  | 'Utilities'
  | 'Shortcuts'

export type SlashCommand = {
  id: string
  description: string
  icon: IconComponent
  group: CommandGroup
  /** Hint shown after the name when the command takes extra text, e.g. "[what to focus on]". */
  hint?: string
  /** Small tag on the right, e.g. "new". */
  badge?: string
} & (
  | { kind: 'panel'; panel: PanelId }
  | { kind: 'action'; action: ActionId }
  | { kind: 'prompt'; prompt: string; /** Runs straight away with no extra text needed. */ bare?: boolean }
  | { kind: 'prefill'; text: string }
  | { kind: 'skill'; skill: Skill }
  | { kind: 'custom'; command: CustomCommand }
)

/** Add a command here and it appears in the "/" menu. Panels render in panels/. */
export const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    id: 'plan',
    description: 'Plan the work first, without changing any files',
    icon: ClipboardList,
    group: 'Conversation',
    hint: '[add your task]',
    kind: 'prompt',
    prompt: 'Make a plan for the task below. Do not change any files until I approve the plan.'
  },
  {
    id: 'compact',
    description: 'Summarize this chat for the AI to free up context',
    icon: Minimize2,
    group: 'Utilities',
    kind: 'action',
    action: 'compact'
  },
  {
    id: 'init',
    description: 'Write an AGENTS.md that explains this project',
    icon: FileText,
    group: 'Conversation',
    kind: 'prompt',
    bare: true,
    prompt: 'Look through this project and write an AGENTS.md in the project root (update it if it exists). Cover what the project is, how to install, run, test and build it, the folder layout, and the conventions to follow. Keep it short and accurate: only say what you verified.'
  },
  {
    id: 'clear',
    description: 'Start over with an empty chat',
    icon: Eraser,
    group: 'Utilities',
    kind: 'action',
    action: 'clear'
  },
  {
    id: 'permissions',
    description: 'Choose what the AI may do without asking',
    icon: ShieldCheck,
    group: 'Workspace',
    kind: 'action',
    action: 'permissions'
  },
  {
    id: 'skills',
    description: 'Browse and manage skills',
    icon: Puzzle,
    group: 'Skills',
    kind: 'panel',
    panel: 'skills',
    badge: 'new'
  },
  {
    id: 'commands',
    description: 'Browse and manage your own commands',
    icon: Command,
    group: 'Skills',
    kind: 'panel',
    panel: 'commands'
  },
  {
    id: 'context',
    description: 'See what is filling the context window',
    icon: Gauge,
    group: 'Insights',
    kind: 'panel',
    panel: 'context'
  },
  {
    id: 'usage',
    description: 'See token usage and cost',
    icon: BarChart3,
    group: 'Insights',
    kind: 'panel',
    panel: 'usage'
  },
  {
    id: 'help',
    description: 'Shortcuts and how commands work',
    icon: CircleHelp,
    group: 'Utilities',
    kind: 'panel',
    panel: 'help'
  }
]

export const SLASH_COMMANDS = BUILT_IN_COMMANDS

export const GROUP_ORDER: CommandGroup[] = [
  'Skills',
  'Conversation',
  'Your commands',
  'Insights',
  'Utilities',
  'Workspace',
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
  const starts = grouped(list.filter((c) => c.id.startsWith(q)))
  const rest = grouped(list.filter(
    (c) => !c.id.startsWith(q) && (c.id.includes(q) || c.description.toLowerCase().includes(q))
  ))
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

/** "/plan /code-review fix the tests" → every leading command, and what was typed after them. */
export function parseCommands(
  list: SlashCommand[],
  text: string
): { list: SlashCommand[]; tokens: string[]; args: string } {
  const found: SlashCommand[] = []
  const tokens: string[] = []
  let rest = text.trim()
  for (;;) {
    const m = /^\/([a-z0-9-]+)(?=\s|$)/.exec(rest)
    const command = m ? list.find((c) => c.id === m[1]) : undefined
    if (!m || !command || found.includes(command)) break
    found.push(command)
    tokens.push(m[0])
    rest = rest.slice(m[0].length).trimStart()
  }
  return { list: found, tokens, args: rest }
}
