import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  ExternalLink,
  Globe,
  Lock,
  RotateCw,
  Search,
  SquareCode,
  Star,
  TriangleAlert,
  X
} from '@/components/icons'
import { toast } from 'sonner'
import { ActionMenu, type ActionMenuItem } from '@/components/action-menu'
import { IconButton } from '@/components/layout/icon-button'
import { cn } from '@/lib/utils'
import { useRightPanel } from '../store'
import type { TabContentProps } from '../types'
import { rememberPage, savedPage, useBookmarks } from './browser-state'
import { TabButton } from './tab-kit'

const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i

/** Turn whatever was typed into a web address: a URL, a host name, or a search. */
function toUrl(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^(https?:\/\/|about:blank)/i.test(text)) return text
  if (LOCAL.test(text)) return `http://${text}`
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return `https://${text}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}

const QUICK_LINKS = [
  { label: 'Your app', hint: 'localhost:3000', url: 'http://localhost:3000' },
  { label: 'Vite', hint: 'localhost:5173', url: 'http://localhost:5173' },
  { label: 'Dev server', hint: 'localhost:8080', url: 'http://localhost:8080' }
]

interface NavEvent extends Event {
  url?: string
  title?: string
  errorCode?: number
  errorDescription?: string
  validatedURL?: string
  isMainFrame?: boolean
}

/** Preview your app or open any web page, right next to the chat. */
export function BrowserTab({ tabId }: TabContentProps): React.JSX.Element {
  const view = useRef<WebviewTag | null>(null)
  const address = useRef<HTMLInputElement>(null)
  // reopen the page this tab was on before the app was closed
  const [start] = useState(() => savedPage(tabId))
  const [src, setSrc] = useState(start)
  const [url, setUrl] = useState(start)
  const [text, setText] = useState(start)
  const [pageTitle, setPageTitle] = useState('')
  const { setAutoTitle } = useRightPanel()
  const { bookmarks, has, toggle, remove } = useBookmarks()
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [error, setError] = useState<{ url: string; message: string } | null>(null)

  const go = useCallback((raw: string): void => {
    const next = toUrl(raw)
    if (!next) return
    setError(null)
    setText(next)
    setUrl(next)
    setSrc((cur) => {
      if (cur === next) view.current?.reload()
      return next
    })
  }, [])

  // webview events only exist once a page has been opened
  const opened = Boolean(src)
  useEffect(() => {
    const el = view.current
    if (!el) return
    const sync = (): void => {
      try {
        setNav({ back: el.canGoBack(), forward: el.canGoForward() })
      } catch {
        // not attached yet
      }
    }
    const on = (name: string, fn: (e: NavEvent) => void): (() => void) => {
      const handler = (e: Event): void => fn(e as NavEvent)
      el.addEventListener(name, handler)
      return () => el.removeEventListener(name, handler)
    }
    const off = [
      on('did-start-loading', () => setLoading(true)),
      on('did-stop-loading', () => {
        setLoading(false)
        sync()
      }),
      on('did-navigate', (e) => {
        if (e.url) {
          setUrl(e.url)
          setText(e.url)
          setError(null)
          rememberPage(tabId, e.url)
        }
        sync()
      }),
      on('page-title-updated', (e) => {
        if (e.title) {
          setPageTitle(e.title)
          setAutoTitle(tabId, e.title)
        }
      }),
      on('did-navigate-in-page', (e) => {
        if (e.url && e.isMainFrame !== false) {
          setUrl(e.url)
          setText(e.url)
          rememberPage(tabId, e.url)
        }
        sync()
      }),
      on('did-fail-load', (e) => {
        // -3 means the page was replaced by another navigation, which is not an error
        if (e.isMainFrame === false || e.errorCode === -3 || e.errorCode === 0) return
        setLoading(false)
        setError({ url: e.validatedURL ?? '', message: e.errorDescription ?? 'The page did not load.' })
      })
    ]
    return () => off.forEach((f) => f())
  }, [opened, tabId, setAutoTitle])

  const starred = opened && has(url)

  /** Open the page's developer tools in their own window (for people who know what that is). */
  const toggleDevTools = (): void => {
    const el = view.current
    if (!el) return
    try {
      if (el.isDevToolsOpened()) el.closeDevTools()
      else el.openDevTools()
    } catch {
      toast.error('Open a page first')
    }
  }

  const moreItems: ActionMenuItem[] = [
    {
      id: 'devtools',
      label: 'Developer tools',
      description: 'Opens in a separate window',
      icon: <SquareCode className="h-3.5 w-3.5" />,
      disabled: !opened,
      onClick: toggleDevTools
    },
    {
      id: 'external',
      label: 'Open in your browser',
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      disabled: !opened,
      onClick: () => window.open(url, '_blank')
    }
  ]

  const isLocal = LOCAL.test(url.replace(/^https?:\/\//i, ''))
  const secure = url.startsWith('https://')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[38px] shrink-0 items-center gap-1 border-b border-white/[0.07] px-2">
        <IconButton title="Back" disabled={!nav.back} onClick={() => view.current?.goBack()} className="disabled:opacity-35">
          <ArrowLeft className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Forward" disabled={!nav.forward} onClick={() => view.current?.goForward()} className="disabled:opacity-35">
          <ArrowRight className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title={loading ? 'Stop loading' : 'Reload'}
          disabled={!opened}
          onClick={() => (loading ? view.current?.stop() : view.current?.reload())}
          className="disabled:opacity-35"
        >
          {loading ? <X className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
        </IconButton>

        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go(text)
            address.current?.blur()
          }}
        >
          <label className="flex h-[26px] items-center gap-1.5 rounded-[7px] bg-white/[0.06] px-2 text-[12px] transition-colors focus-within:bg-white/[0.09] focus-within:ring-1 focus-within:ring-[#3b82f6]/60">
            {secure ? (
              <Lock className="h-3 w-3 shrink-0 text-[#5fd17a]" />
            ) : (
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={address}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
              aria-label="Address"
              placeholder="Search or type a web address"
              className="min-w-0 flex-1 bg-transparent text-[#ececea] outline-none placeholder:text-muted-foreground"
            />
            {opened && !secure && !isLocal && (
              <span className="shrink-0 text-[10.5px] text-[#e8b365]">Not secure</span>
            )}
          </label>
        </form>

        <IconButton
          title={starred ? 'Remove bookmark' : 'Bookmark this page'}
          disabled={!opened}
          onClick={() => toggle(url, pageTitle)}
          className="disabled:opacity-35"
        >
          <Star className={cn('h-3.5 w-3.5', starred && 'fill-[#e8b365] text-[#e8b365]')} />
        </IconButton>
        <ActionMenu
          align="end"
          items={moreItems}
          trigger={
            <IconButton title="More">
              <span className="text-[13px] leading-none">⋯</span>
            </IconButton>
          }
        />
      </div>

      <div className="relative min-h-0 flex-1 bg-[#1f1f1e]">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 h-[2px] overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[load-slide_1.2s_ease-in-out_infinite] bg-[#3b82f6]" />
          </div>
        )}

        {opened ? (
          <webview
            ref={view as React.Ref<HTMLElement>}
            src={src}
            // eslint-disable-next-line react/no-unknown-property -- a <webview> attribute, not a DOM one
            partition="persist:browser"
            style={{ width: '100%', height: '100%', display: error ? 'none' : 'inline-flex' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-[320px]">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-white/[0.05] text-[#a8a8a6]">
                <Globe className="h-[18px] w-[18px] stroke-[1.5]" />
              </span>
              <h2 className="text-[13px] font-medium text-[#ececea]">Browse without leaving the app</h2>
              <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
                Type an address above, or open the preview of something you are building.
              </p>
              {bookmarks.length > 0 && (
                <div className="mt-3.5">
                  <h3 className="mb-1 text-[12px] font-medium text-[#a8a8a6]">Bookmarks</h3>
                  <ul className="space-y-0.5">
                    {bookmarks.map((b) => (
                      <li key={b.url} className="group flex items-center gap-1 rounded-[6px] hover:bg-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => go(b.url)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
                        >
                          <BookmarkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">{b.title}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${b.title}`}
                          onClick={() => remove(b.url)}
                          className="mr-1 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-muted-foreground opacity-0 hover:bg-white/[0.08] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3.5 space-y-1.5">
                {QUICK_LINKS.map((q) => (
                  <button
                    key={q.url}
                    type="button"
                    onClick={() => go(q.url)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-[8px] border border-white/[0.08] px-3 py-2 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
                  >
                    <span className="text-[12.5px] text-[#ececea]">{q.label}</span>
                    <span className="font-mono text-[11.5px] text-muted-foreground">{q.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1f1f1e] p-6">
            <div className="max-w-[300px] text-center">
              <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-[#e5a54b]/15 text-[#e8b365]">
                <TriangleAlert className="h-[18px] w-[18px]" />
              </span>
              <h2 className="text-[13px] font-medium text-[#ececea]">Can’t open this page</h2>
              <p className="mt-1 break-all text-[12px] leading-[18px] text-muted-foreground">
                {LOCAL.test((error.url || url).replace(/^https?:\/\//i, ''))
                  ? 'Nothing is answering at this address. Make sure your app is running, then try again.'
                  : 'Check the address and your internet connection, then try again.'}
              </p>
              <p className="mt-1 text-[11px] text-[#77776f]">{error.message}</p>
              <div className="mt-3.5 flex justify-center gap-1.5">
                <TabButton onClick={() => setError(null)}>Dismiss</TabButton>
                <TabButton tone="primary" onClick={() => go(error.url || url)}>
                  Try again
                </TabButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
