import React from 'react'
import { CONTEXT_WINDOW, getContextRows } from './usage-data'
import { modelName } from '../models'
import type { PanelContext } from './panel-shell'
import { fmtTokens, PanelFrame, percentOf } from './ui'

export function StatusPanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  const { used } = getContextRows(ctx.totals)
  const rows: [string, React.ReactNode][] = [
    ['Model', modelName(ctx.model)],
    ['Edits', ctx.autoAccept ? 'Accepted automatically' : 'Wait for your review'],
    [
      'Context',
      `${fmtTokens(used)} of ${fmtTokens(CONTEXT_WINDOW)} (${Math.round(percentOf(used, CONTEXT_WINDOW))}%)`
    ],
    ['Tokens this chat', fmtTokens(ctx.totals.tokens)],
    [
      'Waiting for review',
      ctx.totals.files
        ? `${ctx.totals.files} ${ctx.totals.files === 1 ? 'file' : 'files'}`
        : 'Nothing'
    ]
  ]
  return (
    <PanelFrame title="Status" onClose={onClose} width={380}>
      <dl className="divide-y divide-white/[0.06] text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2">
            <dt className="text-[#8d8d8a]">{k}</dt>
            <dd className="text-[#ececea]">{v}</dd>
          </div>
        ))}
      </dl>
    </PanelFrame>
  )
}
