import { app, BrowserWindow, ipcMain, webContents, type WebContents } from 'electron'
import { chromium, type Browser, type Frame, type Locator, type Page } from 'playwright-core'
import type { ToolDef } from './anthropic'
import type { ToolContext, ToolResult } from './tools'

/**
 * Lets the AI drive the Browser tab with Playwright. The app opens a debugging port on this computer only
 * (random each launch); Playwright connects to it and works on the Browser tab's <webview>.
 * The tab shows a blue glow while a browser tool runs (see browser-tab.tsx).
 */

type Input = Record<string, unknown>

const DEBUG_PORT = 49152 + Math.floor(Math.random() * 16000)
const MAX_ELEMENTS = 400
const ACTION_TIMEOUT = 5000

/** Must run before the app is ready. */
export function enableBrowserDebugging(): void {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT))
}

/* ---------- which webview is "the browser" ---------- */

const tabs = new Map<number, WebContents>()
let activeId: number | null = null
let host: WebContents | null = null
let cached: { id: number; page: Page } | null = null
let refs = new Map<string, Frame>()

export function registerBrowserIpc(): void {
  ipcMain.on('browser:register', (event, id: unknown) => {
    if (typeof id !== 'number') return
    const wc = webContents.fromId(id)
    // only a <webview> that belongs to the window that asked
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== event.sender) return
    host = event.sender
    if (!tabs.has(id)) {
      tabs.set(id, wc)
      wc.once('destroyed', () => {
        tabs.delete(id)
        if (activeId === id) activeId = [...tabs.keys()].pop() ?? null
        if (cached?.id === id) cached = null
      })
    }
    if (activeId !== id) {
      activeId = id
      refs = new Map()
    }
  })
}

const glow = (on: boolean): void => {
  if (host && !host.isDestroyed() && activeId !== null) host.send('browser:agent', { id: activeId, active: on })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Give the Browser tab's page the keyboard focus, so typed text goes there and not into the app's own message box. */
const focusTab = (wc: WebContents): void => {
  try {
    if (!wc.isDestroyed()) wc.focus()
  } catch {
    // a tab that cannot take focus just keeps what it had
  }
}

/** Find a live <webview> even if the Browser tab never registered itself (missed dom-ready, restored page, etc.). */
function discoverTab(): WebContents | null {
  const live = webContents.getAllWebContents().filter((w) => !w.isDestroyed() && w.getType() === 'webview')
  if (!live.length) return null
  const wc = live.find((w) => w.id === activeId) ?? live[live.length - 1]
  if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) host = wc.hostWebContents
  tabs.set(wc.id, wc)
  wc.once('destroyed', () => {
    tabs.delete(wc.id)
    if (activeId === wc.id) activeId = [...tabs.keys()].pop() ?? null
    if (cached?.id === wc.id) cached = null
  })
  if (activeId !== wc.id) {
    activeId = wc.id
    refs = new Map()
  }
  return wc
}

/** The Browser tab's webview, with the glow switched on for it (the tab is only known for certain once it is found). */
async function activeTab(): Promise<WebContents> {
  const wc = await resolveTab()
  glow(true)
  return wc
}

/** The Browser tab's webview. If it is not open, asks the app to open it and waits for it. */
async function resolveTab(): Promise<WebContents> {
  const find = (): WebContents | null => {
    const reg = activeId !== null ? tabs.get(activeId) : undefined
    if (reg && !reg.isDestroyed()) return reg
    return discoverTab()
  }
  let wc = find()
  if (wc) return wc
  const win = host && !host.isDestroyed() ? host : (BrowserWindow.getAllWindows()[0]?.webContents ?? null)
  if (win && !win.isDestroyed()) {
    host = win
    win.send('browser:open')
    for (let i = 0; i < 60 && !wc; i++) {
      await sleep(150)
      wc = find()
    }
    if (wc) {
      // let the blank webview finish attaching before Playwright looks for it
      await sleep(400)
      return wc
    }
  }
  throw new Error('Could not open the Browser tab automatically. Ask the person to open the Browser tab, then try again.')
}

/* ---------- Playwright connection ---------- */

let browser: Browser | null = null

