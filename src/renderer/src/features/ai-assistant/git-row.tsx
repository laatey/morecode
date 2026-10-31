import React, { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  GitPullRequest,
  History
} from '@/components/icons'
import { DiffView } from '@/components/diff-view'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Row, Stats } from './row-parts'
import type { GitView, ToolBlock } from './types'

type Git = Extract<ToolBlock, { kind: 'git' }>
type Of<O extends GitView['op']> = Extract<GitView, { op: O }>

const ICON = 'h-3 w-3 shrink-0 text-muted-foreground'

const LABEL: Record<string, [string, string]> = {
  status: ['Checking status', 'Checked status'],
  diff: ['Reading changes', 'Read changes'],
  log: ['Reading history', 'Read history'],
  commit: ['Committing', 'Committed'],
  branch: ['Switching branch', 'Branch'],
  push: ['Pushing', 'Pushed'],
  pull_request: ['Opening pull request', 'Pull request'],
  pr: ['Opening pull request', 'Pull request']
}

const STATE: Record<string, { letter: string; tone: string }> = {
  modified: { letter: 'M', tone: 'text-amber-300/90' },
  added: { letter: 'A', tone: 'text-[var(--diff-add)]' },
  deleted: { letter: 'D', tone: 'text-[var(--diff-del)]' },
  renamed: { letter: 'R', tone: 'text-[#6ea8fe]' },
  untracked: { letter: 'U', tone: 'text-[var(--diff-add)]' }
}

function Chip({
  children,
  mono,
  className
}: {
  children: React.ReactNode
  mono?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]',
        mono && 'font-mono text-[11.5px]',
        className
      )}
    >
      {children}
    </span>
  )
}

const ago = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: s > 86400 * 330 ? 'numeric' : undefined
  })
}

const split = (path: string): [string, string] => {
  const i = path.lastIndexOf('/')
  return i < 0 ? ['', path] : [path.slice(0, i + 1), path.slice(i + 1)]
}

function FileLine({
  path,
  tone,
  letter,
  added,
  removed,
  dim
}: {
  path: string
  tone: string
  letter: string
  added?: number
  removed?: number
  dim?: boolean
}): React.JSX.Element {
  const [dir, name] = split(path)
  return (
    <li className="flex min-w-0 items-center gap-2 text-[12px] leading-5">
      <span className={cn('w-3 shrink-0 text-center font-mono text-[11px]', tone)}>{letter}</span>
      <span className={cn('min-w-0 truncate', dim && 'opacity-60')}>
        <span className="text-muted-foreground">{dir}</span>
        <span className="text-[#e2e2e0]">{name}</span>
      </span>
      <span className="flex-1" />
      {added || removed ? <Stats added={added ?? 0} removed={removed ?? 0} /> : null}
    </li>
  )
}

const openUrl = (url: string): void => {
  const open = window.api?.git?.openUrl
  if (open) void open(url)
  else window.open(url, '_blank', 'noopener')
}

/* ---------- the small card used for a commit and a pull request ---------- */

function Card({
  icon,
  title,
  right,
  meta,
  children
}: {
  icon: React.ReactNode
  title: string
  right?: React.ReactNode
  meta: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="my-1 rounded-[10px] border border-white/[0.08] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#ededeb]">
          {title}
        </span>
        {right}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[22px] text-[11.5px] text-muted-foreground">
        {meta}
      </div>
      {children}
    </div>
  )
}

function HashChip({ hash, short }: { hash: string; short: string }): React.JSX.Element {
  return (
    <button
      type="button"
      title="Copy the full hash"
      onClick={() =>
        void navigator.clipboard.writeText(hash).then(() => toast.success('Hash copied'))
      }
      className="group flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] bg-white/[0.05] px-1.5 font-mono text-[11.5px] leading-[18px] text-[#c9c9c6] transition-colors hover:bg-white/[0.1] hover:text-[#ededeb]"
    >
      {short}
      <Copy className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-70" />
    </button>
  )
}

