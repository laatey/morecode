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
  /** Messages per day on this plan (drives the "limit reached" demo). */
  dailyMessages: number
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    tagline: 'Try it on a small project',
    perks: ['25 messages a day', 'Fast model for quick edits', 'One project at a time'],
    dailyMessages: 25
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 20,
    yearly: 16,
    tagline: 'For building every day',
    perks: [
      'Around 10× more usage',
      'Every model, including the most capable',
      'Unlimited projects',
      'Plan mode and checkpoints'
    ],
    dailyMessages: 400
  },
  {
    id: 'max',
    name: 'Max',
    monthly: 100,
    yearly: 85,
    tagline: 'For heavy, all-day work',
    perks: [
      'Around 5× more than Pro',
      'Priority when things are busy',
      'Run several tasks at once',
      'Early access to new features'
    ],
    dailyMessages: 2000
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
