import { useCallback, useSyncExternalStore } from 'react'

/**
 * What the Browser tab remembers: the page each tab was on (so it comes back after a restart)
 * and the bookmarks, which are shared by every Browser tab.
 */
const PAGE_PREFIX = 'morecode:browser:page:v1:'
const BOOKMARKS_KEY = 'morecode:browser:bookmarks:v1'

export const savedPage = (tabId: string): string => {
  try {
    return localStorage.getItem(PAGE_PREFIX + tabId) ?? ''
  } catch {
    return ''
  }
}

export const rememberPage = (tabId: string, url: string): void => {
  try {
    if (url) localStorage.setItem(PAGE_PREFIX + tabId, url)
  } catch {
    // not remembering the page is not worth an error
  }
}

/** Called when a Browser tab is closed. */
export const forgetBrowser = (tabId: string): void => {
  try {
    localStorage.removeItem(PAGE_PREFIX + tabId)
  } catch {
    // nothing to clean up
  }
}

export interface Bookmark {
  url: string
  title: string
}

const listeners = new Set<() => void>()
let cache: { raw: string | null; list: Bookmark[] } = { raw: null, list: [] }

function read(): Bookmark[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(BOOKMARKS_KEY)
  } catch {
    return cache.list
  }
  if (raw === cache.raw) return cache.list
  let list: Bookmark[] = []
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown
    if (Array.isArray(parsed)) {
      list = parsed.filter(
        (b): b is Bookmark => Boolean(b) && typeof b.url === 'string' && typeof b.title === 'string'
      )
    }
  } catch {
    list = []
  }
  cache = { raw, list }
  return list
}

function write(list: Bookmark[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list))
  } catch {
    // storage full: the bookmark just will not stick
  }
  listeners.forEach((l) => l())
}

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Strip a trailing slash so http://x.com and http://x.com/ count as one bookmark. */
const same = (a: string, b: string): boolean => a.replace(/\/$/, '') === b.replace(/\/$/, '')

export function useBookmarks(): {
  bookmarks: Bookmark[]
  has: (url: string) => boolean
  toggle: (url: string, title: string) => void
  remove: (url: string) => void
} {
  const bookmarks = useSyncExternalStore(subscribe, read, read)
  const has = useCallback((url: string) => bookmarks.some((b) => same(b.url, url)), [bookmarks])
  const remove = useCallback((url: string) => write(read().filter((b) => !same(b.url, url))), [])
  const toggle = useCallback(
    (url: string, title: string) => {
      const list = read()
      if (list.some((b) => same(b.url, url))) return remove(url)
      write([...list, { url, title: title.trim() || url.replace(/^https?:\/\//i, '') }])
    },
    [remove]
  )
  return { bookmarks, has, toggle, remove }
}
