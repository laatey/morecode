import React, { useState } from 'react'
import { toast } from 'sonner'
import { SkillDraftReview } from '@/features/skills/skill-draft-review'
import { Brain, Check, Circle, ClipboardList } from '@/components/icons'
import { DiffView } from '@/components/diff-view'
import { Tip } from '@/components/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConnectors } from '@/features/connectors/connectors-store'
import { ConnectorLogo } from '@/features/connectors/logo'
import { useRightPanel } from '@/features/right-panel/store'
import { useChatContext } from './chat-context'
import { PermissionCard } from './permission-card'
import { ThinkingBlock } from './thinking-block'
import { Row, Spinner, Stats } from './row-parts'
import { GitRow } from './git-row'
import { WebRow } from './web-row'
import { QuestionRow } from './question-row'
import { RoutineDraftCard } from './routine-draft-card'
import type { TodoItem, ToolBlock } from './types'

const todoIcon: Record<TodoItem['status'], React.ReactNode> = {
  done: <Check className="h-3 w-3 text-[var(--diff-add)]" />,
  active: (
    <span
      aria-label="In progress"
      className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary/30 border-t-primary"
    />
  ),
  pending: <Circle className="h-3 w-3 text-muted-foreground/60" />
}

/** One tool call as a compact, expandable row (file edit, command, todo list). */
function MiniAction({
  label,
  onClick,
  strong
}: {
  label: string
  onClick: () => void
  strong?: boolean
}): React.JSX.Element {
  // a span, not a button: it sits inside the row's own button
  const act = (e: React.SyntheticEvent): void => {
    e.stopPropagation()
    onClick()
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={act}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && act(e)}
      className={cn(
        'cursor-pointer rounded-[6px] px-2 text-[11.5px] leading-[18px] transition-colors',
        strong
          ? 'border border-primary/60 bg-primary text-primary-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-primary/70 hover:bg-primary/90 active:bg-primary/90'
          : 'border border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
      )}
    >
      {label}
    </span>
  )
}

const clipJson = (v: unknown): string => {
  const t = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  return t.length > 4000 ? `${t.slice(0, 4000)}\n…` : t
}

const isAuthError = (msg: string): boolean =>
  /\b(401|403)\b|sign-in expired|unauthorized|forbidden|invalid_token|token expired/i.test(msg)

