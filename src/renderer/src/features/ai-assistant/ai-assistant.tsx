import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Close, Plus, Stop } from 'fluid-icons/react'
import { AppWindow, ChevronDown, File as FileIcon, Folder, Image as ImageIcon, Mic, RefreshCw, ThumbsDown, ThumbsUp } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionMenu } from '@/components/action-menu'
import { cn } from '@/lib/utils'
import { isMac } from '@/lib/platform'
import { CommandPanel } from './panels/panel-shell'
import { useSettings } from '@/features/settings/settings-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { AttachmentChip, folderFrom, pathFor, readDrop } from './attachments'
import { useChatContext } from './chat-context'
import { BackgroundTasksBar, type HelperTask } from './background-tasks-bar'
import { ChangesBar } from './changes-bar'
import { fileIconHtml } from '@/components/file-icon'
import { MessageRail } from './message-rail'
import { QueueBar } from './queue-bar'
import type { BgJob } from '../../../../preload'
import { ErrorCard } from './error-card'
import { toDataUrl } from './image-utils'
import { MentionMenu } from './mention-menu'
import { CopyButton, IconAction } from './message-actions'
import { ATTACH_ONLY, Markdown } from './message-parts'
import { modelName } from './models'
import { useModelChoices } from './use-model-choices'
import { SlashMenu } from './slash-menu'
import {
  buildCommands,
  filterCommands,
  parseCommands,
  type PanelId,
  type SlashCommand
} from './slash-commands'
import { useSkills } from '@/features/skills/skills-store'
import { customPrompt, skillIcon, skillPrompt, slashLabel } from '@/features/skills/skills-data'
import { ThinkingGlyph } from './thinking-block'
import { ToolRow } from './tool-rows'
import { UserMessage } from './user-message'
import { useDictation } from './use-dictation'
import { matchFiles, useWorkspaceFiles } from './workspace-files'
import type { Attachment, Msg, Part, ToolBlock } from './types'

const took = (ms?: number): string | null => {
  if (!ms) return null
  const s = Math.max(1, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const tokensLabel = (n?: number): string | null =>
  n ? `${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n} tokens` : null

/** Starting points for an empty chat. They depend on where the chat lives: a chat in a project can be pointed at its files, a loose one cannot. */
const PROJECT_STARTERS = [
  { label: 'Explain this project', text: 'Explain how this project is organised and where I should start reading.' },
  { label: 'Look for bugs', text: 'Look through this project for bugs or mistakes and list what you find, most serious first.' },
  { label: 'Run the tests', text: 'Run the tests and tell me what fails and why.' },
  { label: 'Review my changes', text: 'Review the changes I have made since my last saved version and point out any problems.' }
]
const LOOSE_STARTERS = [
  { label: 'Build something new', text: 'Build me a small app that ' },
  { label: 'Explain an error', text: 'Explain this error and how to fix it:\n\n' },
  { label: 'Plan before building', text: 'Help me plan how to build ' },
  { label: 'Automate a task', text: 'Write a script that ' }
]
const MAX_ATTACHMENTS = 10

function composerContent(root: HTMLElement): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
    if (!(node instanceof HTMLElement)) return ''
    if (node.dataset.mentionToken) return node.dataset.mentionToken
    if (node.tagName === 'BR') return '\n'
    return Array.from(node.childNodes).map(read).join('')
  }
  return Array.from(root.childNodes).map(read).join('')
}

function composerOffset(root: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return composerContent(root).length
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(root)
  range.setEnd(selection.anchorNode!, selection.anchorOffset)
  return composerContent(range.cloneContents() as unknown as HTMLElement).length
}

