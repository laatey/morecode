import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { getPlan } from '@/features/billing/plans'
import { isMac } from '@/lib/platform'
import { Btn, Group, Page, Row, Segmented, TextInput } from '../kit'
import { useSettings } from '../settings-store'

export function GeneralPage(): React.JSX.Element {
  const { account, update, openProject, startTour } = useAuth()
  const { settings, set, setTab, closeSettings } = useSettings()
  const [name, setName] = useState(account?.name ?? '')
  useEffect(() => setName(account?.name ?? ''), [account?.name])
  if (!account) return <></>
  const dirty = name.trim() && name.trim() !== account.name
  const via = account.provider === 'password' ? 'Email and password' : account.provider === 'google' ? 'Google' : 'GitHub'

  return (
    <Page title="General" description="Your account, project and how messages are sent.">
      <Group title="Account">
        <Row title="Name" description="Shown in the sidebar and when you share a chat.">
          <TextInput
            aria-label="Name"
            className="w-[180px]"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty) void update({ name: name.trim() })
            }}
          />
          {dirty && (
            <Btn
              variant="primary"
              onClick={() => {
                void update({ name: name.trim() }).then(() => toast.success('Name updated'))
              }}
            >
              Save
            </Btn>
          )}
        </Row>
        <Row title="Email" description={`Signed in with ${via}.`}>
          <span className="text-[12px] text-[#c9c9c6]">{account.email}</span>
        </Row>
        <Row
          title="Plan"
          description={account.apiKey ? 'You are using your own API key.' : `${getPlan(account.plan).dailyMessages} messages a day.`}
        >
          <span className="text-[12px] text-[#c9c9c6]">{getPlan(account.plan).name}</span>
          <Btn onClick={() => setTab('billing')}>Manage</Btn>
        </Row>
      </Group>

      <Group title="Project">
        <Row
          title="Project folder"
          description={account.project?.path || 'No folder chosen yet.'}
        >
          <span className="max-w-[140px] truncate text-[12px] text-[#c9c9c6]">{account.project?.name}</span>
          {window.api?.workspace && (
            <Btn
              onClick={() => {
                void window.api.workspace.choose().then((w) => {
                  if (w) void openProject({ name: w.name, path: w.root })
                })
              }}
            >
              Change
            </Btn>
          )}
        </Row>
      </Group>

      <Group title="Messages">
        <Row
          title="Send with"
          description={
            settings.sendWith === 'enter'
              ? 'Press Shift Enter for a new line.'
              : 'Press Enter for a new line.'
          }
        >
          <Segmented
            label="Send with"
            value={settings.sendWith}
            onChange={(v) => set({ sendWith: v })}
            options={[
              { value: 'enter', label: 'Enter' },
              { value: 'mod-enter', label: isMac ? '⌘ Enter' : 'Ctrl Enter' }
            ]}
          />
        </Row>
      </Group>

      <Group title="Getting started">
        <Row title="Product tour" description="A quick walk through the sidebar, message box and tools.">
          <Btn
            onClick={() => {
              closeSettings()
              setTimeout(startTour, 200)
            }}
          >
            Replay tour
          </Btn>
        </Row>
      </Group>
    </Page>
  )
}