async function connect(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`, { timeout: 10_000 })
  browser.on('disconnected', () => {
    browser = null
    cached = null
  })
  return browser
}

const targetOfPage = async (p: Page): Promise<string | null> => {
  try {
    const s = await p.context().newCDPSession(p)
    try {
      const r = (await s.send('Target.getTargetInfo')) as { targetInfo: { targetId: string } }
      return r.targetInfo.targetId
    } finally {
      await s.detach().catch(() => undefined)
    }
  } catch {
    return null
  }
}

const targetOfContents = async (wc: WebContents): Promise<string | null> => {
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    const r = (await wc.debugger.sendCommand('Target.getTargetInfo')) as { targetInfo?: { targetId?: string } }
    return r.targetInfo?.targetId ?? null
  } catch {
    return null
  }
}

/** A blank tab is "about:blank" to one side and an empty string to the other. */
const sameUrl = (a: string, b: string): boolean => {
  const blank = (u: string): boolean => u === '' || u === 'about:blank'
  return a === b || (blank(a) && blank(b))
}

/**
 * The Playwright page for the active Browser tab. Playwright needs a patched copy to see <webview> tabs at all
 * (patches/playwright-core+*.patch, applied by npm install), so a missing page after install is explained here.
 */
async function currentPage(): Promise<Page> {
  const wc = await activeTab()
  if (cached && cached.id === wc.id && !cached.page.isClosed()) return cached.page
  const b = await connect()
  const url = wc.getURL()
  let match: Page[] = []
  // a page that is still attaching may need a moment
  for (let attempt = 0; attempt < 8 && !match.length; attempt++) {
    if (attempt) await sleep(250)
    const pages = b.contexts().flatMap((c) => c.pages())
    match = pages.filter((p) => sameUrl(p.url(), url))
    if (match.length > 1) {
      const want = await targetOfContents(wc)
      if (want) {
        const hit: Page[] = []
        for (const p of match) if ((await targetOfPage(p)) === want) hit.push(p)
        if (hit.length) match = hit
      }
    }
    if (!match.length) {
      // the address may have just changed; the one page that is not the app's own window is the tab
      const own = process.env['ELECTRON_RENDERER_URL']
      const others = pages.filter((p) => !p.url().startsWith('file://') && !(own && p.url().startsWith(own)))
      if (others.length === 1) match = others
    }
  }
  if (!match.length) {
    const seen = b.contexts().flatMap((c) => c.pages().map((p) => p.url() || '(blank)'))
    throw new Error(
      `Playwright could not find the Browser tab’s page (the tab is at ${url || 'about:blank'}; Playwright can see ${seen.length ? seen.join(', ') : 'no pages'}). ` +
        'If Playwright sees no pages, run npm install again so the Playwright patch is applied, then restart the app.'
    )
  }
  cached = { id: wc.id, page: match[0] }
  refs = new Map()
  return match[0]
}

/* ---------- reading the page ---------- */

// Runs inside each frame. Looks through open shadow roots too, and tags what it finds with data-mc-ref.
const SNAPSHOT_FN = `(opts) => {
  const sel = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[contenteditable=""],[contenteditable="true"],[onclick]';
  const roots = [document];
  const els = [];
  const walk = (root) => {
    root.querySelectorAll('[data-mc-ref]').forEach((e) => e.removeAttribute('data-mc-ref'));
    root.querySelectorAll(sel).forEach((e) => els.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  };
  walk(document);
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const items = []; let n = 0; let more = false;
  const filter = (opts.filter || '').toLowerCase();
  for (const el of els) {
    if (el.disabled || !visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const isField = tag === 'input' || tag === 'textarea' || tag === 'select';
    const raw = el.getAttribute('aria-label') || (isField ? (el.placeholder || el.name || el.title || '') : (el.innerText || el.title || el.alt || ''));
    const label = raw.replace(/\\s+/g, ' ').trim().slice(0, 80);
    const type = tag === 'input' ? ':' + (el.type || 'text') : '';
    const value = isField && el.type !== 'password' && el.value ? ' value="' + String(el.value).slice(0, 40) + '"' : '';
    const checked = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? ' [checked]' : ' [unchecked]') : '';
    const href = tag === 'a' ? ' -> ' + (el.getAttribute('href') || '').slice(0, 80) : '';
    const line = tag + type + ' "' + label + '"' + value + checked + href;
    if (filter && !line.toLowerCase().includes(filter)) continue;
    if (n >= opts.max) { more = true; break; }
    const id = 'e' + (opts.start + ++n);
    el.setAttribute('data-mc-ref', id);
    items.push({ id, line });
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, opts.text);
  return { url: location.href, title: document.title, text, items, more };
}`

async function snapshot(page: Page, filter = ''): Promise<string> {
  const build = async (): Promise<string> => {
    refs = new Map()
    let n = 0
    let more = false
    const out: string[] = []
    const frames = page.frames()
    for (const [i, frame] of frames.entries()) {
      if (n >= MAX_ELEMENTS) {
        more = true
        break
      }
      let r: { url: string; title: string; text: string; items: { id: string; line: string }[]; more: boolean }
      try {
        r = await frame.evaluate(`(${SNAPSHOT_FN})(${JSON.stringify({ start: n, max: MAX_ELEMENTS - n, text: i === 0 ? 4000 : 800, filter })})`)
      } catch {
        continue // a frame that went away or cannot be read
      }
      if (i === 0) out.push(`URL: ${r.url}`, `Title: ${r.title}`, '', 'Page text:', r.text, '', 'Interactive elements:')
      else if (r.items.length || r.text.trim()) out.push('', `Frame ${r.url}:`, r.text.trim() ? `Text: ${r.text.replace(/\s+/g, ' ').slice(0, 400)}` : '')
      for (const it of r.items) {
        refs.set(it.id, frame)
        out.push(`[${it.id}] ${it.line}`)
      }
      n += r.items.length
      more = more || r.more
    }
    if (!refs.size) out.push(filter ? `(nothing matched “${filter}”)` : '(none found)')
    if (more) out.push(`… more elements not shown. Use browser_snapshot with a filter, or scroll.`)
    return out.filter((l, k, a) => !(l === '' && a[k - 1] === '')).join('\n')
  }
  try {
    return await build()
  } catch {
    // the page navigated while reading it: wait for it, then read once more
    await page.waitForLoadState('load', { timeout: 5000 }).catch(() => undefined)
    return await build()
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => undefined)
  await sleep(300)
}

function locate(i: Input): Locator {
  const id = typeof i.ref === 'string' ? i.ref.trim() : ''
  if (!/^e\d+$/.test(id)) throw new Error('“ref” must be an element reference from browser_snapshot, like e12.')
  const frame = refs.get(id)
  if (!frame) throw new Error(`There is no element ${id} in the latest snapshot. Call browser_snapshot for fresh references.`)
  return frame.locator(`[data-mc-ref="${id}"]`)
}

/** Playwright's errors are long; the first lines say what went wrong. */
const brief = (err: unknown): string =>
  (err as Error).message
    .split('\n')
    .filter((l) => l.trim() && !/^\s*-\s+(waiting|retrying|attempting|scrolling|performing)/i.test(l))
    .slice(0, 4)
    .join('\n')

const local = (url: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url)

/* ---------- the actions ---------- */

async function navigate(ctx: ToolContext, id: string, i: Input): Promise<string> {
  let url = typeof i.url === 'string' ? i.url.trim() : ''
  if (!url) throw new Error('“url” is required.')
  if (!/^https?:\/\//i.test(url)) url = /^(localhost|127\.0\.0\.1)/i.test(url) ? `http://${url}` : `https://${url}`
  if (!local(url)) {
    const d = await ctx.ask({ id: `perm-${id}`, action: 'browse', title: 'Open a web page in the Browser tab', command: url, reason: 'The AI wants to browse to this page.' })
    if (d === 'deny') throw new Error('The person did not allow opening this page. Do not try another way; explain what you needed and ask how to proceed.')
  }
  const page = await currentPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  } catch (err) {
    if (!/ERR_ABORTED/.test((err as Error).message)) throw new Error(`The page did not load: ${brief(err)}`)
  }
  await page.waitForLoadState('load', { timeout: 5000 }).catch(() => undefined)
  return snapshot(page)
}

