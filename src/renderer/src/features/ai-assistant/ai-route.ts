import type { Account } from '@/features/auth/auth-service'
import { planAllows } from '@/features/billing/plans'
import type { Settings } from '@/features/settings/settings-store'
import { sourceOf } from './models'

/**
 * How one message reaches an AI, decided in one place.
 *
 * Two kinds of people use the app and they must not be mixed up:
 *  - On the MoreCode subscription: the MoreCode server makes the request, under their plan. Messages are counted
 *    against the plan's daily limit and only the models the plan includes can be used.
 *  - Using their own provider (an Anthropic key, OpenRouter, their own gateway): the request goes straight to that
 *    provider with their key. MoreCode neither counts these messages nor limits them.
 */
export type RouteKind = 'subscription' | 'own-key' | 'gateway' | 'openrouter'

export interface AiRoute {
  kind: RouteKind
  /** Null when this route needs a key or sign-in that is not there yet. */
  apiKey: string | null
  baseUrl?: string
  /** Counted against the plan's daily messages. Only the subscription is. */
  metered: boolean
  /** The model the request really uses. */
  model: string
  /** Why the chosen model cannot be used on this route, in words for the person. Null when it can. */
  blocked: string | null
  /** What is missing before this route works, in words for the person. Null when ready. */
  missing: string | null
}

export interface RouteInput {
  model: string
  settings: Pick<Settings, 'morlineGatewayKey' | 'morlineGatewayUrl' | 'openRouterKey'>
  account: Pick<Account, 'apiKey' | 'plan'> | null
  /** The MoreCode server, when this build is connected to one. */
  hosted: { url: string; token: () => string | null } | null
}

export function routeFor({ model, settings, account, hosted }: RouteInput): AiRoute {
  const source = sourceOf(model)

  if (source === 'gateway') {
    const ready = Boolean(settings.morlineGatewayKey && settings.morlineGatewayUrl)
    return {
      kind: 'gateway',
      apiKey: settings.morlineGatewayKey || null,
      baseUrl: settings.morlineGatewayUrl || undefined,
      metered: false,
      model,
      blocked: null,
      missing: ready
        ? null
        : 'Connect your AI gateway in Settings, under Models, to use this model.'
    }
  }

  if (source === 'openrouter') {
    return {
      kind: 'openrouter',
      apiKey: settings.openRouterKey || null,
      baseUrl: 'https://openrouter.ai/api',
      metered: false,
      model,
      blocked: null,
      missing: settings.openRouterKey
        ? null
        : 'Add your OpenRouter key in Settings, under Models, to use this model.'
    }
  }

  // A Claude model. Their own key wins: it is theirs to spend and has no plan limits.
  if (account?.apiKey) {
    return {
      kind: 'own-key',
      apiKey: account.apiKey,
      metered: false,
      model,
      blocked: null,
      missing: null
    }
  }

  const token = hosted?.token() ?? null
  const plan = account?.plan ?? 'free'
  return {
    kind: 'subscription',
    apiKey: token,
    baseUrl: hosted ? `${hosted.url}/v1/ai` : undefined,
    metered: true,
    model,
    blocked: planAllows(plan, model)
      ? null
      : `Your ${plan === 'free' ? 'Free' : 'current'} plan does not include this model. Choose another, or upgrade.`,
    missing: token
      ? null
      : 'Sign in, or add your own API key in Settings, under Models, to start chatting.'
  }
}