/** Inline auth card displayed in chat when an MCP connector's authorization fails or expires. */
function McpAuthCard({
  connectorId,
  connectorName,
  error
}: {
  connectorId: string
  connectorName: string
  error?: string
}): React.JSX.Element {
  const { get, reauth } = useConnectors()
  const c = get(connectorId)
  const [signingIn, setSigningIn] = useState(false)
  const [reconnected, setReconnected] = useState(false)
  const [showError, setShowError] = useState(false)

  const handleSignIn = async (): Promise<void> => {
    if (c?.auth === 'oauth' || c?.url) {
      setSigningIn(true)
      try {
        const err = await reauth(connectorId)
        if (err) {
          toast.error(err)
        } else {
          setReconnected(true)
          toast.success(`Connected to ${connectorName}`)
        }
      } catch (e) {
        toast.error((e as Error).message || 'Sign-in failed')
      } finally {
        setSigningIn(false)
      }
    } else {
      window.dispatchEvent(
        new CustomEvent('app:open-customize', {
          detail: { tab: 'connectors', view: 'edit', id: connectorId }
        })
      )
    }
  }

  const handleOpenSettings = (): void => {
    window.dispatchEvent(
      new CustomEvent('app:open-customize', {
        detail: { tab: 'connectors', sub: 'connected' }
      })
    )
  }

  return (
    <div className="my-1.5 rounded-[10px] border border-border p-3 text-[12.5px]">
      <div className="flex items-start gap-2.5">
        <ConnectorLogo
          id={c?.catalogId ?? connectorId}
          domain={c?.domain}
          name={connectorName}
          size={20}
          className="mt-0.5 shrink-0 rounded-[4px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{connectorName}</span>
            <span
              className={cn(
                'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium',
                reconnected
                  ? 'bg-[var(--diff-add)]/15 text-[var(--diff-add)]'
                  : 'bg-foreground/[0.06] text-muted-foreground'
              )}
            >
              {reconnected ? 'Connected' : 'Sign-in expired'}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {reconnected
              ? `Reconnected to ${connectorName}. You can continue chatting or ask the AI to try again.`
              : `Your sign-in for ${connectorName} expired or was rejected. Reconnect to allow the AI to use its tools.`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
        {error ? (
          <button
            type="button"
            onClick={() => setShowError((s) => !s)}
            className="cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {showError ? 'Hide error' : 'Show details'}
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="xs" onClick={handleOpenSettings}>
            Manage
          </Button>
          {!reconnected && (
            <Button
              size="xs"
              disabled={signingIn}
              onClick={handleSignIn}
              className="gap-1.5"
            >
              {signingIn ? (
                <>
                  <Spinner />
                  <span>Signing in…</span>
                </>
              ) : (
                <span>{c?.auth === 'oauth' || c?.url ? 'Sign in again' : 'Update token'}</span>
              )}
            </Button>
          )}
        </div>
      </div>
      {showError && error && (
        <pre className="slim-scroll mt-2 max-h-[140px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-border bg-scrim/30 p-2 font-mono text-[11px] leading-4 text-soft-foreground">
          {error}
        </pre>
      )}
    </div>
  )
}

function Block({ label, text, error }: { label: string; text: string; error?: boolean }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <pre
        className={cn(
          'slim-scroll max-h-[220px] overflow-auto whitespace-pre-wrap break-words border-l-2 border-border-strong pl-3 font-mono text-[11.5px] leading-[18px] select-text',
          error ? 'text-[var(--diff-del)]' : 'text-soft-foreground'
        )}
      >
        {text}
      </pre>
    </div>
  )
}

/** A connector call: logo, tool, service, time. Opens to the exact input and output, with no card around it. */
function McpRow({ tool }: { tool: Extract<ToolBlock, { kind: 'mcp' }> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { get } = useConnectors()
  const c = get(tool.connectorId)
  const isAuth = Boolean(tool.authError) || (tool.status === 'error' && isAuthError(tool.output ?? ''))

  if (isAuth) {
    return (
      <McpAuthCard
        connectorId={tool.connectorId}
        connectorName={tool.connector}
        error={tool.output}
      />
    )
  }

  return (
    <div>
      <Row expandable open={open} onToggle={() => setOpen((o) => !o)} status={tool.status === 'done' ? undefined : tool.status}>
        <ConnectorLogo id={c?.catalogId ?? tool.connectorId} domain={c?.domain} name={tool.connector} size={16} className="rounded-[4px]" />
        <span className="min-w-0 truncate font-mono text-[12px] text-foreground">{tool.tool}</span>
        <span className="shrink-0 text-muted-foreground">{tool.connector}</span>
        <span className="flex-1" />
        {tool.ms !== undefined && <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground/70">{(tool.ms / 1000).toFixed(2)}s</span>}
        {tool.status === 'done' && <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />}
      </Row>
      {open && (
        <div className="ml-[22px] mt-1 mb-1.5 flex flex-col gap-3 pr-1">
          <Block label="Input" text={clipJson(tool.input)} />
          {tool.output !== undefined && <Block label="Output" text={clipJson(tool.output)} error={tool.status === 'error'} />}
        </div>
      )}
    </div>
  )
}

export function ToolRow({ tool }: { tool: ToolBlock }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { openTab } = useRightPanel()
  const { reviewOne } = useChatContext()

  if (tool.kind === 'permission') return <PermissionCard tool={tool} />
  if (tool.kind === 'mcp') return <McpRow tool={tool} />
  if (tool.kind === 'skill-draft') return <SkillDraftReview draft={tool.draft} />
  if (tool.kind === 'routine-draft') return <RoutineDraftCard tool={tool} />
  if (tool.kind === 'git') return <GitRow tool={tool} />
  if (tool.kind === 'web') return <WebRow tool={tool} />
  if (tool.kind === 'question') return <QuestionRow tool={tool} />

  if (tool.kind === 'memory') {
    const verb = { search: ['Checking memory', 'Checked memory'], save: ['Saving', 'Saved'], forget: ['Forgetting', 'Forgot'] }[tool.op]
    return (
      <div>
        <Row expandable={Boolean(tool.error)} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
          <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">{tool.status === 'running' ? verb[0] : verb[1]}</span>
          <span className="min-w-0 truncate rounded-[4px] bg-foreground/[0.05] px-1.5 text-[12px] leading-[18px] text-foreground">{tool.text}</span>
          {tool.op === 'save' && tool.scope && <span className="shrink-0 text-[11.5px] text-muted-foreground/80">{tool.scope === 'global' ? 'everywhere' : 'this project'}</span>}
        </Row>
        {open && tool.error && <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-destructive/25 bg-destructive/30 p-2 text-[12px] leading-5 text-destructive">{tool.error}</p>}
      </div>
    )
  }

  if (tool.kind === 'read') {
    const names = tool.paths.map((p) => p.split('/').pop() ?? p)
    return (
      <div>
      <Row expandable={Boolean(tool.error)} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
        <span className="text-muted-foreground">{tool.status === 'running' ? 'Reading' : 'Read'}</span>
        <span className="min-w-0 truncate rounded-[4px] bg-foreground/[0.05] px-1.5 text-[12px] leading-[18px] text-foreground">
          {names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')}
        </span>
      </Row>
      {open && tool.error && <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-destructive/25 bg-destructive/30 p-2 text-[12px] leading-5 text-destructive">{tool.error}</p>}
      </div>
    )
  }

  if (tool.kind === 'skill') {
    const expandable = Boolean(tool.content || tool.error)
    return (
      <div>
        <Row expandable={expandable} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
          <span className="text-muted-foreground">{tool.status === 'running' ? 'Reading skill' : 'Read skill'}</span>
          <span className="min-w-0 truncate rounded-[4px] bg-foreground/[0.05] px-1.5 text-[12px] leading-[18px] text-foreground">
            {tool.skillName}
          </span>
          {tool.path && (
            <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground/80">
              {tool.path}
            </span>
          )}
        </Row>
        {open && tool.error && (
          <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-destructive/25 bg-destructive/30 p-2 text-[12px] leading-5 text-destructive">
            {tool.error}
          </p>
        )}
        {open && tool.content && (
          <pre className="slim-scroll my-1 ml-5 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-border bg-card px-3 py-2 font-mono text-[11.5px] leading-[18px] text-muted-foreground">
            {tool.content}
          </pre>
        )}
      </div>
    )
  }

  if (tool.kind === 'agent') {
    return (
      <div>
        <Row expandable={Boolean(tool.report)} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">
            {tool.status === 'running' ? 'Helper researching' : 'Helper'}
          </span>
          <span className="min-w-0 truncate rounded-[4px] bg-foreground/[0.05] px-1.5 text-[12px] leading-[18px] text-foreground">
            {tool.task}
          </span>
          {tool.steps > 0 && (
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              {tool.steps} {tool.steps === 1 ? 'step' : 'steps'}
            </span>
          )}
        </Row>
        {open && tool.report && (
          <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-border bg-card p-2.5 text-[12px] leading-5 text-muted-foreground">{tool.report}</p>
        )}
      </div>
    )
  }

  if (tool.kind === 'thinking') {
    return <ThinkingBlock text={tool.text} status={tool.status} durationMs={tool.durationMs} startedAt={tool.startedAt} />
  }

  if (tool.kind === 'plan') {
    return (
      <div className="flex min-h-7 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        <ClipboardList className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-soft-foreground">{tool.state === 'approved' ? 'Plan approved' : 'Plan ready'}</span>
        <span className="min-w-0 truncate text-muted-foreground">{tool.title}</span>
        <span className="flex-1" />
        <Button variant="secondary" size="xs" onClick={() => openTab('plan')}>
          {tool.state === 'approved' ? 'View' : 'Review'}
        </Button>
      </div>
    )
  }

  if (tool.kind === 'edit') {
    const name = tool.path.split('/').pop() ?? tool.path
    const discarded = tool.review === 'discarded'
    return (
      <div>
        <Row
          expandable={(Boolean(tool.diff) && !discarded) || Boolean(tool.error)}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          status={tool.status}
        >
          <span className="text-muted-foreground">
            {tool.status === 'running' ? 'Editing' : discarded ? 'Discarded' : 'Edited'}
          </span>
          <Tip label={tool.path} side="top" align="start">
            <span
              className={cn(
                'min-w-0 truncate font-medium text-foreground rounded-[4px] bg-foreground/[0.05] px-1.5 py-0 text-[12px] leading-[18px]',
                discarded && 'text-muted-foreground line-through'
              )}
            >
              {name}
            </span>
          </Tip>
          {!discarded && <Stats added={tool.added} removed={tool.removed} />}
          {tool.review === 'pending' && tool.status === 'done' && (
            <>
              <span className="flex-1" />
              <MiniAction label="Undo" onClick={() => reviewOne(tool.id, 'discarded')} />
              <MiniAction label="Keep" strong onClick={() => reviewOne(tool.id, 'accepted')} />
            </>
          )}
        </Row>
        {open && tool.error && <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-destructive/25 bg-destructive/30 p-2 text-[12px] leading-5 text-destructive">{tool.error}</p>}
        {open && tool.diff && (
          <div className="my-1 ml-1 overflow-hidden rounded-[6px] border border-border text-[11.5px]">
            <DiffView file={tool.diff} />
          </div>
        )}
      </div>
    )
  }

  if (tool.kind === 'command') {
    return (
      <div>
        <Row
          expandable={Boolean(tool.output)}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          status={tool.status}
        >
          <span className="text-soft-foreground">{tool.label}</span>
        </Row>
        {open && (
          <pre className="slim-scroll my-1 ml-1 max-h-[240px] overflow-auto rounded-[6px] border border-border px-3 py-2 font-mono text-[11.5px] leading-5 text-muted-foreground">
            <span className="text-muted-foreground">$ {tool.command}</span>
            {'\n'}
            {tool.output}
          </pre>
        )}
      </div>
    )
  }

  const done = tool.items.filter((i) => i.status === 'done').length
  return (
    <div>
      <Row expandable open={open} onToggle={() => setOpen((o) => !o)}>
        <span className="text-soft-foreground">Task list</span>
        <span className="text-muted-foreground">
          {done} of {tool.items.length} done
        </span>
      </Row>
      {open && (
        <ul className="my-1 ml-1 space-y-1 px-1 text-[12.5px]">
          {tool.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-[3px] grid h-3 w-3 shrink-0 place-items-center">{todoIcon[item.status]}</span>
              <span className={cn(item.status === 'done' && 'text-muted-foreground line-through')}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
