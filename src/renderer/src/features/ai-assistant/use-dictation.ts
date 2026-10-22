import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your system settings and try again.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your system settings and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice input could not reach a speech service. Check your connection.'
}

/**
 * Speak instead of type. `onText` gets the whole transcript so far (it replaces, not appends).
 * Uses the system's speech recognition; where that is missing, the button explains instead of failing silently.
 */
export function useDictation(onText: (spoken: string) => void): {
  listening: boolean
  toggle: () => void
  stop: () => void
} {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  useEffect(() => {
    cb.current = onText
  })

  const stop = useCallback(() => rec.current?.stop(), [])

  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      toast.error('Voice input is not available on this computer.')
      return
    }
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      cb.current(text.trim())
    }
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast.error(ERRORS[e.error] ?? 'Voice input stopped unexpectedly.')
      }
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    try {
      r.start()
      rec.current = r
      setListening(true)
    } catch {
      toast.error('Could not start voice input.')
    }
  }, [])

  useEffect(() => () => rec.current?.stop(), [])
  return { listening, toggle, stop }
}
