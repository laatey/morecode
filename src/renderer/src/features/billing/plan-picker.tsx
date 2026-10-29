import React, { useState } from 'react'
import { Check, KeyRound, Loader2, Lock, Sparkles } from '@/components/icons'
import { useAuth } from '@/features/auth/auth-store'
import { errorText, FormError, Submit, TextLink } from '@/features/auth/ui'
import { cn } from '@/lib/utils'
import type { Card } from '@/features/auth/auth-service'
import { toCard, validateCard } from './card'
import { buttonVariants } from '@/components/ui/button'
import type { BillingConfig } from '@/features/auth/auth-service'
import { HostedCheckout } from './hosted-checkout'
import { PLANS, getPlan, type Plan, type PlanId } from './plans'
import { money, priceOf, useBillingConfig, yearlySaving } from './prices'

const PLAN_HIGHLIGHTS: Record<PlanId, string> = {
  free: 'Fast everyday model',
  pro: 'All frontier models',
  max: 'All models + priority'
}

function PlanCard({
  plan,
  yearly,
  cfg,
  current,
  unavailable,
  onChoose
}: {
  plan: Plan
  yearly: boolean
  cfg: BillingConfig
  current: boolean
  /** Paid plans cannot be bought on this server. */
  unavailable: boolean
  onChoose: () => void
}): React.JSX.Element {
  const price = priceOf(cfg, plan.id, yearly)
  const blocked = unavailable && plan.id !== 'free'
  const featured = plan.id === 'pro'
  const highlights = PLAN_HIGHLIGHTS[plan.id]
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[16px] border bg-white/[0.02]',
        featured ? 'border-white/[0.18]' : 'border-white/[0.1]'
      )}
    >
      <div className="rounded-[15px] border-b border-white/[0.1] bg-white/[0.03] p-5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-[20px] font-semibold tracking-tight text-[#ececea]">{plan.name}</h3>
          {featured && (
            <span className="rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#d4d4d0]">
              Popular
            </span>
          )}
        </div>
        <p className="mt-1.5 min-h-[36px] text-[13px] leading-[1.45] text-[#c9c9c6]">{plan.tagline}</p>

        <div className="mt-4">
          <div className="font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums text-[#ececea]">
            {money(price, cfg.currency)}
          </div>
          <div className="mt-1.5 text-[12.5px] text-[#8d8d8a]">{price === 0 ? 'forever' : '/ month'}</div>
        </div>

        <div className="mt-4 flex h-8 items-center justify-between rounded-[7px] border border-white/[0.12] bg-white/[0.04] px-3 text-[12.5px] font-medium text-[#e6e6e3]">
          <span>{plan.dailyMessages.toLocaleString()} messages / day</span>
        </div>

        <button
          type="button"
          disabled={current || blocked}
          onClick={onChoose}
          className="mt-3 h-9 w-full cursor-pointer rounded-[7px] border border-white/[0.14] bg-white/[0.05] px-3 text-[13px] font-medium text-[#ececea] transition-colors hover:border-white/[0.24] hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {current
            ? 'Your current plan'
            : blocked
              ? 'Not available yet'
              : plan.id === 'free'
                ? 'Continue with Free'
                : `Choose ${plan.name}`}
        </button>
      </div>

      <div className="px-5 py-3.5 text-[12.5px] font-medium text-[#d8d8d4]">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#8d8d8a]" />
          <span>{highlights}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-2.5 border-t border-white/[0.07] px-5 py-4">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-[13px] font-medium leading-5 text-[#ececea]">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 stroke-[2.2] text-[#b5b5b0]" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Pretend checkout. Card details are checked for typos and then thrown away; nothing is stored. */
function Checkout({
  plan,
  yearly,
  cfg,
  onBack,
  onDone
}: {
  plan: Plan
  yearly: boolean
  cfg: BillingConfig
  onBack: () => void
  onDone: (card: Card) => void
}): React.JSX.Element {
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const price = priceOf(cfg, plan.id, yearly)

  const pay = (e: React.FormEvent): void => {
    e.preventDefault()
    const problem = validateCard(number, expiry, cvc)
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    const card = toCard(number, expiry)
    setTimeout(() => onDone(card), 1300)
  }

  const box =
    'h-10 w-full rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-3 text-[14px] outline-none placeholder:text-[#77776f] focus:border-[#3b82f6]/70'
  return (
    <form onSubmit={pay} className="mx-auto max-w-[380px] space-y-4">
      <div>
        <h3 className="font-display text-[18px] font-semibold">Start {plan.name}</h3>
        <p className="mt-0.5 text-[13px] text-[#8d8d8a]">
          {money(price, cfg.currency)} a month{yearly ? `, billed yearly (${money(price * 12, cfg.currency)})` : ''}. Cancel any time.
        </p>
      </div>
      <label className="block text-[13px] text-[#c9c9c6]">
        Card number
        <input
          className={cn(box, 'mt-1.5')}
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[13px] text-[#c9c9c6]">
          Expiry
          <input
            className={cn(box, 'mt-1.5')}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={expiry}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(0, 4)
              setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
            }}
          />
        </label>
        <label className="block text-[13px] text-[#c9c9c6]">
          Security code
          <input
            className={cn(box, 'mt-1.5')}
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
      </div>
      <FormError>{error}</FormError>
      <Submit loading={busy}>
        <Lock className="h-3.5 w-3.5" /> Pay {money(price, cfg.currency)} and start
      </Submit>
      <p className="text-center text-[12px] text-[#77776f]">
        Demo checkout: nothing is charged. Only the card brand and last four digits are kept.{' '}
        <TextLink disabled={busy} onClick={onBack}>
          Choose a different plan
        </TextLink>
      </p>
    </form>
  )
}

