import { useSyncExternalStore } from 'react'

const KEY = 'morline.assistant.alwaysProceed'
const listeners = new Set<() => void>()

export function getAlwaysProceed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setAlwaysProceed(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Storage can be blocked; fallback to in-memory
  }
  listeners.forEach((l) => l())
}

export function useAlwaysProceed(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      window.addEventListener('storage', cb)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', cb)
      }
    },
    getAlwaysProceed,
    () => false
  )
  return [on, setAlwaysProceed]
}