function CommitCard({ v }: { v: Of<'commit'> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Card
      icon={<GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--diff-add)]" />}
      title={v.subject}
      right={<HashChip hash={v.hash} short={v.short} />}
      meta={
        <>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            <span className="max-w-[160px] truncate font-mono text-[11px] text-[#c9c9c6]">
              {v.branch}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
          >
            {v.files} {v.files === 1 ? 'file' : 'files'}
            <Stats added={v.added} removed={v.removed} />
            <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
          </button>
          <span className="flex-1" />
          <span className="text-muted-foreground/70">not pushed</span>
        </>
      }
    >
      {open && (
        <ul className="mt-2 space-y-0.5 pl-[22px]">
          {v.paths.map((p) => (
            <FileLine key={p} path={p} tone="text-muted-foreground" letter="·" />
          ))}
          {v.skipped.map((p) => (
            <FileLine key={p} path={p} tone="text-amber-300/80" letter="!" dim />
          ))}
          {v.skipped.length > 0 && (
            <li className="pl-5 text-[11px] text-amber-300/70">Left out: may hold secrets</li>
          )}
        </ul>
      )}
    </Card>
  )
}

function PullRequestCard({ v }: { v: Of<'pr'> }): React.JSX.Element {
  return (
    <Card
      icon={<GitPullRequest className="h-3.5 w-3.5 shrink-0 text-[#a78bfa]" />}
      title={v.title}
      right={
        <Button variant="secondary" size="xs" onClick={() => openUrl(v.url)} className="gap-1">
          {v.created ? 'Open' : 'Finish on GitHub'}
          <ExternalLink className="h-3 w-3" />
        </Button>
      }
      meta={
        <>
          <span className="max-w-[140px] truncate font-mono text-[11px] text-[#c9c9c6]">
            {v.branch}
          </span>
          <ArrowRight className="h-3 w-3" />
          <span className="max-w-[140px] truncate font-mono text-[11px] text-[#c9c9c6]">
            {v.base}
          </span>
          <span className="flex-1" />
          <span className="text-muted-foreground/70">{v.created ? 'opened' : 'branch pushed'}</span>
        </>
      }
    />
  )
}

/* ---------- rows that open to more ---------- */

function StatusBody({ v }: { v: Of<'status'> }): React.JSX.Element {
  return (
    <ul className="ml-[22px] mt-1 mb-1.5 space-y-0.5 pr-1">
      {v.files.map((f) => (
        <FileLine
          key={f.path}
          path={f.path}
          tone={STATE[f.state].tone}
          letter={STATE[f.state].letter}
          added={f.added}
          removed={f.removed}
        />
      ))}
      {v.hidden > 0 && (
        <li className="pl-5 text-[11.5px] text-muted-foreground">and {v.hidden} more</li>
      )}
    </ul>
  )
}

