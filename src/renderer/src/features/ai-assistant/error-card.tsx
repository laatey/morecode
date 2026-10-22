import React, { useEffect, useState } from 'react'
import { AlertCircle, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatContext } from './chat-context'
import { modelName } from './models'
import type { Part } from './types'

type ErrorPart = Extract<Part, { type: 'error' }>

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Seconds left until the wait is over. */
function useCountdown(seconds: number | undefined, since: number): number {
  const left = (): number => Math.max(0, Math.ceil((seconds ?? 0) - (Date.now() - since) / 1000))
  const [n, setN] = useState(left)
  useEffect(() => {
    if (!seconds) return
    const t = setInterval(() => setN(left()), 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, since])
  return n
}

const FALLBACK_MODEL = 'haiku-4.5'

/** Something went wrong: say what in plain words and offer a way forward. */
export function ErrorCard({ part, agentId }: { part: ErrorPart; agentId: string }): React.JSX.Element {
  const { retry, ask, setModel, model } = useChatContext()
  const online = useOnline()
  const wait = useCountdown(part.retryAfter, part.at)

  const title =
    part.kind === 'rate_limit'
      ? 'Too many requests'
      : part.kind === 'offline'
        ? 'No internet connection'
        : 'That did not work'
  const detail =
    part.kind === 'rate_limit'
      ? wait > 0
        ? `Try again in ${wait}s, or switch to a faster model.`
        : 'You can try again now.'
      : part.kind === 'offline'
        ? online
          ? 'You are back online.'
          : 'Check your Wi-Fi or network cable. You can try again once it is back.'
        : part.message

  const blocked = (part.kind === 'rate_limit' && wait > 0) || (part.kind === 'offline' && !online)

  return (
    <div
      role="alert"
      className="my-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/[0.08] bg-[#242423] px-3 py-2"
    >
      {part.kind === 'offline' ? (
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-[#f4a39e]" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#f4a39e]" />
      )}
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-[12.5px] font-medium leading-5 text-[#ededeb]">{title}</div>
        <div className="text-[12px] leading-4 text-[#8e8e8a]">{detail}</div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {part.kind === 'rate_limit' && model !== FALLBACK_MODEL && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              setModel(FALLBACK_MODEL)
              retry(agentId)
            }}
          >
            Use {modelName(FALLBACK_MODEL)}
          </Button>
        )}
        {part.kind === 'failed' && (
          <Button variant="secondary" size="xs" onClick={() => ask('The last check failed. Please find out why and fix it.')}>
            Ask AI to fix it
          </Button>
        )}
        <Button size="xs" disabled={blocked} onClick={() => retry(agentId)}>
          Try again
        </Button>
      </div>
    </div>
  )
}
