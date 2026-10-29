import { FileIcon } from '@/components/file-icon'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, GitBranch, GitPullRequest, RefreshCw, Sparkles } from '@/components/icons'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/icon-button'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import type { GitFile, GitRepo, GitState } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { FileActions, FileTree } from './file-tree'
import { Chip, Stats, TabButton, TabEmpty, TabToolbar } from './tab-kit'

const LABEL: Record<GitFile['status'], { text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  added: { text: 'New', tone: 'good' },
  untracked: { text: 'New', tone: 'good' },
  modified: { text: 'Changed', tone: 'warn' },
  renamed: { text: 'Renamed', tone: 'neutral' },
  deleted: { text: 'Removed', tone: 'bad' }
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)

/** A plain-language starting point for the description, from the file names. */
function suggestMessage(files: GitFile[]): string {
  if (!files.length) return ''
  const names = files.map((f) => f.path.split('/').pop() ?? f.path)
  const verb = files.every((f) => f.status === 'untracked' || f.status === 'added')
    ? 'Add'
    : files.every((f) => f.status === 'deleted')
      ? 'Remove'
      : 'Update'
  if (names.length === 1) return `${verb} ${names[0]}`
  if (names.length === 2) return `${verb} ${names[0]} and ${names[1]}`
  return `${verb} ${names[0]}, ${names[1]} and ${names.length - 2} more`
}

const field =
  'w-full rounded-[7px] bg-white/[0.06] px-2.5 text-[12.5px] text-[#ececea] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-[#3b82f6]/60'

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[4px] border transition-colors',
        checked ? 'border-[#3b82f6] bg-[#3b82f6] text-white' : 'border-white/[0.25] hover:border-white/[0.45]'
      )}
    >
      {checked && <Check className="h-3 w-3 stroke-[3]" />}
    </button>
  )
}

function ShareForm({
  repo,
  onDone,
  refresh
}: {
  repo: GitRepo
  onDone: () => void
  refresh: () => Promise<void>
}): React.JSX.Element {
  const [title, setTitle] = useState(repo.lastMessage ?? '')
  const [body, setBody] = useState('')
  const [base, setBase] = useState(repo.defaultBranch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<{ url: string; opened: boolean } | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError('')
    const res = await window.api.git.createPr({ title, body, base })
    setBusy(false)
    if (res.ok) {
      setMade({ url: res.url, opened: res.opened })
      void refresh()
    } else setError(res.error)
  }

  if (made) {
    return (
      <div className="rounded-[8px] border border-[#3fb950]/30 bg-[#3fb950]/[0.06] p-3">
        <div className="flex items-center gap-2 text-[12.5px] text-[#ececea]">
          <Check className="h-3.5 w-3.5 text-[#5fd17a]" />
          {made.opened ? 'Your changes are on GitHub' : 'Pull request created'}
        </div>
        <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
          {made.opened
            ? 'GitHub opened in your browser with the details filled in. Press Create pull request there to finish.'
            : 'Your changes are ready for review.'}
        </p>
        <div className="mt-2.5 flex gap-1.5">
          {!made.opened && (
            <TabButton tone="primary" onClick={() => void window.api.git.openUrl(made.url)}>
              <ExternalLink className="h-3 w-3" /> Open pull request
            </TabButton>
          )}
          <TabButton onClick={onDone}>Done</TabButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 rounded-[8px] border border-white/[0.1] p-3">
      <div>
        <label htmlFor="pr-title" className="mb-1 block text-[12px] text-[#a8a8a6]">
          Title
        </label>
        <input id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)} className={cn(field, 'h-7')} />
      </div>
      <div>
        <label htmlFor="pr-body" className="mb-1 block text-[12px] text-[#a8a8a6]">
          What should reviewers know? <span className="text-[#77776f]">(optional)</span>
        </label>
        <textarea
          id="pr-body"
          value={body}
          rows={3}
          onChange={(e) => setBody(e.target.value)}
          className={cn(field, 'resize-none py-1.5 leading-5')}
        />
      </div>
      <div>
        <label htmlFor="pr-base" className="mb-1 block text-[12px] text-[#a8a8a6]">
          Merge into
        </label>
        <input id="pr-base" value={base} onChange={(e) => setBase(e.target.value)} className={cn(field, 'h-7 font-mono')} />
      </div>
      {error && <p className="text-[12px] leading-[18px] text-[#e8b365]">{error}</p>}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <TabButton onClick={onDone}>Cancel</TabButton>
        <TabButton tone="primary" disabled={!title.trim() || !base.trim() || busy} onClick={() => void submit()}>
          {busy ? 'Sending…' : 'Send for review'}
        </TabButton>
      </div>
    </div>
  )
}