function ApiKeyBox({ onSaved }: { onSaved: (key: string) => void }): React.JSX.Element {
  const { service } = useAuth()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = (e: React.FormEvent): void => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    service
      .testApiKey(key)
      .then(() => onSaved(key.trim()))
      .catch((err) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-4 py-3">
      <div className="flex items-center gap-3">
        <KeyRound className="h-4 w-4 shrink-0 text-[#8d8d8a]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#ececea]">Use your own API key</div>
          <div className="text-[12px] leading-5 text-[#8d8d8a]">
            Pay your provider directly and skip the daily message limit.
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Add key
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={save} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              autoFocus
              type="password"
              value={key}
              autoComplete="off"
              spellCheck={false}
              aria-label="API key"
              placeholder="sk-…"
              onChange={(e) => setKey(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-3 font-mono text-[12.5px] outline-none placeholder:text-[#77776f] focus:border-[#3b82f6]/70"
            />
            <button type="submit" disabled={busy || !key.trim()} className={buttonVariants({ size: 'sm' })}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save key
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-[#f0746c]">
              {error}
            </p>
          ) : (
            <p className="text-[12px] text-[#77776f]">Kept on this computer. You can remove it later.</p>
          )}
        </form>
      )}
    </div>
  )
}

/** Three plans, a monthly/yearly switch, pretend checkout, and the bring-your-own-key option. */
export function PlanPicker({
  current,
  compact,
  onChosen,
  onPaid,
  onKey
}: {
  current?: PlanId
  /** Fewer controls: no billing switch, and the API key option sits behind a link. */
  compact?: boolean
  /** Called once Free is chosen, or a demo plan is "paid" for. */
  onChosen: (id: PlanId, extra?: { yearly: boolean; card: Card }) => void
  /** Called once a real payment is confirmed; the account has already been updated. */
  onPaid: (id: PlanId) => void
  onKey: (key: string) => void
}): React.JSX.Element {
  const [yearly, setYearly] = useState(!compact)
  const [keyOpen, setKeyOpen] = useState(false)
  const [paying, setPaying] = useState<PlanId | null>(null)
  const { cfg, ready } = useBillingConfig()

  if (!ready) return <p className="py-10 text-center text-[13px] text-[#8d8d8a]">Loading plans…</p>

  if (paying) {
    return cfg.billing === 'paystack' ? (
      <HostedCheckout plan={getPlan(paying)} yearly={yearly} cfg={cfg} onBack={() => setPaying(null)} onPaid={onPaid} />
    ) : (
      <Checkout
        plan={getPlan(paying)}
        yearly={yearly}
        cfg={cfg}
        onBack={() => setPaying(null)}
        onDone={(card) => onChosen(paying, { yearly, card })}
      />
    )
  }

  const saving = yearlySaving(cfg)

  return (
    <div className="space-y-4">
      {!compact && (
      <div className="flex justify-center">
        <div role="tablist" className="inline-flex rounded-[9px] bg-white/[0.06] p-0.5 text-[13px]">
          {[
            [false, 'Monthly'],
            [true, saving > 0 ? `Yearly · save up to ${saving}%` : 'Yearly']
          ].map(([v, label]) => (
            <button
              key={String(label)}
              role="tab"
              type="button"
              aria-selected={yearly === v}
              onClick={() => setYearly(v as boolean)}
              className={cn(
                'cursor-pointer rounded-[7px] px-3 py-1 transition-colors',
                yearly === v ? 'bg-white/[0.12] text-[#ececea]' : 'text-[#8d8d8a] hover:text-[#ececea]'
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            yearly={yearly}
            cfg={cfg}
            unavailable={cfg.billing === 'off'}
            current={current === p.id}
            onChoose={() => (p.id === 'free' ? onChosen('free') : setPaying(p.id))}
          />
        ))}
      </div>
      {compact && !keyOpen ? (
        <p className="text-center text-[12.5px] text-[#8d8d8a]">
          Have your own API key?{' '}
          <button type="button" onClick={() => setKeyOpen(true)} className="cursor-pointer text-[#7db1ff] hover:underline">
            Use it instead
          </button>
        </p>
      ) : (
        <ApiKeyBox onSaved={onKey} />
      )}
    </div>
  )
}
