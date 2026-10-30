import React, { useState } from 'react'
import { toast } from 'sonner'
import { SkillDraftReview } from '@/features/skills/skill-draft-review'
import { Check, ChevronRight, Circle, CircleDot, ClipboardList, X } from '@/components/icons'
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
import type { TodoItem, ToolBlock, ToolStatus } from './types'

function Spinner(): React.JSX.Element {
  return (
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-dashed border-muted-foreground" />
  )
}

function Stats({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  return (
    <span className="text-[12px] tabular-nums">
      {added > 0 && <span className="text-[var(--diff-add)]">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-[var(--diff-del)]">-{removed}</span>}
    </span>
  )
}

function Row({
  expandable,
  open,
  onToggle,
  status,
  children
}: {
  expandable: boolean
  open: boolean
  onToggle: () => void
  status?: ToolStatus
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={expandable ? onToggle : undefined}
      className={cn(
        'group flex min-h-6 min-w-0 w-full items-center gap-2 rounded-[4px] px-1 py-0.5 text-left text-[12.5px] text-[#c9c9c6] [overflow-wrap:normal]',
        expandable ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
      )}
    >
      {status === 'running' && <Spinner />}
      {status === 'error' && <X className="h-3 w-3 shrink-0 text-[var(--diff-del)]" />}
      {children}
      {expandable && (
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
            open && 'rotate-90'
          )}
        />
      )}
    </button>
  )
}

const todoIcon: Record<TodoItem['status'], React.ReactNode> = {
  done: <Check className="h-3 w-3 text-[var(--diff-add)]" />,
  active: <CircleDot className="h-3 w-3 text-[#6ea8fe]" />,
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
          ? 'border border-[#4a7fe0]/60 bg-[#1d4fb4] text-[#eaf1ff] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-[#6c9aee]/70 hover:bg-[#2359c4] active:bg-[#1a46a0]'
          : 'border border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
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
    <div className="my-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3 text-[12.5px]">
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
            <span className="font-medium text-[#ededeb]">{connectorName}</span>
            <span className="rounded-[4px] bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
              {reconnected ? 'Connected' : 'Sign-in expired'}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#b4b4b0]">
            {reconnected
              ? `Reconnected to ${connectorName}. You can continue chatting or ask the AI to try again.`
              : `Your sign-in for ${connectorName} expired or was rejected. Reconnect to allow the AI to use its tools.`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
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
              variant="secondary"
              size="xs"
              disabled={signingIn}
              onClick={handleSignIn}
              className="gap-1.5 border-amber-500/30 text-amber-200 hover:bg-amber-500/15"
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
        <pre className="slim-scroll mt-2 max-h-[140px] overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono text-[11px] leading-4 text-amber-200/80">
          {error}
        </pre>
      )}
    </div>
  )
}

function Block({ label, text, error }: { label: string; text: string; error?: boolean }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#a9a9a4]">{label}</div>
      <pre
        className={cn(
          'slim-scroll max-h-[220px] overflow-auto whitespace-pre-wrap break-words border-l-2 border-[#4a4a45] pl-3 font-mono text-[11.5px] leading-[18px] select-text',
          error ? 'text-[var(--diff-del)]' : 'text-[#d6d6d3]'
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
        <span className="min-w-0 truncate font-mono text-[12px] text-[#e2e2e0]">{tool.tool}</span>
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

  if (tool.kind === 'read') {
    const names = tool.paths.map((p) => p.split('/').pop() ?? p)
    return (
      <div>
      <Row expandable={Boolean(tool.error)} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
        <span className="text-muted-foreground">{tool.status === 'running' ? 'Reading' : 'Read'}</span>
        <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
          {names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')}
        </span>
      </Row>
      {open && tool.error && <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[12px] leading-5 text-red-100">{tool.error}</p>}
      </div>
    )
  }

  if (tool.kind === 'skill') {
    const expandable = Boolean(tool.content || tool.error)
    return (
      <div>
        <Row expandable={expandable} open={open} onToggle={() => setOpen((o) => !o)} status={tool.status}>
          <span className="text-muted-foreground">{tool.status === 'running' ? 'Reading skill' : 'Read skill'}</span>
          <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
            {tool.skillName}
          </span>
          {tool.path && (
            <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground/80">
              {tool.path}
            </span>
          )}
        </Row>
        {open && tool.error && (
          <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[12px] leading-5 text-red-100">
            {tool.error}
          </p>
        )}
        {open && tool.content && (
          <pre className="slim-scroll my-1 ml-5 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-white/[0.08] bg-[#242423] px-3 py-2 font-mono text-[11.5px] leading-[18px] text-[#b4b4b0]">
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
          <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
            {tool.task}
          </span>
          {tool.steps > 0 && (
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              {tool.steps} {tool.steps === 1 ? 'step' : 'steps'}
            </span>
          )}
        </Row>
        {open && tool.report && (
          <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#242423] p-2.5 text-[12px] leading-5 text-[#b4b4b0]">{tool.report}</p>
        )}
      </div>
    )
  }

  if (tool.kind === 'thinking') {
    return <ThinkingBlock text={tool.text} status={tool.status} durationMs={tool.durationMs} />
  }

  if (tool.kind === 'plan') {
    return (
      <div className="flex min-h-7 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        <ClipboardList className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[#d6d6d3]">{tool.state === 'approved' ? 'Plan approved' : 'Plan ready'}</span>
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
                'min-w-0 truncate font-medium text-[#e2e2e0] rounded-[4px] bg-white/[0.05] px-1.5 py-0 text-[12px] leading-[18px]',
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
        {open && tool.error && <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[12px] leading-5 text-red-100">{tool.error}</p>}
        {open && tool.diff && (
          <div className="my-1 ml-1 overflow-hidden rounded-[6px] border border-white/[0.08] text-[11.5px]">
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
          <span className="text-[#d6d6d3]">{tool.label}</span>
        </Row>
        {open && (
          <pre className="slim-scroll my-1 ml-1 max-h-[240px] overflow-auto rounded-[6px] border border-white/[0.08] px-3 py-2 font-mono text-[11.5px] leading-5 text-[#a9a9a6]">
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
        <span className="text-[#d6d6d3]">Task list</span>
        <span className="text-muted-foreground">
          {done} of {tool.items.length} done
        </span>
      </Row>
      {open && (
        <ul className="my-1 ml-1 space-y-1 px-1 text-[12.5px]">
          {tool.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              {todoIcon[item.status]}
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