async function click(page: Page, i: Input): Promise<string> {
  await locate(i).click({ timeout: ACTION_TIMEOUT })
  await settle(page)
  return snapshot(page)
}

async function type(page: Page, i: Input): Promise<string> {
  const loc = locate(i)
  const text = typeof i.text === 'string' ? i.text : ''
  // Typing goes to whatever has the keyboard focus. If the app's own message box has it, the text lands there
  // instead of in the page, so give the Browser tab the focus first.
  focusTab(await activeTab())
  try {
    await loc.fill(text, { timeout: ACTION_TIMEOUT })
  } catch {
    // not a normal field (for example a custom editor): click it and type
    await loc.click({ timeout: ACTION_TIMEOUT })
    await page.keyboard.press('ControlOrMeta+A')
    if (text) await page.keyboard.insertText(text)
    else await page.keyboard.press('Backspace')
  }
  // Some forms ignore a filled value until they see the page's own input events. If the field does not hold
  // the text, set it the way a keyboard would, so the site notices.
  const landed = await loc.inputValue({ timeout: 1000 }).catch(() => null)
  if (landed !== null && landed !== text) {
    await loc
      .evaluate((el: unknown, v: unknown) => {
        // runs inside the page
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const node = el as any
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set
        setter?.call(node, v)
        const Ev = node.ownerDocument.defaultView.Event
        node.dispatchEvent(new Ev('input', { bubbles: true }))
        node.dispatchEvent(new Ev('change', { bubbles: true }))
      }, text)
      .catch(() => undefined)
  }
  if (i.submit === true) await page.keyboard.press('Enter')
  await settle(page)
  return snapshot(page)
}