function DiffBody({ v }: { v: Of<'diff'> }): React.JSX.Element {
  const [shown, setShown] = useState<string | null>(v.files.length === 1 ? v.files[0].path : null)
  return (
    <div className="ml-[22px] mt-1 mb-1.5 space-y-1 pr-1">
      {v.files.map((f) => {
        const on = shown === f.path
        const [dir, name] = split(f.path)
        return (
          <div key={f.path}>
            <button
              type="button"
              onClick={() => setShown(on ? null : f.path)}
              className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[4px] px-1 py-0.5 text-left text-[12px] hover:bg-white/[0.04]"
            >
              <ChevronRight
                className={cn(
                  'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
                  on && 'rotate-90'
                )}
              />
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{dir}</span>
                <span className="text-[#e2e2e0]">{name}</span>
              </span>
              <span className="flex-1" />
              <Stats added={f.additions} removed={f.deletions} />
            </button>
            {on && (
              <div className="my-1 overflow-hidden rounded-[6px] border border-white/[0.08] text-[11.5px]">
                {f.hunks.length ? (
                  <DiffView file={f} />
                ) : (
                  <p className="px-3 py-2 text-muted-foreground">Binary or empty file.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
      {v.omitted > 0 && (
        <p className="pl-5 text-[11.5px] text-muted-foreground">and {v.omitted} more files</p>
      )}
    </div>
  )
}

function LogBody({ v }: { v: Of<'log'> }): React.JSX.Element {
  return (
    <ol className="relative ml-[22px] mt-1 mb-1.5 space-y-1.5 pr-1">
      <span className="absolute bottom-1.5 left-[3px] top-1.5 w-px bg-white/[0.1]" aria-hidden />
      {v.commits.map((c) => (
        <li
          key={c.hash}
          className="relative flex min-w-0 items-baseline gap-2 pl-4 text-[12px] leading-5"
        >
          <span
            className="absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full border border-[#5a5a54] bg-[#1e1e1d]"
            aria-hidden
          />
          <span className="min-w-0 truncate text-[#e2e2e0]">{c.subject}</span>
          <span className="flex-1" />
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">{c.short}</span>
          <span className="w-[62px] shrink-0 text-right text-[11px] text-muted-foreground/70">
            {ago(c.at)}
          </span>
        </li>
      ))}
    </ol>
  )
}

function BranchBody({ v }: { v: Of<'branch'> }): React.JSX.Element {
  return (
    <ul className="ml-[22px] mt-1 mb-1.5 space-y-0.5 pr-1">
      {v.branches.map((b) => (
        <li key={b} className="flex items-center gap-2 text-[12px] leading-5">
          {b === v.current ? (
            <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span
            className={cn(
              'min-w-0 truncate font-mono text-[11.5px]',
              b === v.current ? 'text-[#ededeb]' : 'text-muted-foreground'
            )}
          >
            {b}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One git action in the chat. Quiet rows for looking, a small card for a commit or pull request. */
export function GitRow({ tool }: { tool: Git }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const v = tool.view
  const [doing, done] = LABEL[tool.op] ?? ['Running git', 'Git']

  if (tool.status === 'error') {
    return (
      <div>
        <Row expandable open={open} onToggle={() => setOpen((o) => !o)} status="error">
          <span className="text-muted-foreground">Git {tool.op.replace('_', ' ')} failed</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--diff-del)]/90">
            {tool.error}
          </span>
        </Row>
        {open && tool.error && (
          <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[12px] leading-5 text-red-100">
            {tool.error}
          </p>
        )}
      </div>
    )
  }

  if (tool.status === 'done' && v?.op === 'commit') return <CommitCard v={v} />
  if (tool.status === 'done' && v?.op === 'pr') return <PullRequestCard v={v} />

  if (tool.status === 'running' || !v) {
    return (
      <Row expandable={false} open={false} onToggle={() => undefined} status="running">
        <span className="text-muted-foreground">{doing}</span>
      </Row>
    )
  }

  let icon = <GitBranch className={ICON} />
  let head: React.ReactNode = null
  let body: React.ReactNode = null
  let expandable = false

  if (v.op === 'status') {
    expandable = v.files.length > 0
    body = <StatusBody v={v} />
    head = (
      <>
        <Chip mono>{v.branch}</Chip>
        {(v.ahead > 0 || v.behind > 0) && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {v.ahead > 0 && `↑${v.ahead}`}
            {v.ahead > 0 && v.behind > 0 && ' '}
            {v.behind > 0 && `↓${v.behind}`}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground">
          {v.files.length ? `${v.files.length} changed` : 'clean'}
        </span>
      </>
    )
  } else if (v.op === 'diff') {
    icon = <GitCompare className={ICON} />
    expandable = v.files.length > 0
    body = <DiffBody v={v} />
    head = (
      <>
        <span className="shrink-0 text-muted-foreground">
          {v.files.length
            ? `${v.files.length} ${v.files.length === 1 ? 'file' : 'files'}`
            : 'nothing'}
        </span>
        {v.files.length > 0 && <Stats added={v.added} removed={v.removed} />}
        <span className="min-w-0 truncate text-muted-foreground/70">{v.scope}</span>
      </>
    )
  } else if (v.op === 'log') {
    icon = <History className={ICON} />
    expandable = v.commits.length > 0
    body = <LogBody v={v} />
    head = (
      <>
        <span className="shrink-0 text-muted-foreground">
          {v.commits.length} {v.commits.length === 1 ? 'commit' : 'commits'}
        </span>
        {v.path && <Chip mono>{v.path}</Chip>}
      </>
    )
  } else if (v.op === 'branch') {
    expandable = v.action === 'listed' && v.branches.length > 0
    body = <BranchBody v={v} />
    head =
      v.action === 'listed' ? (
        <>
          <Chip mono>{v.current}</Chip>
          <span className="shrink-0 text-muted-foreground">{v.branches.length} total</span>
        </>
      ) : (
        <>
          <span className="shrink-0 text-muted-foreground">
            {v.action === 'created' ? 'Created' : 'Switched to'}
          </span>
          <Chip mono>{v.name}</Chip>
        </>
      )
  } else if (v.op === 'push') {
    head = (
      <>
        <Chip mono>{v.branch}</Chip>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-muted-foreground">origin</span>
        <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />
      </>
    )
  }

  const label = v.op === 'branch' ? (v.action === 'listed' ? 'Branches' : 'Branch') : done

  return (
    <div>
      <Row expandable={expandable} open={open} onToggle={() => setOpen((o) => !o)}>
        {icon}
        {v.op === 'branch' && v.action !== 'listed' ? null : (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        )}
        {head}
      </Row>
      {open && expandable && body}
    </div>
  )
}
