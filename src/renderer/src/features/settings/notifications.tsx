import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { useSettings } from './settings-store'

export type NotifyKind = 'finished' | 'permission' | 'test'

let audio: AudioContext | null = null

/** One soft bell note: a sine with a quiet overtone, a quick attack and a long, smooth fade (no clicks). */
function bell(ctx: AudioContext, freq: number, at: number, peak: number, length: number): void {
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, at)
  out.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  out.gain.exponentialRampToValueAtTime(0.0001, at + length)
  out.connect(ctx.destination)
  for (const [ratio, level] of [[1, 1], [2, 0.28], [3, 0.08]] as const) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * ratio
    g.gain.value = level
    osc.connect(g).connect(out)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

/**
 * The notification chime, made with the Web Audio API so there is no sound file to ship.
 * "Done" rises (a finished, resolved feel); "needs you" is two even taps that ask for attention without alarm.
 */
export function chime(kind: 'done' | 'attention' = 'done'): void {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    void ctx.resume()
    const t = ctx.currentTime + 0.02
    if (kind === 'done') {
      bell(ctx, 783.99, t, 0.16, 0.9) // G5
      bell(ctx, 1174.66, t + 0.14, 0.14, 1.2) // D6
    } else {
      bell(ctx, 880, t, 0.15, 0.55) // A5
      bell(ctx, 880, t + 0.2, 0.15, 0.7)
    }
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
      if (away || kind === 'test') {
        // the operating system's own notification (clicking it brings MoreCode back); the page's is the fallback
        void window.api.notify
          .show(title, body)
          .catch(() => false)
          .then((shown) => {
            if (shown || !('Notification' in window)) return
            const send = (): void => void new Notification(title, { body, silent: true })
            if (Notification.permission === 'granted') send()
            else if (Notification.permission === 'default')
              void Notification.requestPermission().then((p) => p === 'granted' && send())
          })
        if (notify.sound) chime(kind === 'permission' ? 'attention' : 'done')
      }
    },
    [notify]
  )
}

/** Watches the open chat and sends "finished" when the AI stops working. */
export function TaskNotifier(): null {
  const { running, messages } = useChatContext()
  const { active } = useWorkspace()
  const notify = useNotify()
  const was = useRef(running)
  useEffect(() => {
    if (was.current && !running) {
      // pressing Stop is the person's own doing, so there is nothing to announce
      const last = [...messages].reverse().find((m) => m.role === 'agent')
      if (!(last && last.role === 'agent' && last.stopped)) notify('finished', 'Task finished', active.title)
    }
    was.current = running
  }, [running, messages, active.title, notify])
  return null
}