function RepoView({ repo, refresh }: { repo: GitRepo; refresh: () => Promise<void> }): React.JSX.Element {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [ownBranch, setOwnBranch] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)

  // new files start ticked; ones the person unticked stay unticked across refreshes
  const [known, setKnown] = useState<Set<string>>(new Set())
  useEffect(() => {
    const fresh = repo.files.filter((f) => !known.has(f.path))
    if (!fresh.length) return
    setKnown((k) => new Set([...k, ...fresh.map((f) => f.path)]))
    setPicked((p) => new Set([...p, ...fresh.map((f) => f.path)]))
  }, [repo.files, known])

  const files = useMemo(() => [...repo.files].sort((a, b) => a.path.localeCompare(b.path)), [repo.files])
  const chosen = files.filter((f) => picked.has(f.path))
  const allOn = files.length > 0 && chosen.length === files.length
  const canBranch = repo.onDefault && repo.hasRemote
  const branchName = `morecode/${slug(message) || 'changes'}`

  const toggle = (path: string): void =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    const res = await window.api.git.commit({
      message,
      paths: chosen.map((f) => f.path),
      newBranch: canBranch && ownBranch ? branchName : undefined
    })
    setSaving(false)
    if (!res.ok) return setError(res.error)
    toast.success(res.branch ? `Version saved on ${res.branch}` : 'Version saved')
    setMessage('')
    await refresh()
  }

  const row = (f: GitFile): React.JSX.Element => {
    const name = f.path.split('/').pop() ?? f.path
    return (
      <div className="group flex items-center gap-2 rounded-[6px] px-1.5 py-1 hover:bg-white/[0.04]">
        <Checkbox checked={picked.has(f.path)} onChange={() => toggle(f.path)} label={`Include ${f.path}`} />
        <FileIcon name={name} />
        <span
          title={f.path}
          className={cn('min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]', f.status === 'deleted' && 'text-muted-foreground line-through')}
        >
          {name}
        </span>
        <FileActions path={f.path} canOpen={f.status !== 'deleted'} className="opacity-0 focus-within:opacity-100 group-hover:opacity-100" />
        {f.status !== 'deleted' && (f.added > 0 || f.removed > 0) && <Stats added={f.added} removed={f.removed} />}
        <Chip tone={LABEL[f.status].tone}>{LABEL[f.status].text}</Chip>
      </div>
    )
  }

  const shareable = repo.hasRemote && !repo.onDefault && (repo.ahead > 0 || repo.files.length === 0)
  const nothingToSave = files.length === 0

  return (
    <div className="slim-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      {!nothingToSave && (
        <section>
          <div className="mb-1.5 flex items-center gap-2 px-1.5">
            <Checkbox
              checked={allOn}
              label="Include every file"
              onChange={() => setPicked(allOn ? new Set() : new Set(files.map((f) => f.path)))}
            />
            <h3 className="min-w-0 flex-1 text-[12.5px] font-medium text-[#ececea]">
              {chosen.length} of {files.length} {files.length === 1 ? 'file' : 'files'} to save
            </h3>
          </div>
          <FileTree items={files} render={row} />

          <div className="mt-3 space-y-2.5 border-t border-white/[0.07] pt-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="save-message" className="text-[12px] text-[#a8a8a6]">
                  Describe this version
                </label>
                <button
                  type="button"
                  onClick={() => setMessage(suggestMessage(chosen))}
                  disabled={!chosen.length}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] text-[#8ab8ff] transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3 w-3" /> Suggest
                </button>
              </div>
              <textarea
                id="save-message"
                value={message}
                rows={2}
                onChange={(e) => {
                  setMessage(e.target.value)
                  setError('')
                }}
                placeholder="For example: Make the grid snap into place"
                className={cn(field, 'resize-none py-1.5 leading-5')}
              />
            </div>

            {canBranch && (
              <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-[18px] text-[#c9c9c6]">
                <span className="mt-[1px]">
                  <Checkbox checked={ownBranch} onChange={() => setOwnBranch((v) => !v)} label="Keep on its own branch" />
                </span>
                <span>
                  Keep these changes on their own branch
                  <span className="block text-muted-foreground">
                    {ownBranch ? (
                      <>
                        Saved as <span className="font-mono text-[11.5px] text-[#a8a8a6]">{branchName}</span>, so{' '}
                        {repo.branch} stays untouched until someone reviews it.
                      </>
                    ) : (
                      <>Saved straight to {repo.branch}. You cannot send these for review afterwards.</>
                    )}
                  </span>
                </span>
              </label>
            )}

            {error && <p className="text-[12px] leading-[18px] text-[#e8b365]">{error}</p>}
            <TabButton
              tone="primary"
              className="h-8 w-full"
              disabled={!message.trim() || chosen.length === 0 || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : `Save version${chosen.length ? ` (${chosen.length})` : ''}`}
            </TabButton>
          </div>
        </section>
      )}

      {nothingToSave && (
        <div className="rounded-[8px] border border-white/[0.08] px-3 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-[#ececea]">
            <Check className="h-3.5 w-3.5 text-[#5fd17a]" /> Everything is saved
          </div>
          <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
            {repo.lastMessage ? `Latest version: “${repo.lastMessage}”. ` : ''}New changes from you or the AI show up here.
          </p>
        </div>
      )}

      <section className={cn(!nothingToSave && 'border-t border-white/[0.07] pt-4')}>
        <h3 className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#ececea]">
          <GitPullRequest className="h-3.5 w-3.5 stroke-[1.7] text-[#a8a8a6]" /> Share for review
        </h3>
        {sharing ? (
          <ShareForm repo={repo} refresh={refresh} onDone={() => setSharing(false)} />
        ) : shareable ? (
          <>
            <p className="mb-2.5 text-[12px] leading-[18px] text-muted-foreground">
              {repo.ahead > 0
                ? `${repo.ahead} saved ${repo.ahead === 1 ? 'version is' : 'versions are'} on ${repo.branch} and not shared yet.`
                : `Everything on ${repo.branch} is already shared.`}{' '}
              A pull request lets others look it over before it joins {repo.defaultBranch}.
            </p>
            <TabButton tone="primary" disabled={repo.ahead === 0} onClick={() => setSharing(true)}>
              Create pull request
            </TabButton>
          </>
        ) : !repo.hasRemote ? (
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            To share your work for review, connect this project to GitHub first (a remote called origin). Then come back here.
          </p>
        ) : (
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            You are on {repo.branch}. Save your next changes on their own branch and you can send them for review from here.
          </p>
        )}
      </section>
    </div>
  )
}

