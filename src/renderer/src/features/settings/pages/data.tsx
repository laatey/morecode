import React, { useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { Btn, DangerRow, Group, Page, Row, Toggle } from '../kit'
import { useSettings } from '../settings-store'

export function DataPage(): React.JSX.Element {
  const { account, update, deleteAccount } = useAuth()
  const ws = useWorkspace()
  const { settings, set, reset, closeSettings } = useSettings()
  const fileInput = useRef<HTMLInputElement>(null)
  if (!account) return <></>

  const restoreData = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      if (file.size > 100_000_000) throw new Error('too big')
      const done = ws.restore(JSON.parse(await file.text()))
      toast.success(done.chats || done.projects ? `Restored ${done.chats} chat${done.chats === 1 ? '' : 's'} and ${done.projects} project${done.projects === 1 ? '' : 's'}` : 'Nothing new to restore: everything in that file is already here')
    } catch {
      toast.error('That file could not be read. Use a file made by “Download my data”.')
    }
  }

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
    toast.success('Your data was downloaded')
  }

  return (
    <Page title="Data and privacy" description="Your chats are stored on this computer.">
      <Group title="Your data">
        <Row title="Download my data" description="A file with your account details, projects and every chat.">
          <Btn onClick={exportData}>Download</Btn>
        </Row>
        <Row title="Restore from a download" description="Bring back chats and projects from a file you downloaded before, for example on a new computer. Nothing already here is changed.">
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void restoreData(e.target.files?.[0]); e.target.value = '' }} />
          <Btn onClick={() => fileInput.current?.click()}>Choose file</Btn>
        </Row>
        <Row title="Send crash reports" description="If MoreCode crashes, send the error and where it happened so it can be fixed. Never your messages, code or file contents. Off by default.">
          <Toggle label="Send crash reports" checked={settings.shareCrashes} onChange={(v) => set({ shareCrashes: v })} />
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
            toast.success('All chats deleted')
          }}
        />
        <DangerRow
          title="Clear recent folders"
          description="Forgets the project folders in your recent list. Your files are not touched."
          button="Clear"
          confirmLabel="Clear list"
          onConfirm={async () => {
            await update({ recents: account.project ? [account.project] : [] })
            toast.success('Recent folders cleared')
          }}
        />
        <DangerRow
          title="Reset settings"
          description="Puts every setting, including shortcuts, back to how it started."
          button="Reset"
          confirmLabel="Reset settings"
          onConfirm={() => {
            reset()
            toast.success('Settings reset')
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
            toast.success('Your account was deleted')
          }}
        />
      </Group>
    </Page>
  )
}
