import React from 'react'
import { ArrowRight, CircleHelp } from '@/components/icons'
import { Spinner } from './row-parts'
import type { ToolBlock } from './types'

type Q = Extract<ToolBlock, { kind: 'question' }>

/** What the AI asked and what the person chose. The questions themselves are asked above the message box. */
export function QuestionRow({ tool }: { tool: Q }): React.JSX.Element {
  if (tool.state === 'pending') {
    return (
      <div className="flex min-h-6 items-center gap-2 px-1 py-0.5 text-[12.5px] text-muted-foreground">
        <Spinner />
        <span>Waiting for your answer</span>
      </div>
    )
  }
  if (tool.state === 'skipped' || !tool.answers?.length) {
    return (
      <div className="flex min-h-6 items-center gap-2 px-1 py-0.5 text-[12.5px] text-muted-foreground">
        <CircleHelp className="h-3 w-3 shrink-0" />
        <span>Skipped a question</span>
        <span className="min-w-0 truncate text-muted-foreground/70">{tool.items[0]?.question}</span>
      </div>
    )
  }
  return (
    <ul className="space-y-0.5 px-1 py-0.5">
      {tool.answers.map((a) => (
        <li key={a.question} className="flex min-h-6 min-w-0 items-center gap-2 text-[12.5px]">
          <CircleHelp className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-muted-foreground">{a.question}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <span className="min-w-0 truncate rounded-[4px] bg-white/[0.07] px-1.5 text-[12px] leading-[18px] text-[#ededeb]">
            {a.answer}
          </span>
        </li>
      ))}
    </ul>
  )
}
