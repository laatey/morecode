import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface WorkspaceInfo {
  root: string
  name: string
}
export interface DocInfo {
  path: string
  name: string
  dir: string
  size: number
  modified: number
}
export type DocResult = { ok: true; text: string } | { ok: false; error: string }
export type CdResult = { ok: true; cwd: string } | { ok: false; error: string }
export interface DocMatch {
  path: string
  line: number
  text: string
}
export type SaveResult = { ok: true } | { ok: false; error: string }
export type CreateDocResult = { ok: true; doc: DocInfo } | { ok: false; error: string }
export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
export interface GitFile {
  path: string
  status: GitFileStatus
  added: number
  removed: number
}
export type GitState =
  | { ok: false; reason: 'no-git' | 'not-repo' }
  | {
      ok: true
      branch: string
      defaultBranch: string
      onDefault: boolean
      files: GitFile[]
      ahead: number
      hasRemote: boolean
      remoteUrl: string | null
      lastMessage: string | null
      hasGh: boolean
    }
export type GitCommitResult = { ok: true; branch: string } | { ok: false; error: string }
export type GitPrResult = { ok: true; url: string; opened: boolean } | { ok: false; error: string }
export interface AppInfo {
  version: string
  platform: string
  electron: string
  chrome: string
}
export interface AgentStart {
  runId: string
  apiKey: string
  model: string
  prompt: string
  images: string[]
  attachments: { kind: 'file' | 'folder'; name: string; path?: string }[]
  history: { role: 'user' | 'assistant'; text: string }[]
  style: 'new' | 'some' | 'pro'
  /** What already happened in this chat, so "continue" picks up where things stopped. */
  progress?: string
  noTools?: boolean
  baseUrl?: string
  projectPath?: string
  headers?: Record<string, string>
}
export interface AgentUsage {
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  contextTokens: number
  ms: number
}
export type AgentMessage = { runId: string } & (
  | {
      kind: 'evt'
      evt:
        | { type: 'tool'; tool: Record<string, unknown> }
        | { type: 'text'; delta: string }
        | { type: 'project'; name: string; path: string }
        | { type: 'usage'; tokens: number; detail: AgentUsage }
    }
  | {
      kind: 'ask'
      req: {
        id: string
        action: 'command' | 'install' | 'remove' | 'network'
        title: string
        command: string
        reason?: string
      }
    }
  | { kind: 'done' }
  | {
      kind: 'error'
      error: { kind: 'rate_limit' | 'offline' | 'failed' | 'interrupted'; message: string; retryAfter?: number }
    }
)
export interface TermData {
  id: string
  stream: 'out' | 'err'
  chunk: string
}
export interface TermExit {
  id: string
  code: number | null
  signal?: string | null
}

