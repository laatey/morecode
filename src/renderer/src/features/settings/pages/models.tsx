import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { errorText } from '@/features/auth/ui'
import { MODELS } from '@/features/ai-assistant/models'
import { Btn, Group, Page, Pick, Row, TextInput } from '../kit'
import { useSettings } from '../settings-store'

const mask = (key: string): string => `sk-…${key.slice(-4)}`

function ApiKeyRow(): React.JSX.Element {
  const { account, update, service } = useAuth()
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!account) return <></>

  if (account.apiKey) {
    return (
      <Row title="Your API key" description="Requests use your key. There is no daily message limit.">
        <span className="font-mono text-[12px] text-[#c9c9c6]">{mask(account.apiKey)}</span>
        <Btn
          variant="danger"
          onClick={() => {
            void update({ apiKey: null }).then(() => toast('API key removed'))
          }}
        >
          Remove
        </Btn>
      </Row>
    )
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#ededeb]">Use your own API key</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">
            Pay your provider directly and skip the daily limit.
          </div>
        </div>
        {!adding && <Btn onClick={() => setAdding(true)}>Add key</Btn>}
      </div>
      {adding && (
        <form
          className="mt-3 flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            service
              .testApiKey(key)
              .then(() => update({ apiKey: key.trim() }))
              .then(() => toast('API key saved'))
              .catch((err) => setError(errorText(err)))
              .finally(() => setBusy(false))
          }}
        >
          <div className="flex-1">
            <TextInput
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label="API key"
              placeholder="sk-…"
              className="font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            {error && <p className="mt-1.5 text-[12.5px] text-[#f4a39e]">{error}</p>}
          </div>
          <Btn variant="primary" type="submit" busy={busy} disabled={!key.trim()}>
            Test and save
          </Btn>
          <Btn onClick={() => setAdding(false)}>Cancel</Btn>
        </form>
      )}
    </div>
  )
}

export function ModelsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const current = MODELS.find((m) => m.id === settings.model)
  return (
    <Page title="Models" description="Choose what the AI uses by default. You can still switch in the message box.">
      <Group title="Default model">
        <Row title="Model" description={current?.description}>
          <Pick
            width={160}
            value={settings.model}
            onChange={(v) => set({ model: v })}
            options={MODELS.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Row>
      </Group>
      <Group title="Access">
        <ApiKeyRow />
      </Group>
    </Page>
  )
}
