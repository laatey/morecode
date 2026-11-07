import { useSyncExternalStore } from 'react'

/**
 * Which chats have memory switched off. A chat the person turned memory off for stays fresh when they
 * come back to it. Memory is on for every other chat (unless it is off in settings).
 */
const KEY = 'morecode:memory-off-chats:v1'
const listeners = new Set<() => void>()

function read(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

let cache = read()

export const isMemoryOff = (chatId: string): boolean => cache.has(chatId)

export function setMemoryOff(chatId: string, off: boolean): void {
  if (cache.has(chatId) === off) return
  cache = new Set(cache)
  if (off) cache.add(chatId)
  else cache.delete(chatId)
  try {
    localStorage.setItem(KEY, JSON.stringify([...cache].slice(-500)))
  } catch {
    // storage blocked: it holds for this session only
  }
  listeners.forEach((l) => l())
}

export function useMemoryOff(chatId: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cache.has(chatId)
  )
}
