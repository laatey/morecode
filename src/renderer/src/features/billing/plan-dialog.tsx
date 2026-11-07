import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ModalOverlay } from '@/components/modal-overlay'
import { Clock, X } from '@/components/icons'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { getPlan } from './plans'
import { resetsIn } from './limits'
import { PlanPicker } from './plan-picker'
import { buttonVariants } from '@/components/ui/button'

/**
 * One dialog for two moments: "you reached your usage limit" and "I want a bigger plan".
 * Open it from anywhere with useAuth().openPlanDialog('limit' | 'upgrade').
 */
type Reason = NonNullable<ReturnType<typeof useAuth>['planDialog']>

export function PlanDialog(): React.JSX.Element {
  const { account, planDialog, closePlanDialog } = useAuth()
  return (
    <Dialog.Root
      open={Boolean(planDialog && account)}
      onOpenChange={(open) => !open && closePlanDialog()}
    >
      <Dialog.Portal>
        <ModalOverlay />
        {planDialog && account && <PlanDialogBody reason={planDialog} />}
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Mounted only while open, so it starts fresh each time: on the plans for "upgrade", on the options for "limit". */
function PlanDialogBody({ reason }: { reason: Reason }): React.JSX.Element | null {
  const { account, closePlanDialog, update, choosePlan, limitHit } = useAuth()
  const [choosing, setChoosing] = useState(reason === 'upgrade')
  if (!account) return null
  const plan = getPlan(account.plan)

  return (
    <Dialog.Content
      aria-describedby={undefined}
      className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[min(860px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 outline-none slim-scroll select-text overflow-y-auto rounded-[11px] border border-border bg-card p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Dialog.Title className="font-display text-[22px] font-semibold tracking-tight">
            {choosing ? 'Choose your plan' : limitHit?.kind === 'week' ? 'You’ve reached this week’s limit' : 'You’ve reached your 5-hour limit'}
          </Dialog.Title>
          <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
            {choosing
              ? `You’re on ${plan.name}${account.apiKey ? ' with your own API key' : ''}.`
              : `${resetsIn(limitHit?.resetsAt ?? null)}. A bigger plan raises both the 5-hour and the weekly limit.`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closePlanDialog}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {choosing ? (
        <PlanPicker
          current={account.plan}
          onChosen={(id, extra) => {
            void choosePlan(id, extra)
            toast.success(`You’re on ${getPlan(id).name}`)
            closePlanDialog()
          }}
          onPaid={(id) => {
            toast.success(`You’re on ${getPlan(id).name}`)
            closePlanDialog()
          }}
          onKey={(key) => {
            void update({ apiKey: key })
            toast.success('API key saved. No daily limit now.')
            closePlanDialog()
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              title: 'Upgrade',
              body: 'Get far more messages and every model.',
              action: 'See plans',
              primary: true,
              run: () => setChoosing(true)
            },
            {
              title: 'Use your own key',
              body: 'Connect an API key and keep going right now.',
              action: 'Add a key',
              run: () => setChoosing(true)
            },
            {
              title: 'Wait it out',
              body: `${resetsIn(limitHit?.resetsAt ?? null)}.`,
              action: 'Okay',
              run: closePlanDialog
            }
          ].map((o) => (
            <div
              key={o.title}
              className="flex flex-col rounded-[12px] border border-border p-4"
            >
              {o.title === 'Wait it out' && <Clock className="mb-2 h-4 w-4 text-muted-foreground" />}
              <h3 className="text-[14px] font-medium">{o.title}</h3>
              <p className="mt-1 flex-1 text-[13px] leading-5 text-muted-foreground">{o.body}</p>
              <button
                type="button"
                onClick={o.run}
                className={
                  o.primary
                    ? buttonVariants({ className: 'mt-4' })
                    : buttonVariants({ variant: 'secondary', className: 'mt-4' })
                }
              >
                {o.action}
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog.Content>
  )
}