/** Subscribe to a main-process channel; returns the function that unsubscribes. */
function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  platform: process.platform,
  agent: {
    start: (payload: AgentStart): Promise<boolean> => ipcRenderer.invoke('agent:start', payload),
    abort: (runId: string): void => ipcRenderer.send('agent:abort', runId),
    decide: (runId: string, id: string, decision: 'once' | 'always' | 'deny'): void =>
      ipcRenderer.send('agent:permission', runId, id, decision),
    revert: (id: string): Promise<boolean> => ipcRenderer.invoke('agent:revert', id),
    keep: (id: string): void => ipcRenderer.send('agent:keep', id),
    testProvider: (
      check:
        | { provider: 'anthropic' | 'openrouter'; key: string }
        | { provider: 'gateway'; key: string; endpoint: string }
    ): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('agent:test-provider', check),
    onEvent: (cb: (m: AgentMessage) => void): (() => void) => listen('agent:event', cb)
  },
  /** Calls to the MoreCode server, made by the desktop shell so the browser's CORS rules do not apply. Null = no answer. */
  http: {
    request: (req: {
      method: string
      url: string
      headers?: Record<string, string>
      body?: string
    }): Promise<{ status: number; body: string } | null> => ipcRenderer.invoke('api:request', req)
  },
  /** Where a picked or dropped file lives on disk. */
  pathFor: (file: File): string => webUtils.getPathForFile(file),
  showAppMenu: (x: number, y: number): void => ipcRenderer.send('app-menu:show', { x, y }),
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    setZoom: (factor: number): void => ipcRenderer.send('app:set-zoom', factor)
  },
  workspace: {
    get: (): Promise<WorkspaceInfo> => ipcRenderer.invoke('workspace:get'),
    choose: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('workspace:choose'),
    /** Change the active project to an existing folder without showing the folder picker. */
    open: (folder: string): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('workspace:open', folder),
    /** Create or reopen an empty Documents-based folder for a sidebar project. */
    createProject: (name: string): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('workspace:create-project', name),
    /** Every file in the project, as relative paths (for @ mentions). */
    files: (): Promise<string[]> => ipcRenderer.invoke('workspace:files'),
    /** Read a small project file for MoreCode's in-app file preview. */
    readFile: (path: string): Promise<DocResult> => ipcRenderer.invoke('workspace:read-file', path),
    /** Read a project image as a safe data URL for MoreCode's in-app preview. */
    readImage: (
      path: string
    ): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:read-image', path),
    /** Show the project folder in the system file explorer. */
    reveal: (path?: string): Promise<void> => ipcRenderer.invoke('workspace:reveal', path),
    /** Open one project file in the person's default editor. */
    openFile: (path: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('workspace:open-file', path),
    /** Show one project file in the system file explorer. */
    revealFile: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('workspace:reveal-file', path)
  },
  docs: {
    list: (): Promise<DocInfo[]> => ipcRenderer.invoke('docs:list'),
    read: (path: string): Promise<DocResult> => ipcRenderer.invoke('docs:read', path),
    open: (path: string): Promise<void> => ipcRenderer.invoke('docs:open', path),
    write: (path: string, text: string): Promise<SaveResult> =>
      ipcRenderer.invoke('docs:write', path, text),
    create: (name: string): Promise<CreateDocResult> => ipcRenderer.invoke('docs:create', name),
    search: (query: string): Promise<DocMatch[]> => ipcRenderer.invoke('docs:search', query)
  },
  git: {
    state: (): Promise<GitState> => ipcRenderer.invoke('git:state'),
    init: (): Promise<SaveResult> => ipcRenderer.invoke('git:init'),
    commit: (req: {
      message: string
      paths: string[]
      newBranch?: string
    }): Promise<GitCommitResult> => ipcRenderer.invoke('git:commit', req),
    createPr: (req: { title: string; body: string; base: string }): Promise<GitPrResult> =>
      ipcRenderer.invoke('git:create-pr', req),
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('git:open-url', url)
  },
  secrets: {
    available: (): Promise<boolean> => ipcRenderer.invoke('secrets:available'),
    get: (name: string): Promise<string | null> => ipcRenderer.invoke('secrets:get', name),
    set: (name: string, value: string | null): Promise<boolean> =>
      ipcRenderer.invoke('secrets:set', name, value)
  },
  terminal: {
    startDir: (folder?: string | null): Promise<string> => ipcRenderer.invoke('term:start-dir', folder ?? null),
    cd: (cwd: string, target: string): Promise<CdResult> =>
      ipcRenderer.invoke('term:cd', cwd, target),
    run: (id: string, command: string, cwd: string): void =>
      ipcRenderer.send('term:run', { id, command, cwd }),
    kill: (id: string): void => ipcRenderer.send('term:kill', id),
    onData: (cb: (e: TermData) => void): (() => void) => listen('term:data', cb),
    onExit: (cb: (e: TermExit) => void): (() => void) => listen('term:exit', cb)
  }
}

export type AppApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (typed in index.d.ts)
  window.api = api
}
