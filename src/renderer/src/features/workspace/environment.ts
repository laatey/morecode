/**
 * Every chat lives in exactly one environment. This is the single place that decides which, so the
 * AI, the terminal, the file panels and the sidebar can never disagree. See docs/CHAT-ENVIRONMENTS.md.
 */
export type ChatEnvironment =
  /** In a project: works in that project's folder. */
  | { kind: 'project'; projectId: string; folder: string }
  /** Not in a project: works in its own private, empty folder. Sees no other project. */
  | { kind: 'loose' }
  /** In a project that has no folder yet (older label-only projects): treated as loose until linked. */
  | { kind: 'unlinked'; projectId: string }

export function environmentOf(
  chat: { projectId: string | null },
  groups: { id: string; folder?: string }[]
): ChatEnvironment {
  if (!chat.projectId) return { kind: 'loose' }
  const group = groups.find((g) => g.id === chat.projectId)
  if (!group) return { kind: 'loose' } // the project was removed: the chat is loose again
  if (!group.folder) return { kind: 'unlinked', projectId: group.id }
  return { kind: 'project', projectId: group.id, folder: group.folder }
}

/** Stable key for "which folder should the app be pointed at". Changes only when the target changes. */
export function workspaceKey(chatId: string, env: ChatEnvironment): string {
  return env.kind === 'project' ? `project:${env.folder}` : `chat:${chatId}`
}
