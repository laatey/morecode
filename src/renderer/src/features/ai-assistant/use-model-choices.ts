import { useCallback, useMemo } from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { useSettings } from '@/features/settings/settings-store'
import { routeFor } from './ai-route'
import { MODELS, type ModelInfo } from './models'

export interface ModelChoice {
  model: ModelInfo
  /** The heading it sits under in a list. */
  group: string
  /** The person's plan does not include it. */
  locked: boolean
  /** It is a provider of their own that has no key yet. */
  needsSetup: boolean
}

/**
 * The models someone can pick, and what picking each one does. The model panel, the message box menu and the
 * command palette all list models; they share this so they cannot disagree about what is locked.
 */
export function useModelChoices(setModel: (id: string) => void): {
  choices: ModelChoice[]
  /** Pick a model. One the plan lacks opens the upgrade dialog instead. Returns whether it was picked. */
  choose: (choice: ModelChoice) => boolean
} {
  const { account, service, openPlanDialog } = useAuth()
  const { settings } = useSettings()

  const choices = useMemo<ModelChoice[]>(() => {
    return MODELS.map((model) => {
      const route = routeFor({
        model: model.id,
        settings,
        account,
        hosted: service.hosted ?? null
      })
      return {
        model,
        locked: route.blocked !== null,
        needsSetup: route.kind !== 'subscription' && route.missing !== null,
        group:
          model.source === 'modelscope'
            ? 'ModelScope'
            : model.source !== 'claude'
              ? 'Your own providers'
              : route.kind === 'own-key'
                ? 'Your API key'
                : 'Your plan'
      }
    })
  }, [settings, account, service.hosted])

  const choose = useCallback(
    (choice: ModelChoice): boolean => {
      if (choice.locked) {
        openPlanDialog('upgrade')
        return false
      }
      setModel(choice.model.id)
      return true
    },
    [openPlanDialog, setModel]
  )

  return { choices, choose }
}
