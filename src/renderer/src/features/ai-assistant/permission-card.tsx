import React from 'react'
import { Check, ShieldCheck, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
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

/** "The AI wants to run npm install": allow once, always, or deny. Kept small on purpose. */
export function PermissionCard({ tool }: { tool: Permission }): React.JSX.Element {
  const { decide } = useChatContext()

  if (tool.state !== 'pending') {
    const ok = tool.state === 'allowed' || tool.state === 'always'
    return (
      <div className="flex min-h-6 min-w-0 items-center gap-2 px-1 py-0.5 text-[12.5px]">
        {ok ? (
          <Check className="h-3 w-3 shrink-0 text-[var(--diff-add)]" />
        ) : (
          <X className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 whitespace-nowrap text-[#d6d6d3]">{RESULT[tool.state]}</span>
        <code className="min-w-0 flex-1 truncate rounded-[4px] bg-white/[0.05] px-1.5 font-mono text-[11.5px] leading-[18px] text-[#a9a9a6]">
          {tool.command}
        </code>
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
