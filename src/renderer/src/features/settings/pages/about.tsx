import React, { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { LogoMark } from '@/components/logo'
import { useAuth } from '@/features/auth/auth-store'
import { getPlan } from '@/features/billing/plans'
import { modelName } from '@/features/ai-assistant/models'
import { platform } from '@/lib/platform'
import { Btn, Group, Page, Row, Toggle } from '../kit'
import { DOCS_URL, RELEASES, SUPPORT_URL, checkForUpdates, sendBugReport } from '../about-data'
import { useSettings } from '../settings-store'

type Update = 'idle' | 'checking' | 'latest' | 'error'

function BugReport({ version }: { version: string }): React.JSX.Element {
  const { account } = useAuth()
  const { settings } = useSettings()
  const [text, setText] = useState('')
  const [withInfo, setWithInfo] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-3 py-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        sendBugReport({
          message: text.trim(),
          diagnostics: withInfo
            ? {
                version,
                platform,
                plan: account ? getPlan(account.plan).name : '',
                model: modelName(settings.model)
              }
            : undefined
        })
          .then((ref) => {
            toast('Report sent', { description: `Your reference is ${ref}.` })
            setText('')
          })
          .catch(() => toast.error('Could not send the report. Try again in a moment.'))
          .finally(() => setBusy(false))
      }}
    >
      <label className="block text-[13px] text-[#c9c9c6]">
        What went wrong?
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Tell us what you were doing and what you expected to happen."
          className="mt-1.5 w-full resize-none rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-[13px] leading-5 text-[#ececea] outline-none placeholder:text-[#77776f] focus:border-[#3b82f6]/70"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-[#c9c9c6]">
          <Toggle label="Include app details" checked={withInfo} onChange={setWithInfo} />
          Include app version and system
        </label>
        <Btn variant="primary" type="submit" busy={busy} disabled={text.trim().length < 5}>
          Send report
        </Btn>
      </div>
    </form>
  )
}

export function AboutPage(): React.JSX.Element {
  const { startTour } = useAuth()
  const { setTab, closeSettings } = useSettings()
  const [version, setVersion] = useState('1.0.0')
  const [update, setUpdate] = useState<Update>('idle')

  useEffect(() => {
    void window.api?.app?.info().then((i) => setVersion(i.version))
  }, [])

  return (
    <Page title="Help and about">
      <div className="flex items-center gap-3.5">
        <LogoMark size={44} />
        <div>
          <div className="font-display text-[16px] font-semibold">MoreCode</div>
          <div className="text-[12.5px] text-[#8d8d8a]">Version {version}</div>
        </div>
      </div>
      <Group title="Get help">
        <Row title="Documentation" description="Guides for projects, commands and the tools in the sidebar.">
          <Btn onClick={() => window.open(DOCS_URL)}>
            Open <ExternalLink className="h-3 w-3" />
          </Btn>
        </Row>
        <Row title="Contact support" description="Questions about your account or billing.">
          <Btn onClick={() => window.open(SUPPORT_URL)}>
            Open <ExternalLink className="h-3 w-3" />
          </Btn>
        </Row>
        <Row title="Keyboard shortcuts" description="See every shortcut and change the ones you like.">
          <Btn onClick={() => setTab('shortcuts')}>View</Btn>
        </Row>
        <Row title="Product tour" description="Walk through the main areas again.">
          <Btn
            onClick={() => {
              closeSettings()
              setTimeout(startTour, 200)
            }}
          >
            Replay
          </Btn>
        </Row>
      </Group>

      <Group title="Report a bug">
        <BugReport version={version} />
      </Group>

      <Group title="About MoreCode">
        <Row
          title={`Version ${version}`}
          description={
            update === 'latest'
              ? 'You have the latest version.'
              : update === 'error'
                ? 'Could not check for updates. Try again in a moment.'
                : 'Updates install when you restart.'
          }
        >
          <Btn
            busy={update === 'checking'}
            onClick={() => {
              setUpdate('checking')
              checkForUpdates(version)
                .then((r) => setUpdate(r.upToDate ? 'latest' : 'idle'))
                .catch(() => setUpdate('error'))
            }}
          >
            {update === 'checking' ? 'Checking' : 'Check for updates'}
          </Btn>
        </Row>
      </Group>

      <Group title="What’s new">
        {RELEASES.map((r) => (
          <div key={r.version} className="py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] text-[#ececea]">Version {r.version}</span>
              <span className="text-[12px] text-[#77776f]">{r.date}</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-5 text-[#a8a8a6] marker:text-[#55554f]">
              {r.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </Group>
    </Page>
  )
}
