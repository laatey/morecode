import {
  BarChart3,
  Bug,
  Code2,
  FileText,
  GitCommitHorizontal,
  Gauge,
  GraduationCap,
  Layers,
  Package,
  ScanSearch,
  Shield,
  Sparkles,
  TestTube2,
  Wand2,
  type IconComponent
} from '@/components/icons'

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
  author?: string
  version?: string
  updatedAt?: string
  installs?: string
  /** Virtual file tree for the skill package (path -> file content). */
  bundle?: Record<string, string>
}

export type CustomCommand = {
  id: string
  description: string
  /** Use $ARGUMENTS where the text typed after the command should go. */
  prompt: string
}

export const ICONS: Record<string, IconComponent> = {
  data: BarChart3,
  design: Layers,
  code: Code2,
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
/** Every skill shows the same plain document icon; per-skill icons read as noise. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const skillIcon = (_key?: string): IconComponent => ICONS.docs

/** Synthesizes a browsable file bundle for any skill that doesn't already store raw files. */
export function getSkillBundle(skill: Skill): Record<string, string> {
  if (skill.bundle && Object.keys(skill.bundle).length > 0) return skill.bundle
  const version = skill.version ?? '1.0.0'
  const author = skill.author ?? (skill.source === 'custom' ? 'You' : 'MoreCode')
  const out: Record<string, string> = {
    '.claude-plugin/plugin.json': JSON.stringify(
      {
        name: skill.id,
        title: skill.name,
        version,
        author,
        category: skill.category,
        description: skill.description
      },
      null,
      2
    ),
    'README.md': `# ${skill.name}\n\n${skill.description}\n\n## Usage\n\nInvoke in any chat with \`/${skill.id}\`${skill.example ? `:\n\n\`\`\`text\n/${skill.id} ${skill.example}\n\`\`\`` : '.'
      }\n\n## Instructions\n\n${skill.instructions}\n`,
    [`skills/${skill.id}/SKILL.md`]: `---\nname: ${skill.id}\ndescription: ${skill.description}\nversion: ${version}\n---\n\n# ${skill.name}\n\n${skill.instructions}\n`
  }
  for (const f of skill.files) {
    if (!out[f]) {
      out[`examples/${f}`] = `# Example reference: ${f}\n`
    }
  }
  return out
}