function placeComposerCaret(root: HTMLElement, offset: number): void {
  const selection = window.getSelection()
  if (!selection) return
  let remaining = offset
  // the text inside a chip is not part of the message, so the walk skips it
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) =>
      n.nodeType === Node.TEXT_NODE && (n.parentElement as HTMLElement | null)?.closest('[data-mention-token]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  })
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node instanceof HTMLElement && node.dataset.mentionToken) {
      const length = node.dataset.mentionToken.length
      if (remaining < length) {
        const range = document.createRange()
        range.setStartBefore(node)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= length
    } else if (node.nodeType === Node.TEXT_NODE) {
      const length = node.nodeValue?.length ?? 0
      if (remaining <= length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= length
    }
  }
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Every leading "/command" of the message that is a real command, in order. */
function slashTokens(text: string, ids: string[]): string[] {
  const out: string[] = []
  let pos = 0
  for (;;) {
    const m = /^\/([a-z0-9-]+)(?=\s|$)/.exec(text.slice(pos))
    if (!m || !ids.includes(m[1])) break
    out.push(m[0])
    pos += m[0].length
    const gap = /^\s+/.exec(text.slice(pos))
    if (!gap) break
    pos += gap[0].length
  }
  return out
}

function populateComposer(root: HTMLElement, text: string, slashes: string[] = []): void {
  root.replaceChildren()
  const pattern = /(^|\s)(@[^\s@]+)/g
  let cursor = 0
  for (const slash of slashes) {
    // one block each, like an @file chip: deleted whole with Backspace, and the caret cannot enter it
    const at = text.indexOf(slash, cursor)
    if (at < 0) break
    if (at > cursor) root.append(document.createTextNode(text.slice(cursor, at)))
    const tag = document.createElement('span')
    tag.contentEditable = 'false'
    tag.dataset.slashToken = '1'
    tag.dataset.mentionToken = slash
    tag.className = 'inline-flex select-all items-center rounded-[5px] bg-[#3b82f6]/15 px-1 text-[#3b8cff]'
    tag.textContent = slash
    root.append(tag)
    cursor = at + slash.length
  }
  pattern.lastIndex = cursor
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const tokenStart = match.index + match[1].length
    if (tokenStart > cursor) root.append(document.createTextNode(text.slice(cursor, tokenStart)))
    const token = match[2]
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.mentionToken = token
    chip.className = 'inline-flex select-all items-center rounded-[5px] bg-[#3b82f6]/15 px-1.5 text-[#70a7ff]'
    const path = token.slice(1)
    chip.innerHTML = fileIconHtml(path.split('/').pop() ?? path)
    const label = document.createElement('span')
    label.textContent = path
    chip.append(label)
    root.append(chip)
    cursor = tokenStart + token.length
  }
  if (cursor < text.length) root.append(document.createTextNode(text.slice(cursor)))
}

type AgentMsg = Extract<Msg, { role: 'agent' }>

/** What the AI is doing right now, in plain words. */
function currentActivity(parts: Part[]): string {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p.type !== 'tool') continue
    const t: ToolBlock = p.tool
    if (t.kind === 'permission' && t.state === 'pending') return 'Waiting for your answer'
    if (!('status' in t) || t.status !== 'running') continue
    if (t.kind === 'thinking') return 'Thinking…'
    if (t.kind === 'edit') return `Editing ${t.path.split('/').pop()}`
    if (t.kind === 'agent') return 'A helper is researching'
    if (t.kind === 'mcp') return `Using ${t.connector}`
    if (t.kind === 'read') return 'Reading files'
    if (t.kind === 'command') return t.label
  }
  return 'Working…'
}

/** Seconds since the AI started, ticking while it works. */
function useElapsed(since: number | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0
}