async function selectOption(page: Page, i: Input): Promise<string> {
  const v = i.values ?? i.value
  const values = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string')
  if (!values.length) throw new Error('“values” must list what to choose, by label or value.')
  await locate(i).selectOption(values, { timeout: ACTION_TIMEOUT })
  await settle(page)
  return snapshot(page)
}

async function press(page: Page, i: Input): Promise<string> {
  const key = typeof i.key === 'string' ? i.key.trim() : ''
  if (!key) throw new Error('“key” is required, for example Enter, Tab, Escape or Control+A.')
  focusTab(await activeTab())
  await page.keyboard.press(key)
  await settle(page)
  return snapshot(page)
}

async function scroll(page: Page, i: Input): Promise<string> {
  if (typeof i.ref === 'string' && i.ref) await locate(i).scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT })
  else await page.evaluate(`window.scrollBy(0, ${i.direction === 'up' ? -1 : 1} * Math.round(window.innerHeight * 0.8))`)
  await sleep(300)
  return snapshot(page)
}

async function waitFor(page: Page, i: Input): Promise<string> {
  const text = typeof i.text === 'string' ? i.text : ''
  if (!text) throw new Error('“text” is required.')
  const seconds = Math.min(30, Math.max(1, Number(i.seconds) || 10))
  const loc = page.getByText(text).first()
  await loc.waitFor({ state: i.gone === true ? 'hidden' : 'visible', timeout: seconds * 1000 })
  return snapshot(page)
}

async function back(page: Page): Promise<string> {
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => undefined)
  await settle(page)
  return snapshot(page)
}

function listTabs(): string {
  const all = [...tabs.values()].filter((w) => !w.isDestroyed())
  if (!all.length) return 'No Browser tabs are open.'
  return all.map((w, k) => `[${k + 1}] ${w.getTitle() || '(untitled)'} — ${w.getURL() || 'blank'}${w.id === activeId ? '  (in use)' : ''}`).join('\n')
}

function useTab(i: Input): string {
  const all = [...tabs.values()].filter((w) => !w.isDestroyed())
  const w = all[Number(i.index) - 1]
  if (!w) throw new Error(`There is no tab ${String(i.index)}.\n${listTabs()}`)
  activeId = w.id
  cached = null
  refs = new Map()
  return `Now using tab ${String(i.index)}.\n${listTabs()}`
}

async function screenshot(page: Page, i: Input): Promise<{ text: string; data: string }> {
  const buf = await page.screenshot({ type: 'png', scale: 'css', fullPage: i.full_page === true })
  return { text: `Screenshot of ${page.url()}`, data: buf.toString('base64') }
}

/* ---------- tool definitions ---------- */

