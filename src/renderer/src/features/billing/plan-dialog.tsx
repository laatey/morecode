import React, { useEffect, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { getPlan } from './plans'
import { PlanPicker } from './plan-picker'
import { buttonVariants } from '@/components/ui/button'

/** Hours until local midnight, when the daily message count starts again. */
const hoursToReset = (): number => {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000))
}

/**
 * One dialog for two moments: "you ran out of messages today" and "I want a bigger plan".
 * Open it from anywhere with useAuth().openPlanDialog('limit' | 'upgrade').
 */
export function PlanDialog(): React.JSX.Element | null {
  const { account, planDialog, closePlanDialog, update, choosePlan } = useAuth()
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    if (!planDialog) return
    setChoosing(planDialog === 'upgrade')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePlanDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [planDialog, closePlanDialog])

  if (!planDialog || !account) return null
  const plan = getPlan(account.plan)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={closePlanDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={planDialog === 'limit' ? 'Daily limit reached' : 'Choose a plan'}
        onMouseDown={(e) => e.stopPropagation()}
        className="slim-scroll max-h-full w-full max-w-[760px] select-text overflow-y-auto rounded-[14px] border border-white/[0.1] bg-[#242423] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-tight">
              {choosing ? 'Choose your plan' : 'You’ve used today’s messages'}
            </h2>
            <p className="mt-1 text-[14px] leading-6 text-[#8d8d8a]">
              {choosing
                ? `You’re on ${plan.name}${account.apiKey ? ' with your own API key' : ''}.`
                : `The ${plan.name} plan includes ${plan.dailyMessages} a day. They come back in about ${hoursToReset()} hours.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closePlanDialog}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[7px] text-[#8d8d8a] transition-colors hover:bg-white/[0.08] hover:text-[#ececea]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {choosing ? (
          <PlanPicker
            current={account.plan}
            onChosen={(id, extra) => {
              void choosePlan(id, extra)
              toast(`You’re on ${getPlan(id).name}`)
              closePlanDialog()
            }}
            onPaid={(id) => {
              toast(`You’re on ${getPlan(id).name}`)
              closePlanDialog()
            }}
            onKey={(key) => {
              void update({ apiKey: key })
              toast('API key saved. No daily limit now.')
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
                body: `Your messages come back in about ${hoursToReset()} hours.`,
                action: 'Okay',
                run: closePlanDialog
              }
            ].map((o) => (
              <div key={o.title} className="flex flex-col rounded-[12px] border border-white/[0.1] p-4">
                {o.title === 'Wait it out' && <Clock className="mb-2 h-4 w-4 text-[#8d8d8a]" />}
                <h3 className="text-[14px] font-medium">{o.title}</h3>
                <p className="mt-1 flex-1 text-[13px] leading-5 text-[#8d8d8a]">{o.body}</p>
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
      </div>
    </div>
  )
}
