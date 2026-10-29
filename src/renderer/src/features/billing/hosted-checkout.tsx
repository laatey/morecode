import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Lock } from '@/components/icons'
import { useAuth } from '@/features/auth/auth-store'
import { errorText, FormError, Submit, TextLink } from '@/features/auth/ui'
import type { BillingConfig } from '@/features/auth/auth-service'
import { buttonVariants } from '@/components/ui/button'
import { money, priceOf } from './prices'
import type { Plan, PlanId } from './plans'

const POLL_MS = 2500
const GIVE_UP_MS = 15 * 60_000

/**
 * Paying for a plan on a MoreCode server. The card is typed on Paystack's own page in your browser, never
 * here: this screen opens that page, then waits for the server to confirm the payment.
 */
export function HostedCheckout({
  plan,
  yearly,
  cfg,
  onBack,
  onPaid
}: {
  plan: Plan
  yearly: boolean
  cfg: BillingConfig
  onBack: () => void
  onPaid: (id: PlanId) => void
}): React.JSX.Element {
  const { service, applyAccount } = useAuth()
  const [phase, setPhase] = useState<'ready' | 'starting' | 'waiting'>('ready')
  const [error, setError] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const reference = useRef<string | null>(null)
  const alive = useRef(true)
  const price = priceOf(cfg, plan.id, yearly)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Ask the server whether the payment went through. Returns true once the plan is active. */
  const check = useCallback(async (): Promise<boolean> => {
    if (!service.billing || !reference.current) return false
    const r = await service.billing.status(reference.current)
    if (!alive.current) return true
    if (r.status === 'success') {
      applyAccount(r.account)
      onPaid(plan.id)
      return true
    }
    if (r.status === 'failed') {
      setError('The payment did not go through, and you have not been charged. You can try again.')
      setPhase('ready')
      return true
    }
    if (r.status === 'rejected') {
      setError(`We could not match that payment to ${plan.name}. If you were charged, contact support and quote ${reference.current}.`)
      setPhase('ready')
      return true
    }
    return false
  }, [service, applyAccount, onPaid, plan.id, plan.name])

  // while the payment page is open, keep asking until the server confirms (or the person gives up)
  useEffect(() => {
    if (phase !== 'waiting') return
    const started = Date.now()
    let stopped = false
    const tick = async (): Promise<void> => {
      if (stopped) return
      try {
        if (await check()) return
      } catch {
        // a dropped connection: keep waiting and ask again
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setError('We have not heard back about the payment. If you paid, your plan switches on as soon as it is confirmed.')
        setPhase('ready')
        return
      }
      setTimeout(() => void tick(), POLL_MS)
    }
    const first = setTimeout(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      clearTimeout(first)
    }
  }, [phase, check])

  const start = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!service.billing) return
    setError(null)
    setPhase('starting')
    service.billing
      .checkout(plan.id as 'pro' | 'max', yearly)
      .then(({ url, reference: ref }) => {
        reference.current = ref
        setPageUrl(url)
        window.open(url, '_blank')
        setPhase('waiting')
      })
      .catch((err) => {
        setError(errorText(err))
        setPhase('ready')
      })
  }

  const [checking, setChecking] = useState(false)
  const checkNow = (): void => {
    setChecking(true)
    check()
      .then((done) => {
        if (!done) setError('Not confirmed yet. If you just paid, give it a few seconds.')
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setChecking(false))
  }

  return (
    <form onSubmit={start} className="mx-auto max-w-[380px] space-y-4">
      <div>
        <h3 className="font-display text-[18px] font-semibold">Start {plan.name}</h3>
        <p className="mt-0.5 text-[13px] text-[#8d8d8a]">
          {money(price, cfg.currency)} a month{yearly ? `, billed yearly (${money(price * 12, cfg.currency)})` : ''}. Cancel any time and keep
          what you have paid for.
        </p>
      </div>

      {phase === 'waiting' ? (
        <div className="space-y-3 rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] text-[#ececea]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for your payment
          </p>
          <p className="text-[12.5px] leading-5 text-[#8d8d8a]">
            Finish paying in the page that opened in your browser. This screen updates by itself when it is confirmed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={checking} onClick={checkNow} className={buttonVariants({ size: 'sm' })}>
              {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              I have paid
            </button>
            {pageUrl && (
              <button type="button" onClick={() => window.open(pageUrl, '_blank')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <ExternalLink className="h-3.5 w-3.5" /> Open the payment page again
              </button>
            )}
          </div>
        </div>
      ) : (
        <Submit loading={phase === 'starting'}>
          <Lock className="h-3.5 w-3.5" /> Continue to secure payment
        </Submit>
      )}

      <FormError>{error}</FormError>
      <p className="text-center text-[12px] text-[#77776f]">
        You pay on Paystack&apos;s page, so MoreCode never sees your card number.{' '}
        <TextLink disabled={phase === 'starting'} onClick={onBack}>
          Choose a different plan
        </TextLink>
      </p>
    </form>
  )
}
