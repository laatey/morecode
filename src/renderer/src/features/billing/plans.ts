export type PlanId = 'free' | 'pro' | 'max'

export interface Plan {
  id: PlanId
  name: string
  /** Monthly price in USD; 0 for free. */
  monthly: number
  /** Price per month when billed yearly. */
  yearly: number
  tagline: string
  perks: string[]
  /** How big this plan's 5-hour and weekly allowance is, in a few words. */
  allowance: string
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    tagline: 'Try it on a small project',
    perks: ['A small 5-hour and weekly allowance', 'Fast model for quick edits', 'One project at a time'],
    allowance: 'Small allowance'
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 20,
    yearly: 16,
    tagline: 'For building every day',
    perks: [
      'Much higher 5-hour and weekly limits',
      'Every model, including the most capable',
      'Unlimited projects',
      'Plan mode and checkpoints'
    ],
    allowance: 'Standard allowance'
  },
  {
    id: 'max',
    name: 'Max',
    monthly: 100,
    yearly: 85,
    tagline: 'For heavy, all-day work',
    perks: [
      '5× the limits of Pro',
      'Priority when things are busy',
      'Run several tasks at once',
      'Early access to new features'
    ],
    allowance: '5× Pro'
  }
]

export const getPlan = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0]

/**
 * The Claude models each plan includes when the AI is reached through MoreCode. The server is what enforces this
 * (server/src/config.mjs); the app only uses it to show what is locked instead of quietly answering with another model.
 */
const PLAN_MODELS: Record<PlanId, string[]> = {
  free: ['claude-haiku-5-5'],
  pro: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  max: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']
}

export const planAllows = (plan: PlanId, model: string): boolean => PLAN_MODELS[plan].includes(model)