/** Consecutive tool calls render as one tight group; text parts render as markdown. */
function AgentMessage({ msg, isLast }: { msg: AgentMsg; isLast: boolean }): React.JSX.Element {
  const { rate, retry, running } = useChatContext()
  const groups: Array<
    { tools: Part[] } | { text: string } | { error: Extract<Part, { type: 'error' }> }
  > = []
  for (const p of msg.parts) {
    if (p.type === 'text') groups.push({ text: p.text })
    else if (p.type === 'error') groups.push({ error: p })
    else {
      const last = groups[groups.length - 1]
      if (last && 'tools' in last) last.tools.push(p)
      else groups.push({ tools: [p] })
    }
  }
  const elapsed = useElapsed(msg.startedAt, Boolean(msg.running))
  const meta = [took(msg.durationMs), tokensLabel(msg.tokens), msg.stopped ? 'Stopped' : null]
    .filter(Boolean)
    .join(' · ')
  const replyText = msg.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="min-w-0 text-[13px] leading-6 [overflow-wrap:anywhere]">
      {groups.map((g, i) =>
        'text' in g ? (
          <div key={i} className="my-1.5">
            <Markdown text={g.text} />
          </div>
        ) : 'error' in g ? (
          <ErrorCard key={i} part={g.error} agentId={msg.id} />
        ) : (
          <div key={i} className="my-1 space-y-px">
            {g.tools.map((p) => p.type === 'tool' && <ToolRow key={p.tool.id} tool={p.tool} />)}
          </div>
        )
      )}
      {msg.running ? (
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[12.5px]">
          <ThinkingGlyph active />
          <span className="text-shimmer">{currentActivity(msg.parts)}</span>
          <span className="text-[11.5px] tabular-nums text-muted-foreground">
            {elapsed > 0 && `${elapsed}s · `}Esc to stop
          </span>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-0.5 text-[11.5px] text-muted-foreground">
          {replyText && <CopyButton text={replyText} className="-ml-1.5" />}
          {replyText && (
            <>
              <IconAction label="Good response" active={msg.feedback === 'up'} onClick={() => rate(msg.id, 'up')}>
                <ThumbsUp className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction
                label="Bad response"
                active={msg.feedback === 'down'}
                onClick={() => {
                  if (msg.feedback !== 'down') toast.success('Thanks for the feedback')
                  rate(msg.id, 'down')
                }}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </IconAction>
            </>
          )}
          {isLast && (
            <IconAction label="Try again" disabled={running} onClick={() => retry(msg.id)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconAction>
          )}
          {meta && (
            <span className="ml-1.5 flex items-center gap-1.5">
              {meta}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function AiAssistant(): React.JSX.Element {
  const {
    messages,
    running,
    totals,
    send,
    acceptAll,
    discardAll,
    stop,
    owner,
    compact,
    clear,
    model,
    setModel,
    autoAccept,
    setAutoAccept
  } = useChatContext()
  const { choices: modelChoices, choose: chooseModel } = useModelChoices(setModel)
  const [input, setInput] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [pickIndex, setPickIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [bgJobs, setBgJobs] = useState<BgJob[]>([])

  useEffect(() => {
    window.api?.agent?.jobs?.().then((list) => setBgJobs(list ?? []))
    return window.api?.agent?.onJobs?.((list) => setBgJobs(list ?? []))
  }, [])

  const activeHelpers = useMemo<HelperTask[]>(() => {
    const out: HelperTask[] = []
    for (const m of messages) {
      if (m.role !== 'agent' || !m.parts) continue
      for (const p of m.parts) {
        if (p.type === 'tool' && p.tool.kind === 'agent' && p.tool.status === 'running') {
          out.push({ id: p.tool.id, task: p.tool.task, steps: p.tool.steps })
        }
      }
    }
    return out
  }, [messages])

  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLDivElement>(null)
  const photoPicker = useRef<HTMLInputElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const nextCaret = useRef<number | null>(null)
  const voiceBase = useRef('')
  const dragDepth = useRef(0)
  const dropHandlers = useRef<{
    addFiles: (files: File[]) => Promise<void>
    addAttachments: (items: Attachment[]) => void
  } | null>(null)

  const { settings, openSettings } = useSettings()
  const ws = useWorkspace()
  const group = ws.groups.find((g) => g.id === ws.active.projectId)
  const folder = group?.name ?? ''
  const projectPath = group?.folder
  const files = useWorkspaceFiles(projectPath ?? '')

  const skills = useSkills()
  const commands = useMemo(
    () => buildCommands(skills.active, skills.commands),
    [skills.active, skills.commands]
  )
  // a "/" at the end of the typed text opens the menu, also after earlier commands ("/plan /code-review")
  const slashMatch = useMemo(() => {
    const m = /^((?:\/[a-z0-9-]+\s+)*)\/([a-z0-9-]*)$/i.exec(input.slice(0, caret))
    if (!m) return null
    const used = [...m[1].matchAll(/\/([a-z0-9-]+)/g)].map((x) => x[1])
    if (!used.every((id) => commands.some((c) => c.id === id))) return null
    return { start: m[1].length, query: m[2], used }
  }, [input, caret, commands])
  const slashOpen = Boolean(slashMatch) && !dismissed
  const promptLike = (c: SlashCommand): boolean => c.kind === 'skill' || c.kind === 'custom' || c.kind === 'prompt'
  const slashList = slashMatch && slashOpen
    ? filterCommands(commands, slashMatch.query).filter(
        (c) => !slashMatch.used.includes(c.id) && (slashMatch.used.length === 0 || promptLike(c))
      )
    : []

  // the AI offers a skill when the message sounds like one the person has switched on
  const [skipped, setSkipped] = useState<string[]>([])
  const suggested = useMemo(() => {
    const text = input.trim().toLowerCase()
    if (input.startsWith('/') || text.length < 8) return null
    return (
      skills.active.find(
        (s) => !skipped.includes(s.id) && s.triggers.some((t) => text.includes(t))
      ) ?? null
    )
  }, [input, skills.active, skipped])

  // "@" followed by a few letters, right before the cursor
  const mention = useMemo(() => {
    const m = /(^|\s)@([^\s@]*)$/.exec(input.slice(0, caret))
    return m ? { start: caret - m[2].length - 1, query: m[2] } : null
  }, [input, caret])
  const mentionOpen = Boolean(mention) && !slashOpen && !dismissed
  const mentionList = useMemo(
    () => (mentionOpen && mention ? matchFiles(files, mention.query) : []),
    [mentionOpen, mention, files]
  )

  const scrollToEnd = (smooth = true): void => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    })
  }

  // keep the view pinned to new content while the user is at the bottom
  useEffect(() => {
    if (atBottom) scrollToEnd(false)
  }, [messages, atBottom])

  // put the cursor where an inserted file name ends
  useLayoutEffect(() => {
    const editor = field.current
    if (!editor) return
    const current = composerContent(editor)
    const slashes = slashTokens(input, commands.map((c) => c.id))
    const shown = Array.from(editor.children).flatMap((el) => (el instanceof HTMLElement && el.dataset.slashToken ? [el.textContent ?? ''] : []))
    const inSync = current === input && shown.length === slashes.length && shown.every((t, i) => t === slashes[i])
    if (inSync && nextCaret.current === null) return
    const typing = current === input && document.activeElement === editor
    const typedAt = typing ? composerOffset(editor) : input.length
    if (!inSync) populateComposer(editor, input, slashes)
    const position = nextCaret.current ?? typedAt
    placeComposerCaret(editor, position)
    setCaret(position)
    nextCaret.current = null
  }, [input])

  const addFiles = async (list: File[]): Promise<void> => {
    const pics = list.filter((f) => f.type.startsWith('image/'))
    const others = list.filter((f) => !f.type.startsWith('image/'))
    if (pics.length) {
      try {
        const urls = await Promise.all(pics.slice(0, 4).map(toDataUrl))
        setImages((l) => [...l, ...urls].slice(0, 4))
      } catch {
        toast.error('Could not read image')
      }
    }
    if (others.length) {
      addAttachments(others.map((f) => ({ kind: 'file' as const, name: f.name, path: pathFor(f) })))
    }
  }

  const addAttachments = (items: Attachment[]): void => {
    if (!items.length) return
    setAttachments((l) => {
      const fresh = items.filter((a) => !l.some((x) => x.name === a.name && x.path === a.path))
      if (l.length + fresh.length > MAX_ATTACHMENTS) toast.error(`You can attach up to ${MAX_ATTACHMENTS} items`)
      return [...l, ...fresh].slice(0, MAX_ATTACHMENTS)
    })
  }

  useEffect(() => {
    dropHandlers.current = { addFiles, addAttachments }
  })

  // Listen on the document so dropping anywhere in the app attaches files to the composer.
  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => Boolean(e.dataTransfer?.types.includes('Files'))
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const over = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    }
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      const outside = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
      if (outside || dragDepth.current === 0) setDragging(false)
    }
    const drop = (e: DragEvent): void => {
      if (!hasFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const dropped = readDrop(e.dataTransfer)
      void dropHandlers.current?.addFiles(dropped.images)
      dropHandlers.current?.addAttachments(dropped.attachments)
    }

    document.addEventListener('dragenter', enter, true)
    document.addEventListener('dragover', over, true)
    document.addEventListener('dragleave', leave, true)
    document.addEventListener('drop', drop, true)
    return () => {
      document.removeEventListener('dragenter', enter, true)
      document.removeEventListener('dragover', over, true)
      document.removeEventListener('dragleave', leave, true)
      document.removeEventListener('drop', drop, true)
    }
  }, [])

  const { listening, toggle: toggleVoice, stop: stopVoice } = useDictation((spoken) =>
    setInput(voiceBase.current ? `${voiceBase.current} ${spoken}` : spoken)
  )

  type Resolved = { q: string; shown?: string } | { handled: true } | null
  /** Turn what was typed into the message to send. `exec` lets a typed panel or action command run now. */
  const resolve = (raw: string, exec = true): Resolved => {
    const { list, tokens, args } = parseCommands(commands, raw)
    if (!list.length) return { q: raw.trim() }
    if (list.length === 1) {
      const c = list[0]
      if (c.kind === 'skill') return { q: skillPrompt(c.skill, args), shown: slashLabel(c.id, args) }
      if (c.kind === 'custom') return { q: customPrompt(c.command, args), shown: slashLabel(c.id, args) }
      if (c.kind === 'prompt') {
        if (!args.trim() && !c.bare) return null
        return { q: args.trim() ? `${c.prompt}\n\n${args}` : c.prompt, shown: slashLabel(c.id, args) }
      }
      if (!exec) return null
      runCommand(c)
      return { handled: true }
    }
    // several commands: all their instructions apply, then the task
    const bits: string[] = []
    for (const c of list) {
      if (c.kind === 'skill') bits.push(`Use the “${c.skill.name}” skill. Follow these instructions:\n\n${c.skill.instructions}`)
      else if (c.kind === 'custom') bits.push(c.command.prompt.replaceAll('$ARGUMENTS', args.trim()))
      else if (c.kind === 'prompt') bits.push(c.prompt)
      else {
        if (exec) toast.error(`/${c.id} cannot be combined with other commands`)
        return exec ? { handled: true } : null
      }
    }
    const task = args.trim() ? `Task: ${args.trim()}` : 'Task: apply them to what we are working on in this chat.'
    return { q: `${bits.join('\n\n')}\n\n${task}`, shown: `${tokens.join(' ')}${args.trim() ? ` ${args.trim()}` : ''}` }
  }

  // messages typed while the AI is busy wait here, per chat, and go out one by one
  interface Queued {
    id: string
    raw: string
    q: string
    shown?: string
    images: string[]
    attachments: Attachment[]
  }
  const [queues, setQueues] = useState<Record<string, Queued[]>>({})
  const chatKey = ws.activeId
  const queue = queues[chatKey] ?? []
  const setQueue = (fn: (list: Queued[]) => Queued[]): void =>
    setQueues((cur) => ({ ...cur, [chatKey]: fn(cur[chatKey] ?? []) }))

  const submit = (raw: string): void => {
    const r = resolve(raw)
    if (!r || 'handled' in r) return
    const q = r.q || (images.length || attachments.length ? ATTACH_ONLY[0] : '')
    if (!q) return
    stopVoice()
    if (running) {
      setQueue((l) => [...l, { id: crypto.randomUUID(), raw: raw.trim() || q, q, shown: r.shown, images, attachments }])
      setInput('')
      setImages([])
      setAttachments([])
      return
    }
    // not sent (out of messages, or the plan lacks this model): the plan dialog opens and the draft stays
    if (!send(q, images, model, autoAccept, attachments, r.shown)) return
    setInput('')
    setImages([])
    setAttachments([])
    setAtBottom(true)
  }

  const runCommand = (c: SlashCommand, keepInput = ''): void => {
    setInput(keepInput)
    setPickIndex(0)
    if (c.kind === 'panel') setPanel(c.panel)
    else if (c.kind === 'prompt' && c.bare) {
      if (!running) send(c.prompt, [], model, autoAccept, [], slashLabel(c.id, ''))
    } else if (c.kind === 'prompt') {
      nextCaret.current = c.id.length + 2
      setInput(`/${c.id} `)
      setDismissed(true)
      requestAnimationFrame(() => field.current?.focus())
    } else if (c.kind === 'prefill') {
      window.dispatchEvent(new CustomEvent('assistant:prefill', { detail: c.text }))
    }
    else if (c.kind === 'skill' || c.kind === 'custom') {
      // like Claude: picking a skill lets you say what to use it on, instead of firing it blindly
      nextCaret.current = c.id.length + 2
      setInput(`/${c.id} `)
      setDismissed(true)
      requestAnimationFrame(() => field.current?.focus())
    } else if (c.action === 'compact') compact(model)
    else if (c.action === 'permissions') openSettings('permissions')
    else if (c.action === 'clear') {
      if (running) toast.error('Stop the current run first')
      else if (totals.files > 0) toast.error('Keep or undo the pending changes first')
      else clear()
    }
  }

  /** Put "/command " into the text where the "/" was typed, keeping any commands before it. */
  const insertToken = (c: SlashCommand): void => {
    if (!slashMatch) return
    const before = input.slice(0, slashMatch.start)
    const after = input.slice(caret)
    const insert = `/${c.id} `
    nextCaret.current = before.length + insert.length
    setInput(before + insert + after)
    setPickIndex(0)
    setDismissed(true)
    requestAnimationFrame(() => field.current?.focus())
  }
  const pickCommand = (c: SlashCommand): void => {
    if (!slashMatch) return runCommand(c)
    const before = input.slice(0, slashMatch.start)
    const after = input.slice(caret)
    const alone = !before.trim() && !after.trim()
    if (promptLike(c) && !(c.kind === 'prompt' && c.bare && alone)) return insertToken(c)
    // panels and actions never combine with other commands: drop the typed "/…" and run it
    runCommand(c, alone ? '' : before + after)
  }

  const pickMention = (path: string): void => {
    if (!mention) return
    const before = input.slice(0, mention.start)
    const insert = `@${path} `
    nextCaret.current = before.length + insert.length
    setInput(before + insert + input.slice(caret))
    setPickIndex(0)
  }

  // the command palette can run any slash command from outside the message box
  const runRef = useRef(runCommand)
  const commandsRef = useRef(commands)
  useEffect(() => {
    runRef.current = runCommand
    commandsRef.current = commands
  })
  useEffect(() => {
    const onRun = (e: Event): void => {
      const cmd = commandsRef.current.find((c) => c.id === (e as CustomEvent<string>).detail)
      if (cmd) runRef.current(cmd)
    }
    // panels can drop text into the message box ("Use it" on a skill)
    const onPrefill = (e: Event): void => {
      const text = (e as CustomEvent<string>).detail
      nextCaret.current = text.length
      setInput(text)
      setDismissed(true)
      requestAnimationFrame(() => field.current?.focus())
    }
    window.addEventListener('assistant:run', onRun)
    window.addEventListener('assistant:prefill', onPrefill)
    return () => {
      window.removeEventListener('assistant:run', onRun)
      window.removeEventListener('assistant:prefill', onPrefill)
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const menuSize = slashOpen ? slashList.length : mentionOpen ? mentionList.length : 0
    if (menuSize) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setPickIndex((i) => (i + d + menuSize) % menuSize)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        if (slashOpen) {
          if (e.key === 'Tab') insertToken(slashList[pickIndex])
          else pickCommand(slashList[pickIndex])
        } else pickMention(mentionList[pickIndex])
        return
      }
    }
    if (e.key === 'Escape') {
      if (slashOpen || mentionOpen) setDismissed(true)
      else if (listening) stopVoice()
      else if (running) stop()
      return
    }
    if (e.key === 'Enter') {
      const mod = e.ctrlKey || e.metaKey
      // "Enter" mode sends on Enter; "Ctrl Enter" mode keeps Enter for new lines
      if (settings.sendWith === 'mod-enter' ? mod : !e.shiftKey) {
        e.preventDefault()
        submit(input)
      } else {
        e.preventDefault()
        document.execCommand('insertLineBreak')
      }
    }
  }

  const queueNow = useRef<string | null>(null)
  const queueBlocked = useRef(false)
  const dispatchQueued = (item: Queued): boolean => {
    const ok = send(item.q, item.images, model, autoAccept, item.attachments, item.shown)
    if (ok) {
      setQueue((l) => l.filter((x) => x.id !== item.id))
      setAtBottom(true)
    }
    return ok
  }
  useEffect(() => {
    if (running || owner !== chatKey) return
    if (!queue.length) {
      queueBlocked.current = false
      return
    }
    const forced = queueNow.current ? queue.find((x) => x.id === queueNow.current) : undefined
    const last = [...messages].reverse().find((m) => m.role === 'agent')
    // after an error or a stop the queue waits; "Send now" still sends one
    const clean = !last || (last.role === 'agent' && !last.stopped && !last.parts.some((p) => p.type === 'error'))
    const target = forced ?? (clean && !queueBlocked.current ? queue[0] : undefined)
    if (!target) return
    queueNow.current = null
    if (!dispatchQueued(target)) queueBlocked.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, queues, messages, owner, chatKey])
  const sendQueuedNow = (id: string): void => {
    const item = queue.find((x) => x.id === id)
    if (!item) return
    if (running) {
      queueNow.current = id
      stop()
    } else dispatchQueued(item)
  }
  const editQueued = (id: string, raw: string): void => {
    const r = resolve(raw, false)
    if (!r || 'handled' in r) {
      toast.error('That message needs some text after the command')
      return
    }
    setQueue((l) => l.map((x) => (x.id === id ? { ...x, raw, q: r.q, shown: r.shown } : x)))
  }

  const revealLabel = isMac ? 'Reveal in Finder' : 'Show in file explorer'
  // a brand-new chat: heading, message box and suggestions sit together in the middle of the page
  const empty = messages.length === 0

  return (
    <div
      className={cn(
        'relative isolate flex h-full min-h-0 w-full select-text flex-col bg-background text-foreground',
        empty && 'justify-center'
      )}
    >
      {dragging && createPortal(
        <div className="drop-veil pointer-events-none fixed inset-0 z-[9999] grid place-items-center bg-black/20 p-3 backdrop-blur-[6px]">
          <div className="absolute inset-3 rounded-[20px] border border-dashed border-[#3b82f6]/70 bg-[#3b82f6]/[0.04]" />
          <div className="relative flex flex-col items-center gap-3 text-[#1683ff]">
            <div className="flex items-center justify-center gap-1">
              <ImageIcon className="drop-icon h-9 w-9 stroke-[1.6]" style={{ '--from': '34px', '--rot': '-14deg', '--lift': '3px', '--delay': '40ms' } as React.CSSProperties} />
              <FileIcon className="drop-icon h-9 w-9 stroke-[1.6]" style={{ '--from': '0px', '--rot': '0deg', '--lift': '-3px', '--delay': '0ms' } as React.CSSProperties} />
              <Folder className="drop-icon h-9 w-9 stroke-[1.6]" style={{ '--from': '-34px', '--rot': '14deg', '--lift': '3px', '--delay': '80ms' } as React.CSSProperties} />
            </div>
            <span className="drop-label text-[18px] font-medium text-[#5aa6ff]">Drop files here</span>
          </div>
        </div>,
        document.body
      )}
      {empty && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1.2px)] [background-size:22px_22px] [-webkit-mask-image:radial-gradient(ellipse_75%_65%_at_50%_48%,#000_20%,transparent_100%)] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_48%,#000_20%,transparent_100%)]"
        />
      )}
      <div className={cn('@container relative flex flex-col', empty ? 'flex-none' : 'min-h-0 flex-1')}>
      {!empty && <MessageRail messages={messages} scroller={scroller} />}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
        }}
        className={cn(empty ? 'flex-none px-3 md:px-4' : 'flex-1 overflow-y-auto px-3 py-3 md:px-4 @[512px]:px-9')}
      >
        <div className="mx-auto w-full max-w-[var(--content-w,56rem)] space-y-5 pb-3 pt-1">
          {empty && (
            <div className="flex flex-col items-center gap-1 pb-3 text-center">
              <h1 className="font-display text-[28px] font-semibold leading-9 tracking-tight text-[#ececea]">
                What are we working on?
              </h1>
              {folder && <p className="text-[13px] text-muted-foreground">{folder}</p>}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage
                key={m.id}
                msg={m}
                onRewound={(text) => {
                  setInput(text)
                  field.current?.focus()
                  toast.success('Rewound to before that message')
                }}
              />
            ) : m.role === 'system' ? (
              <div key={m.id} className="text-center text-[11.5px] text-muted-foreground">
                {m.text}
                {m.summary && (
                  <details className="mx-auto mt-1 max-w-[34rem] text-left">
                    <summary className="cursor-pointer text-center hover:text-foreground">Show summary</summary>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/[0.08] bg-[#242423] p-2.5 text-[12px] leading-5 text-[#b4b4b0]">{m.summary}</p>
                  </details>
                )}
              </div>
            ) : (
              <AgentMessage key={m.id} msg={m} isLast={i === messages.length - 1} />
            )
          )}
        </div>
      </div>
      </div>

      <div className="relative shrink-0 px-3 pb-1 pt-1">
        <div className="relative mx-auto w-full max-w-[46rem]">
          {!atBottom && messages.length > 0 && (
            <button
              type="button"
              aria-label="Scroll to latest"
              onClick={() => scrollToEnd()}
              className="absolute bottom-full left-1/2 z-20 mb-3 grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-white/[0.12] bg-[#2b2b2a] text-muted-foreground shadow-md transition-colors hover:text-foreground"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
          {slashOpen && (
            <SlashMenu
              commands={slashList}
              index={pickIndex}
              query={slashMatch?.query ?? ''}
              onHover={setPickIndex}
              onPick={pickCommand}
            />
          )}
          {suggested && !slashOpen && !mentionOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-1.5 flex max-w-full items-center gap-2 rounded-[8px] border border-white/[0.09] bg-[#242423] py-1 pl-2 pr-1 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.4)]">
              {React.createElement(skillIcon(suggested.icon), {
                className: 'h-3.5 w-3.5 shrink-0 text-[#8d8d8a]'
              })}
              <span className="truncate text-[#a8a8a6]">
                Use the <span className="text-[#ececea]">{suggested.name}</span> skill?
              </span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInput(`/${suggested.id} ${input.trim()}`)
                }}
                className="cursor-pointer rounded-[5px] bg-white/[0.1] px-2 py-0.5 text-[#ececea] transition-colors hover:bg-white/[0.16]"
              >
                Use
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setSkipped((l) => [...l, suggested.id])
                }}
                className="grid h-5 w-5 cursor-pointer place-items-center rounded-[5px] text-[#8d8d8a] hover:bg-white/[0.08] hover:text-[#ececea]"
              >
                <Close className="h-3 w-3" />
              </button>
            </div>
          )}
          {mentionOpen && (
            <MentionMenu files={mentionList} index={pickIndex} onHover={setPickIndex} onPick={pickMention} />
          )}

          {queue.length > 0 && (
            <QueueBar
              items={queue.map((x) => ({ id: x.id, raw: x.raw }))}
              running={running}
              stackIndex={
                (totals.files > 0 ? 1 : 0) +
                (bgJobs.length > 0 || activeHelpers.length > 0 ? 1 : 0)
              }
              onSendNow={sendQueuedNow}
              onEdit={editQueued}
              onDelete={(id) => setQueue((l) => l.filter((x) => x.id !== id))}
            />
          )}
          {(bgJobs.length > 0 || activeHelpers.length > 0) && (
            <BackgroundTasksBar
              jobs={bgJobs}
              helpers={activeHelpers}
              stackIndex={totals.files > 0 ? 1 : 0}
              onStopJob={(id) => {
                window.api?.agent?.stopJob?.(id)
                toast.success('Background task stopped')
              }}
              onDismissJob={(id) => {
                window.api?.agent?.dropJob?.(id)
              }}
            />
          )}
          {totals.files > 0 && (
            <ChangesBar
              files={totals.files}
              added={totals.added}
              removed={totals.removed}
              stackIndex={0}
              onAccept={() => {
                acceptAll()
                toast.success('Changes kept')
              }}
              onDiscard={() => {
                discardAll()
                toast.success('Changes undone')
              }}
            />
          )}

          <div
            data-tour="composer"
            className={cn(
              'relative z-[4] rounded-3xl border bg-background p-3 transition-colors focus-within:border-primary/50'
            )}
          >
            {images.length || attachments.length ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="h-14 w-14 rounded-lg border object-cover" />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setImages((l) => l.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border bg-background text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Close className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {attachments.map((a, i) => (
                  <AttachmentChip
                    key={`${a.name}-${i}`}
                    item={a}
                    onRemove={() => setAttachments((l) => l.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            ) : null}

            <input
              ref={photoPicker}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
            <input
              ref={filePicker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
            <input
              ref={folderPicker}
              type="file"
              hidden
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => {
                const f = folderFrom(e.target.files)
                if (f) addAttachments([f])
                e.target.value = ''
              }}
            />

            <div className="relative">
              <div
                ref={field}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                onPaste={(e) => {
                  const pasted = [...e.clipboardData.files]
                  if (pasted.length) {
                    e.preventDefault()
                    void addFiles(pasted)
                  } else {
                    const text = e.clipboardData.getData('text/plain')
                    if (text) {
                      e.preventDefault()
                      document.execCommand('insertText', false, text)
                    }
                  }
                }}
                onInput={(e) => {
                  const value = composerContent(e.currentTarget)
                  const position = composerOffset(e.currentTarget)
                  setInput(value)
                  setCaret(position)
                  setPickIndex(0)
                  setDismissed(false)
                }}
                onBlur={(e) => {
                  const value = composerContent(e.currentTarget)
                  if (!value) e.currentTarget.replaceChildren()
                }}
                aria-label="Ask AI anything"
                onSelect={(e) => {
                  setCaret(composerOffset(e.currentTarget))
                }}
                onKeyDown={onKeyDown}
                spellCheck={false}
                data-placeholder={listening ? 'Listening…' : 'Ask AI anything'}
                className="composer-editor relative z-10 block max-h-40 min-h-6 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none"
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <ActionMenu
                side="top"
                align="start"
                items={[
                  { id: 'photos', label: 'Add photos', onClick: () => photoPicker.current?.click() },
                  { id: 'files', label: 'Add files', onClick: () => filePicker.current?.click() },
                  { id: 'folder', label: 'Add a folder', onClick: () => folderPicker.current?.click() },
                  {
                    id: 'mention',
                    label: 'Mention a project file',
                    shortcut: '@',
                    onClick: () => {
                      const sep = input && !/\s$/.test(input) ? ' ' : ''
                      setInput(`${input}${sep}@`)
                      nextCaret.current = input.length + sep.length + 1
                      setTimeout(() => field.current?.focus(), 0)
                    }
                  }
                ]}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full border border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                    aria-label="Attach"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                }
              />

              {running ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 rounded-full cursor-pointer"
                  aria-label="Stop"
                  onClick={stop}
                >
                  <Stop className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full cursor-pointer"
                  aria-label="Send message"
                  disabled={!input.trim() && !images.length && !attachments.length}
                  onClick={() => submit(input)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex select-none items-center justify-between px-1.5 pt-1.5 pb-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAutoAccept((v) => !v)}
                className={cn(
                  'cursor-pointer transition-colors hover:text-foreground text-[11.5px]',
                  autoAccept && 'text-[#d6d6d3]'
                )}
              >
                Auto-accept edits {autoAccept ? 'on' : 'off'}
              </button>
              <ActionMenu
                side="top"
                align="start"
                items={[
                  {
                    id: 'reveal',
                    label: revealLabel,
                    onClick: () => {
                      if (window.api?.workspace?.reveal) void window.api.workspace.reveal(projectPath)
                      else toast.error('Available in the desktop app')
                    }
                  },
                  {
                    id: 'copy-path',
                    label: 'Copy project path',
                    disabled: !projectPath,
                    onClick: () => {
                      if (projectPath) {
                        void navigator.clipboard.writeText(projectPath).then(() => toast.success('Path copied'))
                      }
                    }
                  }
                ]}
                trigger={
                  <button
                    type="button"
                    aria-label="Project folder"
                    title="Project folder"
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <AppWindow className="h-3.5 w-3.5 stroke-[1.8]" />
                  </button>
                }
              />
              <button
                type="button"
                aria-label={listening ? 'Stop voice input' : 'Voice input'}
                title={listening ? 'Stop voice input' : 'Voice input'}
                onClick={() => {
                  if (!listening) voiceBase.current = input.trimEnd()
                  toggleVoice()
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground',
                  listening ? 'text-[#f87171] hover:text-[#f87171]' : 'text-muted-foreground'
                )}
              >
                <span className="relative grid place-items-center">
                  {listening && <span className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-[#f87171]/30" />}
                  <Mic className="relative h-3.5 w-3.5 stroke-[1.8]" />
                </span>
                {listening && <span className="text-[11.5px]">Listening</span>}
              </button>
            </div>

            <ActionMenu
              side="top"
              align="end"
              compact
              contentClassName="min-w-[205px]"
              items={modelChoices.map((c) => ({
                id: c.model.id,
                label: c.model.name,
                description: c.locked ? `${c.model.description} · Upgrade to use` : c.model.description,
                checked: c.model.id === model,
                onClick: () => chooseModel(c)
              }))}
              trigger={
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{modelName(model)}</span>
                  <ChevronDown className="h-3 w-3 stroke-[2] opacity-70" />
                </button>
              }
            />
          </div>
        </div>
      </div>

      {empty && (
        <div className="mx-auto mt-2 flex w-full max-w-[46rem] flex-col items-center gap-2 px-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            {(projectPath ? PROJECT_STARTERS : LOOSE_STARTERS).map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setInput(t.text)
                  field.current?.focus()
                }}
                className="cursor-pointer rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11.5px] text-[#a8a8a6] transition-colors hover:border-white/[0.2] hover:text-foreground"
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#77776f]">
            {projectPath ? 'Type @ to mention a file, or / for commands.' : 'Type / for commands. Move this chat into a project to work on its files.'}
          </p>
        </div>
      )}

      {panel && (
        <CommandPanel
          panel={panel}
          ctx={{ model, onModel: setModel, totals, autoAccept, openPanel: setPanel }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
