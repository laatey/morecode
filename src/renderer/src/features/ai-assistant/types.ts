import type { FileDiff } from '@/components/diff-view'

export type Step = string | { text: string; icon?: string | null }

export type Chip = { id?: string; name: string; logo?: string }

export type ToolStatus = 'running' | 'done' | 'error'

/** A file or folder the person attached or dragged into the message box. */
export interface Attachment {
  kind: 'file' | 'folder'
  name: string
  path?: string
}

export type PermissionAction = 'command' | 'install' | 'remove' | 'network'
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
}

export type ErrorKind = 'rate_limit' | 'offline' | 'failed' | 'interrupted'

export interface TodoItem {
  text: string
  status: 'pending' | 'active' | 'done'
}

/** One thing the agent did. Add a new `kind` here + a renderer in tool-rows.tsx. */
export type ToolBlock =
  | {
      kind: 'edit'
      id: string
      path: string
      added: number
      removed: number
      /** The real change to this file since before its first edit waiting for review (rewrites do not pile up). */
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
  | { kind: 'read'; id: string; paths: string[]; status: ToolStatus }
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
}

export type AgentRunner = (req: AgentRequest) => AsyncGenerator<AgentEvent>