/** Save a version of the project and send it for review. Uses the git already on the computer. */
export function GitPanel(): React.JSX.Element {
  const available = Boolean(window.api?.git)
  const { running } = useChatContext()
  const ws = useWorkspace()
  const hasProject = Boolean(ws.groups.find((group) => group.id === ws.active.projectId)?.folder)
  const [state, setState] = useState<GitState | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api?.git || !hasProject) {
      setState(null)
      return
    }
    setLoading(true)
    setState(await window.api.git.state())
    setLoading(false)
  }, [hasProject])

  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener('workspace:changed', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('workspace:changed', onFocus)
    }
  }, [refresh])

  // when the AI finishes a run, its edits are on disk: look again
  useEffect(() => {
    if (!running) void refresh()
  }, [running, refresh])

  if (!available) {
    return (
      <TabEmpty icon={GitBranch} title="Saving versions needs the desktop app">
        Open MoreCode as a desktop app to save versions of your project and send them for review.
      </TabEmpty>
    )
  }
  if (!hasProject) {
    return (
      <TabEmpty icon={GitBranch} title="Add this chat to a project first">
        Version history belongs to a project, not a loose chat.
      </TabEmpty>
    )
  }
  if (!state) return <p className="p-5 text-[12px] text-muted-foreground">Checking your project…</p>

  if (!state.ok) {
    return state.reason === 'no-git' ? (
      <TabEmpty
        icon={GitBranch}
        title="Git is not installed"
        action={<TabButton onClick={() => void refresh()}>Check again</TabButton>}
      >
        Saving versions uses Git, a free tool. Install it from git-scm.com, then check again.
      </TabEmpty>
    ) : (
      <TabEmpty
        icon={GitBranch}
        title="Keep a history of your work"
        action={
          <TabButton
            tone="primary"
            onClick={async () => {
              const res = await window.api.git.init()
              if (res.ok) await refresh()
              else toast.error(res.error)
            }}
          >
            Turn on version history
          </TabButton>
        }
      >
        Save snapshots of your project as you go, go back to them later, and send changes for review.
      </TabEmpty>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar className="py-1">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-[#ececea]">
          <GitBranch className="h-3.5 w-3.5 shrink-0 stroke-[1.7] text-[#a8a8a6]" />
          <span className="truncate">{state.branch}</span>
        </span>
        <IconButton title="Refresh" onClick={() => void refresh()}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </IconButton>
      </TabToolbar>
      <RepoView repo={state} refresh={refresh} />
    </div>
  )
}