/** Built-in multi-skill packs that can be browsed, inspected in the file tree, or added with one click. */
export const CATALOG: Skill[] = [
  {
    id: 'data',
    name: 'Data',
    description: 'Query, chart, and explain your data — SQL, spreadsheets, and dashboards in one place.',
    instructions:
      '1. Inspect available schemas, CSVs, or database tables before writing queries.\n2. Write clean, parameterized SQL or Python/TypeScript transformations.\n3. Validate row counts, nulls, and edge cases.\n4. Summarize key takeaways clearly with reproducible queries.',
    example: 'Analyze our schema and build a retention breakdown query',
    category: 'Quality',
    icon: 'data',
    triggers: ['sql', 'query', 'dashboard', 'analytics', 'csv', 'metrics'],
    files: [
      '.claude-plugin/plugin.json',
      'README.md',
      'skills/analyze/SKILL.md',
      'skills/build-dashboard/SKILL.md',
      'skills/create-viz/SKILL.md',
      'skills/explore-data/SKILL.md',
      'skills/sql-queries/SKILL.md'
    ],
    source: 'catalog',
    author: 'MoreCode',
    version: '1.1.0',
    updatedAt: 'Oct 29',
    installs: '1.8M installs',
    bundle: {
      '.claude-plugin/plugin.json': JSON.stringify(
        {
          name: 'data',
          title: 'Data Analyst Plugin',
          version: '1.1.0',
          author: 'MoreCode',
          skills: ['analyze', 'build-dashboard', 'create-viz', 'explore-data', 'sql-queries'],
          description: 'Query, chart, and explain your data — SQL, spreadsheets, and dashboards in one place.'
        },
        null,
        2
      ),
      'README.md': `# Data Analyst Plugin\n\nA data analyst skill pack designed for MoreCode — SQL queries, data exploration, visualization, dashboards, and insight generation. Works with any data warehouse, any SQL dialect, and any analytics stack.\n\n## Installation\n\n\`\`\`bash\n# Use directly in MoreCode chat\n/data Analyze our active user cohorts over the last 30 days\n\`\`\`\n\n## Included Skills\n\n- **analyze** — Root-cause metric changes and funnel drop-offs\n- **build-dashboard** — Scaffold interactive KPI views and charts\n- **create-viz** — Pick the right chart encoding for a dataset\n- **explore-data** — Profile tables, distributions, and missing values\n- **sql-queries** — Write dialect-aware, indexed SQL queries\n`,
      'skills/analyze/SKILL.md': `---\nname: analyze\ndescription: Decompose metric movements, cohorts, and conversion funnels.\n---\n\n# Analyze Skill\n\nWhen asked to analyze a metric or dataset:\n\n1. Define the numerator, denominator, and time window.\n2. Segment by the top dimensions (channel, plan, region, device).\n3. Separate mix-shift effects from within-segment rate changes.\n4. Report exact numbers alongside the query used to produce them.\n`,
      'skills/build-dashboard/SKILL.md': `---\nname: build-dashboard\ndescription: Design and implement responsive analytics dashboards.\n---\n\n# Build Dashboard Skill\n\n1. Lead with 3–4 top-level KPI summary cards with period-over-period deltas.\n2. Pair time-series trends with a dimensional breakdown table.\n3. Keep color palettes consistent and accessible.\n`,
      'skills/create-viz/SKILL.md': `---\nname: create-viz\ndescription: Choose and build clear data visualizations.\n---\n\n# Create Visualization Skill\n\n- Use line/area charts for continuous time series.\n- Use horizontal bar charts for categorical rankings with long labels.\n- Always label units, axes, and sample sizes.\n`,
      'skills/explore-data/SKILL.md': `---\nname: explore-data\ndescription: Profile schemas, null rates, cardinality, and outliers.\n---\n\n# Explore Data Skill\n\n1. Inspect table row counts, primary keys, and timestamp ranges.\n2. Check null percentages and duplicate keys before joining.\n3. Surface sample rows and distribution percentiles.\n`,
      'skills/sql-queries/SKILL.md': `---\nname: sql-queries\ndescription: Write readable, performant SQL using CTEs and window functions.\n---\n\n# SQL Queries Skill\n\n- Prefer named CTEs over deeply nested subqueries.\n- Filter partition keys early in \`WHERE\` clauses.\n- Use explicit column lists instead of \`SELECT *\`.\n`
    }
  },
  {
    id: 'design',
    name: 'Design',
    description: 'Accelerate design workflows — UI critique, design system tokens, layout hierarchy, and UX copy.',
    instructions:
      '1. Audit spacing, typography scale, contrast, and alignment.\n2. Reuse existing design tokens and component primitives.\n3. Ensure interactive states (hover, focus, disabled, loading, empty) are handled cleanly.',
    example: 'Critique the visual hierarchy and spacing of our settings modal',
    category: 'Quality',
    icon: 'design',
    triggers: ['ui', 'ux', 'design', 'spacing', 'contrast', 'layout'],
    files: [
      '.claude-plugin/plugin.json',
      'README.md',
      'skills/critique/SKILL.md',
      'skills/design-system/SKILL.md',
      'skills/handoff/SKILL.md'
    ],
    source: 'catalog',
    author: 'MoreCode',
    version: '1.2.0',
    updatedAt: 'Oct 28',
    installs: '3.5M installs',
    bundle: {
      '.claude-plugin/plugin.json': JSON.stringify(
        {
          name: 'design',
          title: 'Design Workflow Pack',
          version: '1.2.0',
          author: 'MoreCode',
          skills: ['critique', 'design-system', 'handoff'],
          description: 'Accelerate design workflows — critique, design system management, UX writing, and handoff.'
        },
        null,
        2
      ),
      'README.md': `# Design Workflow Pack\n\nA curated set of UI/UX skills for auditing interfaces, maintaining design systems, and polishing component states.\n\n## Included Skills\n\n- \`/critique\` — Visual hierarchy, spacing, contrast, and interaction review\n- \`/design-system\` — Token consistency and reusable primitive patterns\n- \`/handoff\` — Edge-case states, responsive breakpoints, and a11y checks\n`,
      'skills/critique/SKILL.md': `---\nname: critique\ndescription: Audit visual hierarchy, alignment, density, and surface contrast.\n---\n\n# UI Critique\n\n1. Check primary vs secondary action weight.\n2. Eliminate competing borders and noisy backgrounds.\n3. Verify optical alignment, padding rhythm, and truncation behavior.\n`,
      'skills/design-system/SKILL.md': `---\nname: design-system\ndescription: Enforce consistent tokens, radii, typography, and component APIs.\n---\n\n# Design System\n\n1. Prefer semantic surface and border tokens over one-off hex values.\n2. Keep control heights and border radii consistent across dialogs and toolbars.\n`,
      'skills/handoff/SKILL.md': `---\nname: handoff\ndescription: Verify empty, loading, error, keyboard, and responsive states.\n---\n\n# Design Handoff\n\n1. Test keyboard navigation (\`Tab\`, \`Esc\`, \`Enter\`) and focus rings.\n2. Ensure long labels truncate gracefully with \`min-w-0 truncate\`.\n`
    }
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Streamline engineering workflows — architecture review, root-cause debugging, and clean refactors.',
    instructions:
      '1. Trace data flow and state ownership before proposing changes.\n2. Keep functions focused and preserve existing public interfaces.\n3. Verify edge cases, error handling, and TypeScript types.',
    example: 'Review the state flow in this module for race conditions',
    category: 'Quality',
    icon: 'code',
    triggers: ['architecture', 'refactor', 'review', 'debug', 'race condition'],
    files: [
      '.claude-plugin/plugin.json',
      'README.md',
      'skills/architecture/SKILL.md',
      'skills/code-review/SKILL.md',
      'skills/debug/SKILL.md'
    ],
    source: 'catalog',
    author: 'MoreCode',
    version: '1.0.4',
    updatedAt: 'Oct 27',
    installs: '2.5M installs',
    bundle: {
      '.claude-plugin/plugin.json': JSON.stringify(
        {
          name: 'engineering',
          title: 'Engineering Workflows',
          version: '1.0.4',
          author: 'MoreCode',
          skills: ['architecture', 'code-review', 'debug'],
          description: 'Streamline engineering workflows — standups, code review, architecture, and debugging.'
        },
        null,
        2
      ),
      'README.md': `# Engineering Workflows\n\nProduction engineering skills for code review, architectural planning, and systematic root-cause debugging.\n`,
      'skills/architecture/SKILL.md': `---\nname: architecture\ndescription: Evaluate module boundaries, state ownership, and failure modes.\n---\n\n# Architecture Review\n\n1. Map state ownership and side-effect boundaries.\n2. Keep IPC and network contracts strongly typed and backward compatible.\n`,
      'skills/code-review/SKILL.md': `---\nname: code-review\ndescription: Spot bugs, regressions, security issues, and missing edge cases.\n---\n\n# Code Review\n\n1. Rank findings by severity (bugs/data loss first, style last).\n2. Point to exact file paths and line numbers.\n`,
      'skills/debug/SKILL.md': `---\nname: debug\ndescription: Isolate root causes with minimal reproduction steps.\n---\n\n# Systematic Debugging\n\n1. Reproduce the failure or trace the exact call stack.\n2. Fix the root cause rather than masking symptoms.\n`
    }
  }
]

/** Skills that are already added the first time. */
export const DEFAULT_INSTALLED: string[] = ['data']

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
  `Use the “${s.name}” skill. Follow these instructions:\n\n${s.instructions}\n\n${args.trim() ? `Task: ${args.trim()}` : 'Task: apply it to what we are working on in this chat.'
  }`

/** What the person sees in the chat for a skill or command: just what they typed. */
export const slashLabel = (id: string, args: string): string => `/${id}${args.trim() ? ` ${args.trim()}` : ''}`

export const customPrompt = (c: CustomCommand, args: string): string =>
  c.prompt.includes('$ARGUMENTS')
    ? c.prompt.replaceAll('$ARGUMENTS', args.trim()).trim()
    : `${c.prompt}${args.trim() ? `\n\n${args.trim()}` : ''}`
