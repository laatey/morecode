/** Types for what the desktop shell (preload) offers. `window.api` is missing in a plain browser. */
export type DocInfo = Awaited<ReturnType<Window['api']['docs']['list']>>[number]
export type WorkspaceInfo = Awaited<ReturnType<Window['api']['workspace']['get']>>
export type GitState = Awaited<ReturnType<Window['api']['git']['state']>>
export type GitRepo = Extract<GitState, { ok: true }>
export type GitFile = GitRepo['files'][number]
export type DocMatch = Awaited<ReturnType<Window['api']['docs']['search']>>[number]
