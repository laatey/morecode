import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { useSettings } from './settings-store'

export type NotifyKind = 'finished' | 'permission' | 'test'

function beep(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.04
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    osc.onended = () => void ctx.close()
  } catch {
    // no audio available: stay quiet
  }
}

/**
 * Tells the person something happened. While MoreCode is in front the screen already shows it,
 * so a desktop notification is only sent when the window is in the background.
 * The agent runner calls this with 'permission' when it needs an answer.
 */
export function useNotify(): (kind: NotifyKind, title: string, body?: string) => void {
  const { settings } = useSettings()
  const { notify } = settings
  return useCallback(
    (kind, title, body) => {
      if (kind === 'finished' && !notify.finished) return
      if (kind === 'permission' && !notify.permission) return
      const away = document.hidden || !document.hasFocus()
      if (kind === 'test') toast.success(title, { description: body })
      if ((away || kind === 'test') && 'Notification' in window) {
        const send = (): void => {
          new Notification(title, { body, silent: true })
        }
        if (Notification.permission === 'granted') send()
        else if (Notification.permission === 'default')
          void Notification.requestPermission().then((p) => p === 'granted' && send())
      }
      if (notify.sound && (away || kind === 'test')) beep()
    },
    [notify]
  )
}

/** Watches the open chat and sends "finished" when the AI stops working. */
export function TaskNotifier(): null {
  const { running } = useChatContext()
  const { active } = useWorkspace()
  const notify = useNotify()
  const was = useRef(running)
  useEffect(() => {
    if (was.current && !running) notify('finished', 'Task finished', active.title)
    was.current = running
  }, [running, active.title, notify])
  return null
}
