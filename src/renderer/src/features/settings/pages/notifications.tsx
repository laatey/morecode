import React from 'react'
import { Btn, Group, Page, Row, Toggle } from '../kit'
import { useNotify } from '../notifications'
import { useSettings } from '../settings-store'

export function NotificationsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const notify = useNotify()
  const n = settings.notify
  const patch = (p: Partial<typeof n>): void => set({ notify: { ...n, ...p } })
  return (
    <Page
      title="Notifications"
      description="Get a nudge when MoreCode is in the background and the AI needs you."
    >
      <Group title="Tell me when">
        <Row title="A task finishes" description="The AI has stopped and its work is ready to review.">
          <Toggle label="A task finishes" checked={n.finished} onChange={(v) => patch({ finished: v })} />
        </Row>
        <Row title="The AI needs permission" description="It is waiting for you to allow or deny an action.">
          <Toggle label="The AI needs permission" checked={n.permission} onChange={(v) => patch({ permission: v })} />
        </Row>
      </Group>
      <Group title="How">
        <Row title="Play a sound" description="A short chime with each notification.">
          <Toggle label="Play a sound" checked={n.sound} onChange={(v) => patch({ sound: v })} />
        </Row>
        <Row title="Try it out" description="Sends a sample notification now.">
          <Btn onClick={() => notify('test', 'Task finished', 'This is what a notification looks like.')}>
            Send a test
          </Btn>
        </Row>
      </Group>
    </Page>
  )
}
