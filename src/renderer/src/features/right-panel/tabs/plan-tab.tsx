import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, Check, ClipboardList, Copy, Play, Plus, Trash2, X } from '@/components/icons'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/icon-button'
import { cn } from '@/lib/utils'
import { planPrompt, updatePlanSteps, usePlanHistory, type SavedPlan } from '../plan-history'
import { useChatContext, useChatInsights } from '@/features/ai-assistant/chat-context'
import type { ToolBlock } from '@/features/ai-assistant/types'
import { Chip, TabButton, TabEmpty, TabToolbar } from './tab-kit'

type Plan = Extract<ToolBlock, { kind: 'plan' }>

function PlanEditor({ plan }: { plan: Plan }): React.JSX.Element {
  const { approvePlan, ask, running, owner } = useChatContext()
  const [steps, setSteps] = useState(plan.steps)
  const [feedback, setFeedback] = useState('')
  const [asking, setAsking] = useState(false)
  const approved = plan.state === 'approved'

  const update = (i: number, text: string): void =>
    setSteps((l) => l.map((s, j) => (j === i ? text : s)))

  const approve = (): void => {
    const final = steps.map((s) => s.trim()).filter(Boolean)
    approvePlan(plan.id)
    updatePlanSteps(owner, plan.id, final)
    ask(planPrompt(final))
  }

  const requestChanges = (): void => {
    const text = feedback.trim()
    if (!text) return
    ask(`Update the plan: ${text}. Do not change any files yet.`)
    setFeedback('')
    setAsking(false)
  }

  return (
    <div className="slim-scroll h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        <header>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[14px] font-medium leading-5 text-[#ececea]">
              {plan.title}
            </h2>
            <Chip tone={approved ? 'good' : 'warn'}>{approved ? 'Approved' : 'Waiting for you'}</Chip>
          </div>
          <p className="text-[12.5px] leading-5 text-muted-foreground">{plan.summary}</p>
        </header>

        <section>
          <h3 className="mb-1.5 text-[12px] font-medium text-[#a8a8a6]">Steps</h3>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="group flex items-start gap-2.5">
                <span className="mt-[5px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] tabular-nums text-[#c9c9c6]">
                  {approved ? <Check className="h-3 w-3 stroke-[3] text-[#5fd17a]" /> : i + 1}
                </span>
                {approved ? (
                  <span className="py-1 text-[12.5px] leading-5 text-[#d6d6d3]">{step}</span>
                ) : (
                  <>
                    <textarea
                      aria-label={`Step ${i + 1}`}
                      value={step}
                      rows={Math.max(1, Math.ceil(step.length / 46))}
                      onChange={(e) => update(i, e.target.value)}
                      className="min-w-0 flex-1 resize-none rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] leading-5 text-[#d6d6d3] outline-none transition-colors hover:border-white/[0.1] focus:border-[#3b82f6]/60 focus:bg-white/[0.03]"
                    />
                    <button
                      type="button"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}
                      className="mt-[5px] grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-muted-foreground opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {!approved && (
            <TabButton onClick={() => setSteps((l) => [...l, ''])} className="mt-2 h-6 px-1.5 text-[11.5px]">
              <Plus className="h-3 w-3" /> Add a step
            </TabButton>
          )}
        </section>

        {!approved && (
          <section className="border-t border-white/[0.07] pt-3.5">
            {asking ? (
              <div>
                <textarea
                  autoFocus
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      requestChanges()
                    }
                  }}
                  rows={3}
                  placeholder="What should be different?"
                  className="w-full resize-none rounded-[8px] border border-white/[0.1] bg-transparent px-2.5 py-2 text-[12.5px] leading-5 outline-none placeholder:text-muted-foreground focus:border-[#3b82f6]/60"
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <TabButton onClick={() => setAsking(false)}>Cancel</TabButton>
                  <TabButton tone="primary" disabled={!feedback.trim() || running} onClick={requestChanges}>
                    Send
                  </TabButton>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <TabButton onClick={() => setAsking(true)}>Ask for changes</TabButton>
                <TabButton
                  tone="primary"
                  disabled={running || steps.every((s) => !s.trim())}
                  onClick={approve}
                  className="h-8 px-3.5"
                >
                  Approve and start
                </TabButton>
              </div>
            )}
            <p className="mt-2.5 text-[11.5px] text-muted-foreground">
              Nothing in your project changes until you approve.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function HistoryDetail({ plan, onBack }: { plan: SavedPlan; onBack: () => void }): React.JSX.Element {
  const { ask, running } = useChatContext()
  const { remove } = usePlanHistory()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar>
        <IconButton title="All plans" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </IconButton>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">{plan.title}</span>
        <IconButton
          title="Copy steps"
          onClick={() => {
            void navigator.clipboard.writeText(plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
            toast.success('Steps copied')
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title="Delete from history"
          onClick={() => {
            remove(plan.key)
            onBack()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </TabToolbar>
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <div>
            <p className="text-[12.5px] leading-5 text-muted-foreground">{plan.summary}</p>
            <p className="mt-1 text-[11.5px] text-[#77776f]">
              Made {formatDistanceToNow(plan.at, { addSuffix: true })}
            </p>
          </div>
          <ol className="space-y-1.5">
            {plan.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[2px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] tabular-nums text-[#c9c9c6]">
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-5 text-[#d6d6d3]">{step}</span>
              </li>
            ))}
          </ol>
          <div className="border-t border-white/[0.07] pt-3.5">
            <TabButton
              tone="primary"
              disabled={running}
              onClick={() => ask(planPrompt(plan.steps))}
              className="h-8 px-3.5"
            >
              <Play className="h-3 w-3 fill-current" /> Run this plan again
            </TabButton>
            <p className="mt-2.5 text-[11.5px] text-muted-foreground">
              The AI starts on these steps right away, using your project as it is now.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryList({ onPick }: { onPick: (p: SavedPlan) => void }): React.JSX.Element {
  const { plans, clear } = usePlanHistory()
  const { ask, running } = useChatContext()
  if (!plans.length) {
    return (
      <TabEmpty icon={ClipboardList} title="No earlier plans">
        Plans the AI makes are kept here, so you can read one again or run it a second time.
      </TabEmpty>
    )
  }
  return (
    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <ul className="space-y-1.5">
        {plans.map((p) => (
          <li
            key={p.key}
            className="group flex items-center gap-1 rounded-[8px] border border-white/[0.08] transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]"
          >
            <button
              type="button"
              onClick={() => onPick(p)}
              className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">{p.title}</span>
                <Chip tone={p.state === 'approved' ? 'good' : 'neutral'}>
                  {p.state === 'approved' ? 'Approved' : 'Not started'}
                </Chip>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                {p.steps.length} {p.steps.length === 1 ? 'step' : 'steps'} ·{' '}
                {formatDistanceToNow(p.at, { addSuffix: true })}
              </span>
            </button>
            <IconButton
              title="Run again"
              disabled={running}
              onClick={() => ask(planPrompt(p.steps))}
              className="mr-1.5 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
            >
              <Play className="h-3 w-3 fill-current" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-center">
        <TabButton onClick={clear} className="h-6 text-[11.5px]">
          Clear history
        </TabButton>
      </div>
    </div>
  )
}

/** "Plan": look over, edit and approve the AI's approach before it touches any files. */
export function PlanTab(): React.JSX.Element {
  const { plan } = useChatInsights()
  const { plans } = usePlanHistory()
  const [view, setView] = useState<'current' | 'history'>('current')
  const [picked, setPicked] = useState<SavedPlan | null>(null)

  const current = !plan ? (
    <TabEmpty
      icon={ClipboardList}
      title="No plan yet"
    >
      Ask for a plan in chat when you want to review an approach before work begins. You can change
      its steps and approve it before it edits any files.
    </TabEmpty>
  ) : (
    // keyed so a new plan starts with its own steps instead of the previous one's edits
    <PlanEditor key={plan.id} plan={plan} />
  )

  // nothing to switch between until there is a plan or a past one
  if (!plan && plans.length === 0) return current
  if (view === 'history' && picked) return <HistoryDetail plan={picked} onBack={() => setPicked(null)} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar className="py-1">
        <div className="flex items-center gap-0.5">
          {(
            [
              ['current', 'Current plan'],
              ['history', `History (${plans.length})`]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                'cursor-pointer rounded-[6px] px-2 py-0.5 text-[12px] transition-colors',
                view === id ? 'bg-white/[0.09] text-[#ececea]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </TabToolbar>
      <div className="min-h-0 flex-1">
        {view === 'history' ? (
          <div className="flex h-full min-h-0 flex-col">
            <HistoryList onPick={setPicked} />
          </div>
        ) : (
          current
        )}
      </div>
    </div>
  )
}
