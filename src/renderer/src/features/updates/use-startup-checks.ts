import { useEffect } from 'react'
import { toast } from 'sonner'
import { HOSTED } from '@/features/auth/http-auth-service'
import { checkForUpdates, sendBugReport } from '@/features/settings/about-data'
import { useSettings } from '@/features/settings/settings-store'

const CHECKED = 'morecode:update-checked'
const DAY = 24 * 3_600_000

/** A stack trace names the person's own folders ("C:\Users\ama\..."): only the shape of the path is kept. */
const scrub = (text: string): string => text.replace(/[A-Za-z]:\\Users\\[^\\\s)]+/g, 'C:\\Users\\…').replace(/\/(Users|home)\/[^/\s)]+/g, '/$1/…')

/**
 * Two things that happen quietly while the app is open. Once a day it asks the server whether a newer version is out,
 * and says so if there is. And, only if the person has turned it on, it reports crashes: the error and where it
 * happened (never messages, code or file contents), a few per session at most.
 */
export function useStartupChecks(): void {
  const { settings, openSettings } = useSettings()

  useEffect(() => {
    if (!HOSTED || !window.api?.app?.info) return
    if (Date.now() - Number(localStorage.getItem(CHECKED) || 0) < DAY) return
    void window.api.app
      .info()
      .then(async (info) => {
        localStorage.setItem(CHECKED, String(Date.now()))
        const r = await checkForUpdates(info.version)
        if (!r.upToDate) {
          toast(`MoreCode ${r.latest} is available`, {
            description: `You have ${r.current}. See what is new and how to update.`,
            duration: 20_000,
            action: { label: 'See what’s new', onClick: () => openSettings('about') }
          })
        }
      })
      .catch(() => {
        // offline, or the server is down: try again next launch
      })
    // once per launch is enough; the settings function does not change what is asked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!settings.shareCrashes || !HOSTED) return
    let sent = 0
    const report = (message: string, stack?: string): void => {
      if (sent >= 3) return // a loop must not flood the server
      sent++
      void window.api?.app
        ?.info()
        .then((info) => sendBugReport({ message: `Crash: ${scrub(message).slice(0, 500)}`, diagnostics: { stack: scrub(stack ?? '').slice(0, 3000), version: info.version, platform: String(navigator.platform) } }))
        .catch(() => {})
    }
    const onError = (e: ErrorEvent): void => report(e.message || 'Unknown error', (e.error as Error | undefined)?.stack)
    const onRejection = (e: PromiseRejectionEvent): void => {
      const reason = e.reason as { message?: string; stack?: string } | undefined
      report(String(reason?.message ?? e.reason ?? 'Unhandled rejection'), reason?.stack)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [settings.shareCrashes])
}
