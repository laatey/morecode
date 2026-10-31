import type { FileDiff } from '@/components/diff-view'
import type { SkillDraft } from '../../../../shared/skill-draft'
import type { RoutineDraft } from '../../../../shared/routine-draft'
import type { GitView } from '../../../../shared/git-view'
import type { QuestionAnswer, QuestionItem } from '../../../../shared/question'

export type { QuestionAnswer, QuestionItem, GitView }

export type Step = string | { text: string; icon?: string | null }

export type Chip = { id?: string; name: string; logo?: string }

export type ToolStatus = 'running' | 'done' | 'error'

/** A file or folder the person attached or dragged into the message box. */
export interface Attachment {
  kind: 'file' | 'folder'
  name: string
  path?: string
}

export type PermissionAction = 'command' | 'install' | 'remove' | 'network' | 'browse' | 'web' | 'git'
export type PermissionState = 'pending' | 'allowed' | 'always' | 'denied' | 'blocked'
export type Decision = 'once' | 'always' | 'deny'

/** What the agent asks before doing something that needs the person's go-ahead. */
export interface PermissionRequest {
  id: string
  action: PermissionAction
  /** Plain-language summary, e.g. "Install packages". */
  title: string
  /** The exact command, shown in a code box. */
  command: string
  /** Why the AI wants to do it. */
  reason?: string
  /** Details when an MCP connector tool requests permission. */
  connector?: {
    id: string
    name: string
    tool: string
    input?: Record<string, unknown>
  }
}

/** Questions the AI put to the person. The screen shows them above the message box while `state` is pending. */
export interface QuestionRequest {
  id: string
  items: QuestionItem[]
}

export type ErrorKind = 'rate_limit' | 'offline' | 'failed' | 'interrupted'

export interface TodoItem {
  text: string
  status: 'pending' | 'active' | 'done'
}

/** One thing the agent did. Add a new `kind` here + a renderer in tool-rows.tsx. */
export type ToolBlock =
  | { kind: 'skill-draft'; id: string; draft: SkillDraft; status: ToolStatus }
  | { kind: 'routine-draft'; id: string; draft: RoutineDraft; status: ToolStatus; /** The saved routine this draft became. */ savedId?: string }
  | {
      /** A web search or a page the AI read. */
      kind: 'web'
      id: string
      op: 'search' | 'fetch'
      query?: string
      url?: string
      title?: string
      results?: { title: string; url: string; snippet: string }[]
      excerpt?: string
      chars?: number
      clipped?: boolean
      status: ToolStatus
      error?: string
    }
  | { kind: 'question'; id: string; items: QuestionItem[]; state: 'pending' | 'answered' | 'skipped'; answers?: QuestionAnswer[] }
  | {
      /** One git action: looking at status, a diff or the log, or committing, branching, pushing, opening a pull request. */
      kind: 'git'
      id: string
      op: string
      status: ToolStatus
      view?: GitView
      error?: string
    }
  | {
      kind: 'edit'
      id: string
      path: string
      added: number
      removed: number
      /** The real change to this file since before its first edit waiting for review (rewrites do not pile up). */
      /** Why the edit failed, when it did. */
      error?: string
      netAdded?: number
      netRemoved?: number
      status: ToolStatus
      /** pending = waiting for the user to accept/discard; set when the edit finishes. */
      review?: 'pending' | 'accepted' | 'discarded'
      diff?: FileDiff
    }
  | {
      kind: 'command'
      id: string
      label: string
      command: string
      status: ToolStatus
      output?: string
    }
  | { kind: 'todos'; id: string; items: TodoItem[] }
  | { kind: 'agent'; id: string; task: string; status: ToolStatus; steps: number; report?: string }
  | {
      /** A call to a tool from one of the person's connectors. */
      kind: 'mcp'
      id: string
      connectorId: string
      connector: string
      tool: string
      input: Record<string, unknown>
      output?: string
      status: ToolStatus
      ms?: number
      authError?: boolean
    }
  | { kind: 'read'; id: string; paths: string[]; status: ToolStatus; error?: string }
  | {
      /** A skill file the agent read on demand. */
      kind: 'skill'
      id: string
      skillId: string
      skillName: string
      path?: string
      content?: string
      status: ToolStatus
      error?: string
    }
  | ({ kind: 'permission'; state: PermissionState } & PermissionRequest)
  | {
      /** The agent's reasoning. `text` grows while it thinks; `durationMs` is set when it finishes. */
      kind: 'thinking'
      id: string
      text: string
      status: ToolStatus
      durationMs?: number
    }
  | {
      /** A step-by-step plan waiting for the user's go-ahead. */
      kind: 'plan'
      id: string
      title: string
      summary: string
      steps: string[]
      state: 'draft' | 'approved'
    }

export type Part =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolBlock }
  | { type: 'error'; kind: ErrorKind; message: string; retryAfter?: number; at: number }

export type Msg =
  | { id: string; role: 'user'; text: string; shown?: string; images?: string[]; attachments?: Attachment[] }
  | { id: string; role: 'system'; text: string; /** A written summary of everything above this point, which replaces it for the AI. */ summary?: string }
  | {
      id: string
      role: 'agent'
      parts: Part[]
      running?: boolean
      startedAt?: number
      stopped?: boolean
      feedback?: 'up' | 'down'
      durationMs?: number
      tokens?: number
    }

/** What an agent backend streams to the UI. A real backend only needs to emit these. */
export type AgentEvent =
  | { type: 'tool'; tool: ToolBlock } // upsert by tool.id
  | { type: 'text'; delta: string }
  | { type: 'usage'; tokens: number }

export interface AgentRequest {
  prompt: string
  images: string[]
  attachments: Attachment[]
  model: string
  signal: AbortSignal
  /** The conversation before this message, as plain text, so a real agent has context. */
  history: { role: 'user' | 'assistant'; text: string }[]
  /** What already happened in this chat (files, commands, tasks, last failure), so "continue" has something to continue. */
  progress?: string
  /** A plain answer with no tools (used to write a summary). */
  noTools?: boolean
  /** Ask the person before doing something risky. Resolves once they (or their settings) decide. */
  askPermission: (req: PermissionRequest) => Promise<Decision>
  /** Put questions above the message box and wait. Resolves null when the person skips. */
  askQuestion?: (req: QuestionRequest) => Promise<QuestionAnswer[] | null>
}

export type AgentRunner = (req: AgentRequest) => AsyncGenerator<AgentEvent>
