import { useEffect, useState } from 'react'
import type { BillingConfig } from '@/features/auth/auth-service'
import { HOSTED, hostedRequest } from '@/features/auth/http-auth-service'
import { PLANS, type PlanId } from './plans'

/** Used with the built-in demo accounts: the prices written in plans.ts, in US dollars, with a pretend checkout. */
const DEMO: BillingConfig = {
  billing: 'demo',
  currency: 'USD',
  prices: {
    pro: { monthly: PLANS.find((p) => p.id === 'pro')!.monthly, yearly: PLANS.find((p) => p.id === 'pro')!.yearly },
    max: { monthly: PLANS.find((p) => p.id === 'max')!.monthly, yearly: PLANS.find((p) => p.id === 'max')!.yearly }
  }
}

let loaded: BillingConfig | null = null
let loading: Promise<BillingConfig> | null = null

/** With no server: demo prices while developing, and no payments at all in an installed build. */
const STANDALONE: BillingConfig = import.meta.env.PROD ? { ...DEMO, billing: 'off' } : DEMO

/**
 * How the server takes payment and what it charges. Fetched once. If the server cannot be reached this says
 * "off" (rather than guessing) and is not remembered, so the next look tries again.
 */
export function loadBillingConfig(): Promise<BillingConfig> {
  if (!HOSTED) return Promise.resolve(STANDALONE)
  if (loaded) return Promise.resolve(loaded)
  loading ??= hostedRequest<Partial<BillingConfig>>('GET', '/v1/config')
    .then((c) => {
      const cfg: BillingConfig = { billing: c.billing ?? 'off', currency: c.currency ?? 'USD', prices: c.prices ?? DEMO.prices }
      loaded = cfg
      return cfg
    })
    .catch(() => ({ ...DEMO, billing: 'off' as const }))
    .finally(() => {
      loading = null
    })
  return loading
}

/** `ready` is false only while a hosted server is being asked, so no wrong price is flashed first. */
export function useBillingConfig(): { cfg: BillingConfig; ready: boolean } {
  const [cfg, setCfg] = useState<BillingConfig | null>(HOSTED ? loaded : STANDALONE)
  useEffect(() => {
    if (cfg) return
    let live = true
    void loadBillingConfig().then((c) => live && setCfg(c))
    return () => {
      live = false
    }
  }, [cfg])
  return { cfg: cfg ?? { ...DEMO, billing: 'off' }, ready: cfg !== null }
}

/** 250 -> "GH₵250" or "GHS 250", whichever the person's locale uses. Whole amounts have no decimals. */
export function money(amount: number, currency = 'USD'): string {
  const whole = Number.isInteger(amount)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

/** Price per month on a plan (0 for Free). */
export const priceOf = (cfg: BillingConfig, id: PlanId, yearly: boolean): number =>
  id === 'free' ? 0 : cfg.prices[id][yearly ? 'yearly' : 'monthly']

/** The biggest saving, in whole percent, that paying yearly gives on any plan. */
export const yearlySaving = (cfg: BillingConfig): number =>
  Math.max(0, ...(['pro', 'max'] as const).map((id) => Math.round((1 - cfg.prices[id].yearly / cfg.prices[id].monthly) * 100)))
