import React from 'react'
import { Check, ShieldCheck, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useConnectors } from '@/features/connectors/connectors-store'
import { ConnectorLogo } from '@/features/connectors/logo'
import { useChatContext } from './chat-context'
import type { ToolBlock } from './types'

type Permission = Extract<ToolBlock, { kind: 'permission' }>

const QUESTION: Record<Permission['action'], string> = {
  command: 'Run this command?',
  install: 'Install packages?',
  remove: 'Delete files?',
  network: 'Use the internet?',
  browse: 'Open this page?',
  web: 'Use the web?',
  git: 'Make this git change?',
  memory: 'Remember this?'
}

const MEMORY_RESULT: Record<Exclude<Permission['state'], 'pending'>, string> = {
  allowed: 'Saved',
  always: 'Saved, and future notes save on their own',
  denied: 'Skipped',
  blocked: 'Memory is off in your settings'
}

const RESULT: Record<Exclude<Permission['state'], 'pending'>, string> = {
  allowed: 'Allowed once',
  always: 'Always allowed',
  denied: 'Not allowed',
  blocked: 'Blocked by your settings'
}

/** "The AI wants to run npm install" or an MCP tool: allow once, always, or deny. Kept small on purpose. */
export function PermissionCard({ tool }: { tool: Permission }): React.JSX.Element | null {
  const { decide } = useChatContext()
  const { get } = useConnectors()

  const connectorInfo = tool.connector ?? (
    tool.action === 'network' && tool.reason?.startsWith('Connector:')
      ? {
          id: '',
          name: tool.reason.replace(/^Connector:\s*/, ''),
          tool: tool.title.replace(/^Use [^:]+:\s*/, ''),
          input: undefined
        }
      : null
  )
  const c = connectorInfo ? get(connectorInfo.id) : undefined

  const handleAlways = (): void => {
    if (connectorInfo?.id && connectorInfo?.tool) {
      window.dispatchEvent(
        new CustomEvent('connector:always', {
          detail: { id: connectorInfo.id, tool: connectorInfo.tool }
        })
      )
    }
    decide(tool.id, 'always')
  }

  if (tool.state !== 'pending') {
    const ok = tool.state === 'allowed' || tool.state === 'always'
    // a saved note already has its own memory row; showing "Saved" twice was just noise
    if (tool.action === 'memory' && ok) return null
    return (
      <div className="flex min-h-6 min-w-0 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        {ok ? (
          <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />
        ) : (
          <X className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {connectorInfo ? (
          <>
            <ConnectorLogo
              id={c?.catalogId ?? connectorInfo.id}
              domain={c?.domain}
              name={connectorInfo.name}
              size={14}
              className="shrink-0 rounded-[3px]"
            />
            <span className="shrink-0 whitespace-nowrap text-soft-foreground">{(tool.action === 'memory' ? MEMORY_RESULT : RESULT)[tool.state]}</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {connectorInfo.name} <span className="text-muted-foreground">→</span>{' '}
              <code className="font-mono text-[11.5px] text-foreground">{connectorInfo.tool}</code>
            </span>
          </>
        ) : (
          <>
            <span className="shrink-0 whitespace-nowrap text-soft-foreground">{(tool.action === 'memory' ? MEMORY_RESULT : RESULT)[tool.state]}</span>
            <code className="min-w-0 truncate rounded-[4px] bg-foreground/[0.05] px-1.5 font-mono text-[11.5px] leading-[18px] text-muted-foreground">
              {tool.command}
            </code>
          </>
        )}
      </div>
    )
  }

  // Dedicated layout for MCP connector tool approvals
  if (connectorInfo) {
    return (
      <div
        role="group"
        aria-label={tool.title}
        className="my-1.5 rounded-lg border border-border bg-card p-3 text-[12.5px]"
      >
        <div className="flex items-center gap-2">
          <ConnectorLogo
            id={c?.catalogId ?? connectorInfo.id}
            domain={c?.domain}
            name={connectorInfo.name}
            size={18}
            className="shrink-0 rounded-[4px]"
          />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">
              Allow <span className="text-foreground">{connectorInfo.name}</span> to run{' '}
              <code className="rounded bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
                {connectorInfo.tool}
              </code>
              ?
            </span>
          </div>
        </div>

        {tool.command && tool.command !== '{}' && (
          <div className="mt-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Parameters
            </div>
            <pre className="slim-scroll max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-scrim/35 p-2 font-mono text-[11.5px] leading-[18px] text-soft-foreground">
              {tool.command}
            </pre>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="xs" onClick={() => decide(tool.id, 'deny')}>
            Deny
          </Button>
          <Button variant="secondary" size="xs" onClick={handleAlways}>
            Always allow
          </Button>
          <Button size="xs" autoFocus onClick={() => decide(tool.id, 'once')}>
            Allow once
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label={tool.title}
      className="my-1.5 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-muted-foreground" />
        <span className="font-medium text-foreground">{QUESTION[tool.action]}</span>
        {tool.reason && <span className="min-w-0 truncate text-faint-foreground">{tool.reason}</span>}
      </div>
      <pre className="mt-2 overflow-x-auto rounded-md bg-scrim/25 px-2.5 py-1.5 font-mono text-[11.5px] leading-5 text-soft-foreground">
        {tool.action !== 'browse' && tool.action !== 'web' && tool.action !== 'memory' && <span className="select-none text-faint-foreground">$ </span>}
        {tool.command}
      </pre>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={() => decide(tool.id, 'deny')}>
          {tool.action === 'memory' ? 'Skip' : 'Deny'}
        </Button>
        {tool.action !== 'remove' && (
          <Button variant="secondary" size="xs" onClick={() => decide(tool.id, 'always')}>
            {tool.action === 'memory' ? 'Always save' : 'Always allow'}
          </Button>
        )}
        <Button size="xs" autoFocus onClick={() => decide(tool.id, 'once')}>
          {tool.action === 'memory' ? 'Save' : 'Allow once'}
        </Button>
      </div>
    </div>
  )
}
