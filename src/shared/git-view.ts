/** What the git tools show in the chat. Plain data, shared by the main process and the screen. */

export type GitFileState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface GitStatusFile {
  path: string
  state: GitFileState
  staged: boolean
  added: number
  removed: number
}

export interface ViewDiffLine {
  type: 'ctx' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}
export interface ViewFileDiff {
  path: string
  action: 'create' | 'update' | 'delete'
  additions: number
  deletions: number
  hunks: { oldStart: number; newStart: number; lines: ViewDiffLine[] }[]
}

export type GitView =
  | {
      op: 'status'
      branch: string
      upstream?: string
      ahead: number
      behind: number
      files: GitStatusFile[]
      hidden: number
    }
  | {
      op: 'diff'
      scope: string
      files: ViewFileDiff[]
      added: number
      removed: number
      omitted: number
    }
  | {
      op: 'log'
      commits: { hash: string; short: string; subject: string; author: string; at: string }[]
      path?: string
    }
  | {
      op: 'commit'
      hash: string
      short: string
      branch: string
      subject: string
      files: number
      added: number
      removed: number
      paths: string[]
      skipped: string[]
    }
  | {
      op: 'branch'
      action: 'listed' | 'created' | 'switched'
      current: string
      name?: string
      branches: string[]
    }
  | { op: 'push'; branch: string; remote: string }
  | { op: 'pr'; url: string; title: string; branch: string; base: string; created: boolean }
