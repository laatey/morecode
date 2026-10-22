import React from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { Btn, DangerRow, Group, Page, Row, Toggle } from '../kit'
import { useSettings } from '../settings-store'

export function DataPage(): React.JSX.Element {
  const { account, update, deleteAccount } = useAuth()
  const ws = useWorkspace()
  const { settings, set, reset, closeSettings } = useSettings()
  if (!account) return <></>

  const exportData = (): void => {
    const data = {
      exportedAt: new Date().toISOString(),
      account: { name: account.name, email: account.email, plan: account.plan, project: account.project },
      projects: ws.groups,
      chats: ws.chats.map((c) => ({ ...c, messages: ws.getMessages(c.id) }))
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'morecode-data.json'
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Your data was downloaded')
  }

  return (
    <Page title="Data and privacy" description="Your chats are stored on this computer.">
      <Group title="Your data">
        <Row title="Download my data" description="A file with your account details, projects and every chat.">
          <Btn onClick={exportData}>Download</Btn>
        </Row>
        <Row title="Share anonymous usage" description="Counts of which features are used. Never your code or messages.">
          <Toggle label="Share anonymous usage" checked={settings.shareUsage} onChange={(v) => set({ shareUsage: v })} />
        </Row>
      </Group>

      <Group title="Clear data">
        <DangerRow
          title="Delete all chats"
          description={`Removes all ${ws.chats.length} chats and their messages. Projects stay.`}
          button="Delete chats"
          confirmLabel="Delete all chats"
          onConfirm={() => {
            ws.deleteAllChats()
            toast('All chats deleted')
          }}
        />
        <DangerRow
          title="Clear recent folders"
          description="Forgets the project folders in your recent list. Your files are not touched."
          button="Clear"
          confirmLabel="Clear list"
          onConfirm={async () => {
            await update({ recents: account.project ? [account.project] : [] })
            toast('Recent folders cleared')
          }}
        />
        <DangerRow
          title="Reset settings"
          description="Puts every setting, including shortcuts, back to how it started."
          button="Reset"
          confirmLabel="Reset settings"
          onConfirm={() => {
            reset()
            toast('Settings reset')
          }}
        />
      </Group>

      <Group title="Delete account">
        <DangerRow
          title="Delete my account"
          description="Permanently removes your account, chats and saved details from this computer. This can’t be undone."
          button="Delete account"
          confirmLabel="Delete forever"
          typeToConfirm={account.email}
          onConfirm={async () => {
            closeSettings()
            await deleteAccount()
            toast('Your account was deleted')
          }}
        />
      </Group>
    </Page>
  )
}