export const BROWSER_TOOL_DEFS: ToolDef[] = [
  {
    name: 'browser_navigate',
    description:
      'Open a web address in the person\'s Browser tab and return a snapshot of the page. Use it to look at a running dev server (for example http://localhost:3000) or any web page. The person is asked first for pages that are not on their own computer.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
  },
  {
    name: 'browser_snapshot',
    description:
      'Read the page now showing in the Browser tab: its text and a numbered list of things you can click or type into (refs like e12), including inside iframes and shadow DOM. Refs change on every snapshot, so use the newest one. Pass filter to list only elements whose text contains it, which helps on big pages.',
    input_schema: { type: 'object', properties: { filter: { type: 'string', description: 'Only list elements containing this text.' } } }
  },
  {
    name: 'browser_screenshot',
    description: 'Take a picture of the Browser tab so you can see layout, colours and anything the text snapshot misses. Set full_page for the whole scrollable page.',
    input_schema: { type: 'object', properties: { full_page: { type: 'boolean' } } }
  },
  {
    name: 'browser_click',
    description: 'Click an element in the Browser tab by its ref from the latest snapshot. Waits for it to be clickable. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: { ref: { type: 'string', description: 'For example e12.' } }, required: ['ref'] }
  },
  {
    name: 'browser_type',
    description: 'Type text into a field in the Browser tab, replacing what is there. Set submit to press Enter afterwards. Returns a fresh snapshot.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } },
      required: ['ref', 'text']
    }
  },
  {
    name: 'browser_select',
    description: 'Choose option(s) in a dropdown (select element) by label or value. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: { ref: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } }, required: ['ref', 'values'] }
  },
  {
    name: 'browser_press',
    description: 'Press a key or shortcut in the Browser tab, for example Enter, Tab, Escape, ArrowDown or Control+A. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the Browser tab one screen up or down, or scroll an element (ref) into view. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, ref: { type: 'string' } } }
  },
  {
    name: 'browser_wait_for',
    description: 'Wait until some text appears on the page (or disappears, with gone: true), up to 30 seconds. Use it after actions that load content. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, gone: { type: 'boolean' }, seconds: { type: 'integer' } }, required: ['text'] }
  },
  {
    name: 'browser_back',
    description: 'Go back one page in the Browser tab. Returns a fresh snapshot.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_tabs',
    description: 'List the open Browser tabs, or switch to one by number with index.',
    input_schema: { type: 'object', properties: { index: { type: 'integer', description: 'Switch to this tab.' } } }
  }
]

const LABELS: Record<string, (i: Input) => string> = {
  browser_navigate: (i) => `Open ${String(i.url ?? '')}`.slice(0, 60),
  browser_snapshot: () => 'Read the page',
  browser_screenshot: () => 'Take a screenshot',
  browser_click: (i) => `Click ${String(i.ref ?? '')}`,
  browser_type: (i) => `Type into ${String(i.ref ?? '')}`,
  browser_select: (i) => `Choose in ${String(i.ref ?? '')}`,
  browser_press: (i) => `Press ${String(i.key ?? '')}`,
  browser_scroll: (i) => `Scroll ${i.ref ? String(i.ref) : i.direction === 'up' ? 'up' : 'down'}`,
  browser_wait_for: (i) => `Wait for “${String(i.text ?? '').slice(0, 30)}”`,
  browser_back: () => 'Go back',
  browser_tabs: (i) => (i.index ? `Use tab ${String(i.index)}` : 'List tabs')
}

let busy = 0

export async function runBrowserTool(name: string, id: string, input: Input, ctx: ToolContext): Promise<ToolResult> {
  const label = (LABELS[name] ?? (() => name))(input)
  ctx.emit({ kind: 'command', id, label, command: label, status: 'running' })
  busy++
  glow(true)
  try {
    let out: string
    let images: ToolResult['images']
    if (name === 'browser_navigate') out = await navigate(ctx, id, input)
    else if (name === 'browser_tabs') out = input.index ? useTab(input) : listTabs()
    else {
      const page = await currentPage()
      switch (name) {
        case 'browser_snapshot':
          out = await snapshot(page, typeof input.filter === 'string' ? input.filter.trim() : '')
          break
        case 'browser_screenshot': {
          const shot = await screenshot(page, input)
          out = shot.text
          images = [{ media_type: 'image/png', data: shot.data }]
          break
        }
        case 'browser_click':
          out = await click(page, input)
          break
        case 'browser_type':
          out = await type(page, input)
          break
        case 'browser_select':
          out = await selectOption(page, input)
          break
        case 'browser_press':
          out = await press(page, input)
          break
        case 'browser_scroll':
          out = await scroll(page, input)
          break
        case 'browser_wait_for':
          out = await waitFor(page, input)
          break
        case 'browser_back':
          out = await back(page)
          break
        default:
          throw new Error(`There is no tool called ${name}.`)
      }
    }
    ctx.emit({ kind: 'command', id, label, command: label, status: 'done', output: out.slice(0, 1500) })
    return { content: out.length > 14_000 ? `${out.slice(0, 14_000)}\n… [page cut short; use a filter]` : out, ...(images ? { images } : {}) }
  } catch (err) {
    const message = brief(err)
    ctx.emit({ kind: 'command', id, label, command: label, status: 'error', output: message })
    return { content: message, isError: true }
  } finally {
    busy--
    // keep the glow a moment so quick steps do not flicker
    setTimeout(() => {
      if (busy === 0) glow(false)
    }, 700)
  }
}
