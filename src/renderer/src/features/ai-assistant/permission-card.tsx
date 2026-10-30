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
  network: 'Use the internet?'
}

const RESULT: Record<Exclude<Permission['state'], 'pending'>, string> = {
  allowed: 'Allowed once',
  always: 'Always allowed',
  denied: 'Not allowed',
  blocked: 'Blocked by your settings'
}

/** "The AI wants to run npm install" or an MCP tool: allow once, always, or deny. Kept small on purpose. */
export function PermissionCard({ tool }: { tool: Permission }): React.JSX.Element {
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
            <span className="shrink-0 whitespace-nowrap text-[#d6d6d3]">{RESULT[tool.state]}</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {connectorInfo.name} <span className="text-[#8e8e8a]">→</span>{' '}
              <code className="font-mono text-[11.5px] text-[#e2e2e0]">{connectorInfo.tool}</code>
            </span>
          </>
        ) : (
          <>
            <span className="shrink-0 whitespace-nowrap text-[#d6d6d3]">{RESULT[tool.state]}</span>
            <code className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 font-mono text-[11.5px] leading-[18px] text-[#a9a9a6]">
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
        className="my-1.5 rounded-lg border border-white/[0.08] bg-[#242423] p-3 text-[12.5px]"
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
            <span className="font-medium text-[#ededeb]">
              Allow <span className="text-white">{connectorInfo.name}</span> to run{' '}
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[11.5px] text-[#e2e2e0]">
                {connectorInfo.tool}
              </code>
              ?
            </span>
          </div>
        </div>

        {tool.command && tool.command !== '{}' && (
          <div className="mt-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a9a9a4]">
              Parameters
            </div>
            <pre className="slim-scroll max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/35 p-2 font-mono text-[11.5px] leading-[18px] text-[#cfcfcc]">
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
      className="my-1.5 rounded-lg border border-white/[0.08] bg-[#242423] px-3 py-2.5"
    >
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-[#8d8d8a]" />
        <span className="font-medium text-[#ededeb]">{QUESTION[tool.action]}</span>
        {tool.reason && <span className="min-w-0 truncate text-[#77776f]">{tool.reason}</span>}
      </div>
      <pre className="mt-2 overflow-x-auto rounded-md bg-black/25 px-2.5 py-1.5 font-mono text-[11.5px] leading-5 text-[#cfcfcc]">
        <span className="select-none text-[#77776f]">$ </span>
        {tool.command}
      </pre>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={() => decide(tool.id, 'deny')}>
          Deny
        </Button>
        {tool.action !== 'remove' && (
          <Button variant="secondary" size="xs" onClick={() => decide(tool.id, 'always')}>
            Always allow
          </Button>
        )}
        <Button size="xs" autoFocus onClick={() => decide(tool.id, 'once')}>
          Allow once
        </Button>
      </div>
    </div>
  )
}
