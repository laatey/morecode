import React from 'react'
import { useSettings } from '@/features/settings/settings-store'
import { fromModelScopeId, isModelScope, toModelScopeId } from '../models'
import { ModelScopeBrowser } from '../modelscope-browser'
import type { PanelContext } from './panel-shell'
import { PanelFrame } from './ui'

/** Look up a model on ModelScope. Picking one switches to it and saves it to the model menu. */
export function ModelScopePanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  const { settings, set, openSettings } = useSettings()

  const pick = (name: string): void => {
    if (!settings.modelScopeModels.includes(name)) {
      set({ modelScopeModels: [name, ...settings.modelScopeModels].slice(0, 50) })
    }
    ctx.onModel(toModelScopeId(name))
    onClose()
    if (!settings.modelScopeKey) openSettings('models')
  }

  return (
    <PanelFrame title="Look up a ModelScope model" onClose={onClose} width={440}>
      {!settings.modelScopeKey && (
        <p className="mb-3 text-[12px] leading-4 text-[#8d8d8a]">
          You can browse without a key. To chat with one, add your ModelScope key in Settings, under
          Models.
        </p>
      )}
      <ModelScopeBrowser
        autoFocus
        current={isModelScope(ctx.model) ? fromModelScopeId(ctx.model) : null}
        onPick={pick}
      />
    </PanelFrame>
  )
}
