import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { errorText } from '@/features/auth/ui'
import { isKaggleQwen, isMorlineGateway, MODELS } from '@/features/ai-assistant/models'
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
      <Row
        title="Your API key"
        description="Requests use your key. There is no daily message limit."
      >
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

function KaggleEndpointRow(): React.JSX.Element {
  const { settings, set } = useSettings()
  const [adding, setAdding] = useState(false)
  const [endpoint, setEndpoint] = useState(settings.kaggleEndpoint)
  const [token, setToken] = useState(settings.kaggleToken)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = Boolean(settings.kaggleEndpoint && settings.kaggleToken)

  return (
    <div className="py-3">
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#ededeb]">Kaggle notebook endpoint</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">
            Personal and temporary. The notebook must be running; project requests go directly to
            it.
          </div>
        </div>
        {configured && !adding ? (
          <div className="flex items-center gap-2">
            <span className="max-w-40 truncate font-mono text-[11px] text-[#c9c9c6]">
              {settings.kaggleEndpoint}
            </span>
            <Btn variant="danger" onClick={() => set({ kaggleEndpoint: '', kaggleToken: '' })}>
              Remove
            </Btn>
          </div>
        ) : !adding ? (
          <Btn onClick={() => setAdding(true)}>Connect notebook</Btn>
        ) : null}
      </div>
      {adding && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const clean = endpoint.trim().replace(/\/$/, '')
            window.api.agent
              .testEndpoint(clean, token.trim())
              .then((r) => {
                if (!r.ok) throw new Error(r.message)
                set({ kaggleEndpoint: clean, kaggleToken: token.trim() })
                setAdding(false)
                toast('Kaggle endpoint connected')
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false))
          }}
        >
          <TextInput
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Kaggle endpoint"
            placeholder="https://…trycloudflare.com"
            className="font-mono"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <TextInput
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label="Notebook token"
                placeholder="Notebook token"
                className="font-mono"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {error && <p className="mt-1.5 text-[12.5px] text-[#f4a39e]">{error}</p>}
            </div>
            <Btn
              variant="primary"
              type="submit"
              busy={busy}
              disabled={!endpoint.trim() || !token.trim()}
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

function MorlineGatewayRow(): React.JSX.Element {
  const { settings, set } = useSettings()
  const [adding, setAdding] = useState(false)
  const [endpoint, setEndpoint] = useState(settings.morlineGatewayUrl)
  const [key, setKey] = useState(settings.morlineGatewayKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = Boolean(settings.morlineGatewayUrl && settings.morlineGatewayKey)

  return (
    <div className="py-3">
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#ededeb]">Dedicated AI gateway</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">
            Uses your separately deployed endpoint. Provider keys stay in that service.
          </div>
        </div>
        {configured && !adding ? (
          <div className="flex items-center gap-2">
            <span className="max-w-40 truncate font-mono text-[11px] text-[#c9c9c6]">{settings.morlineGatewayUrl}</span>
            <Btn variant="danger" onClick={() => set({ morlineGatewayKey: '' })}>Remove</Btn>
          </div>
        ) : !adding ? <Btn onClick={() => setAdding(true)}>Connect gateway</Btn> : null}
      </div>
      {adding && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const clean = endpoint.trim().replace(/\/$/, '')
            window.api.agent
              .testEndpoint(clean, key.trim())
              .then((r) => {
                if (!r.ok) throw new Error(r.message)
                set({ morlineGatewayUrl: clean, morlineGatewayKey: key.trim() })
                setAdding(false)
                toast('Morline gateway connected')
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false))
          }}
        >
          <TextInput autoFocus autoComplete="off" spellCheck={false} aria-label="Gateway URL" placeholder="https://ai-gateway.morline.space" className="font-mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <TextInput type="password" autoComplete="off" spellCheck={false} aria-label="Morline gateway key" placeholder="Morline gateway key" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
              {error && <p className="mt-1.5 text-[12.5px] text-[#f4a39e]">{error}</p>}
            </div>
            <Btn variant="primary" type="submit" busy={busy} disabled={!endpoint.trim() || !key.trim()}>Test and save</Btn>
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </form>
      )}
    </div>
  )
}

export function ModelsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const current = MODELS.find((m) => m.id === settings.model)
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
      <Group title="Access">
        <ApiKeyRow />
        {isMorlineGateway(settings.model) && <MorlineGatewayRow />}
        {isKaggleQwen(settings.model) && <KaggleEndpointRow />}
      </Group>
    </Page>
  )
}
