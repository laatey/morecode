import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { AuthError } from '@/features/auth/auth-service'
import { errorText } from '@/features/auth/ui'
import { MODELS, sourceOf } from '@/features/ai-assistant/models'
import { getPlan } from '@/features/billing/plans'
import { Btn, Group, Page, Pick, Row, TextInput } from '../kit'
import { useSettings } from '../settings-store'

const mask = (key: string): string => `${key.slice(0, 3)}…${key.slice(-4)}`

type Check = { ok: boolean; message?: string }
const must = (r: Check): void => {
  if (!r.ok) throw new AuthError('bad-key', r.message ?? 'That key was not accepted.')
}

/**
 * One way of using your own AI provider: connect it with a key (and an address, for a gateway), check it works
 * before saving, and remove it. Every provider is this same row, so they all behave the same.
 */
function ProviderRow({
  title,
  description,
  summary,
  connected,
  connectLabel,
  endpointPlaceholder,
  keyLabel,
  keyPlaceholder,
  initialEndpoint = '',
  test,
  save,
  remove,
  savedMessage
}: {
  title: string
  description: string
  /** What to show once connected: a masked key, or the address. */
  summary: string
  connected: boolean
  connectLabel: string
  /** Set only for providers that live at an address you give (a gateway). */
  endpointPlaceholder?: string
  keyLabel: string
  keyPlaceholder: string
  initialEndpoint?: string
  test: (input: { key: string; endpoint: string }) => Promise<void>
  save: (input: { key: string; endpoint: string }) => Promise<void> | void
  remove: () => Promise<void> | void
  savedMessage: string
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [endpoint, setEndpoint] = useState(initialEndpoint)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const input = { key: key.trim(), endpoint: endpoint.trim().replace(/\/$/, '') }
    setBusy(true)
    setError(null)
    test(input)
      .then(() => save(input))
      .then(() => {
        setAdding(false)
        setKey('')
        toast.success(savedMessage)
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-[180px] flex-1">
          <div className="text-[13px] text-[#ededeb]">{title}</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">{description}</div>
        </div>
        {connected && !adding ? (
          <div className="flex items-center gap-2">
            <span className="max-w-40 truncate font-mono text-[12px] text-[#c9c9c6]">
              {summary}
            </span>
            <Btn variant="danger" onClick={() => void Promise.resolve(remove())}>
              Remove
            </Btn>
          </div>
        ) : !adding ? (
          <Btn onClick={() => setAdding(true)}>{connectLabel}</Btn>
        ) : null}
      </div>
      {adding && (
        <form className="mt-3 space-y-2" onSubmit={submit}>
          {endpointPlaceholder && (
            <TextInput
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label={`${title} address`}
              placeholder={endpointPlaceholder}
              className="font-mono"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          )}
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <TextInput
                type="password"
                autoFocus={!endpointPlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-label={keyLabel}
                placeholder={keyPlaceholder}
                className="font-mono"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              {error && <p className="mt-1.5 text-[12.5px] text-[#f4a39e]">{error}</p>}
            </div>
            <Btn
              variant="primary"
              type="submit"
              busy={busy}
              disabled={!key.trim() || (Boolean(endpointPlaceholder) && !endpoint.trim())}
            >
              Test and save
            </Btn>
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </form>
      )}
    </div>
  )
}

/** Where the Claude models come from: your MoreCode plan, unless you added your own key below. */
function PlanRow(): React.JSX.Element | null {
  const { account, messagesLeft } = useAuth()
  const { setTab } = useSettings()
  if (!account) return null
  const plan = getPlan(account.plan)
  return (
    <Row
      title={`MoreCode ${plan.name}`}
      description={
        account.apiKey
          ? 'Not used while your own API key is added below.'
          : `${messagesLeft} of ${plan.dailyMessages} messages left today.`
      }
    >
      <Btn onClick={() => setTab('billing')}>Manage plan</Btn>
    </Row>
  )
}

export function ModelsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const { account, update, service } = useAuth()
  const current = MODELS.find((m) => m.id === settings.model)
  const source = sourceOf(settings.model)

  return (
    <Page
      title="Models"
      description="Choose what the AI uses by default. You can still switch in the message box."
    >
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

      <Group
        title="Your MoreCode plan"
        note={
          source === 'claude'
            ? 'Claude models run through your plan, with a daily message limit.'
            : 'This model does not use your plan, so it has no daily limit.'
        }
      >
        <PlanRow />
      </Group>

      <Group
        title="Your own providers"
        note="These skip your plan. Requests go straight to the provider with your key, and MoreCode does not count them."
      >
        {account && (
          <ProviderRow
            title="Anthropic API key"
            description="Use Claude with your own key. Overrides your plan for every Claude model."
            connected={Boolean(account.apiKey)}
            summary={account.apiKey ? mask(account.apiKey) : ''}
            connectLabel="Add key"
            keyLabel="Anthropic API key"
            keyPlaceholder="sk-ant-…"
            test={({ key }) => service.testApiKey(key)}
            save={({ key }) => update({ apiKey: key })}
            remove={() => update({ apiKey: null }).then(() => void toast.success('API key removed'))}
            savedMessage="API key saved"
          />
        )}
        <ProviderRow
          title="OpenRouter"
          description="Free community models through OpenRouter. Requests can be rate limited."
          connected={Boolean(settings.openRouterKey)}
          summary={settings.openRouterKey ? mask(settings.openRouterKey) : ''}
          connectLabel="Add key"
          keyLabel="OpenRouter API key"
          keyPlaceholder="sk-or-v1-…"
          test={({ key }) =>
            window.api.agent.testProvider({ provider: 'openrouter', key }).then(must)
          }
          save={({ key }) => set({ openRouterKey: key })}
          remove={() => set({ openRouterKey: '' })}
          savedMessage="OpenRouter key saved"
        />
        <ProviderRow
          title="AI gateway"
          description="Your own AI gateway service. The provider keys stay on that service."
          connected={Boolean(settings.morlineGatewayUrl && settings.morlineGatewayKey)}
          summary={settings.morlineGatewayUrl}
          connectLabel="Connect"
          endpointPlaceholder="https://ai-gateway.example.com"
          keyLabel="Gateway key"
          keyPlaceholder="Gateway key"
          initialEndpoint={settings.morlineGatewayUrl}
          test={({ key, endpoint }) =>
            window.api.agent.testProvider({ provider: 'gateway', key, endpoint }).then(must)
          }
          save={({ key, endpoint }) => set({ morlineGatewayUrl: endpoint, morlineGatewayKey: key })}
          remove={() => set({ morlineGatewayUrl: '', morlineGatewayKey: '' })}
          savedMessage="Gateway connected"
        />
      </Group>
    </Page>
  )
}
