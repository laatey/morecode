import React, { useState } from 'react'
import { ExternalLink, Globe, Search } from '@/components/icons'
import { Row } from './row-parts'
import type { ToolBlock } from './types'

type Web = Extract<ToolBlock, { kind: 'web' }>

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const openUrl = (url: string): void => {
  const open = window.api?.git?.openUrl
  if (open) void open(url)
  else window.open(url, '_blank', 'noopener')
}

/** A web search or a page the AI read: one quiet line that opens to the results or an excerpt. */
export function WebRow({ tool }: { tool: Web }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const search = tool.op === 'search'
  const expandable =
    tool.status === 'error'
      ? Boolean(tool.error)
      : search
        ? Boolean(tool.results?.length)
        : Boolean(tool.excerpt)
  const Icon = search ? Search : Globe

  return (
    <div>
      <Row
        expandable={expandable}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        status={tool.status}
      >
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-muted-foreground">
          {search
            ? tool.status === 'running'
              ? 'Searching'
              : 'Searched'
            : tool.status === 'running'
              ? 'Reading'
              : 'Read'}
        </span>
        <span className="min-w-0 truncate rounded-[4px] bg-white/[0.05] px-1.5 text-[12px] leading-[18px] text-[#e2e2e0]">
          {search ? tool.query : host(tool.url ?? '')}
        </span>
        {search && tool.results && (
          <span className="shrink-0 text-[11.5px] text-muted-foreground/80">
            {tool.results.length} results
          </span>
        )}
        {!search && tool.title && (
          <span className="min-w-0 truncate text-muted-foreground/80">{tool.title}</span>
        )}
        {tool.status === 'error' && tool.error && (
          <span className="min-w-0 truncate text-[12px] text-[var(--diff-del)]/90">
            {tool.error}
          </span>
        )}
      </Row>
      {open && tool.status === 'error' && tool.error && (
        <p className="ml-5 mt-1 whitespace-pre-wrap rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[12px] leading-5 text-red-100">
          {tool.error}
        </p>
      )}
      {open && search && tool.results && (
        <ul className="ml-[22px] mt-1 mb-1.5 space-y-2 pr-1">
          {tool.results.map((r) => (
            <li key={r.url} className="min-w-0">
              <button
                type="button"
                onClick={() => openUrl(r.url)}
                className="group flex max-w-full cursor-pointer items-baseline gap-1.5 text-left"
              >
                <span className="min-w-0 truncate text-[12.5px] text-[#e2e2e0] group-hover:underline">
                  {r.title}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <div className="truncate text-[11px] text-muted-foreground/70">{host(r.url)}</div>
              {r.snippet && (
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-[18px] text-muted-foreground">
                  {r.snippet}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && !search && tool.excerpt && (
        <div className="ml-[22px] mt-1 mb-1.5 pr-1">
          <p className="line-clamp-6 whitespace-pre-wrap border-l-2 border-[#4a4a45] pl-3 text-[12px] leading-[18px] text-muted-foreground">
            {tool.excerpt}
          </p>
          <div className="mt-1.5 flex items-center gap-3 pl-3 text-[11px] text-muted-foreground/70">
            {tool.chars !== undefined && (
              <span>
                {tool.chars.toLocaleString()} characters{tool.clipped ? ', cut short' : ''}
              </span>
            )}
            {tool.url && (
              <button
                type="button"
                onClick={() => openUrl(tool.url as string)}
                className="flex cursor-pointer items-center gap-1 hover:text-foreground"
              >
                Open page <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
