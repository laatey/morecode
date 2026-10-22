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
