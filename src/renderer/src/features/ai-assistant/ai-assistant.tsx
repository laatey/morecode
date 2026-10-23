import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Close, Plus, Stop } from 'fluid-icons/react'
import { AppWindow, Asterisk, ChevronDown, Mic, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionMenu } from '@/components/action-menu'
import { cn } from '@/lib/utils'
import { isMac } from '@/lib/platform'
import { CommandPanel } from './panels/panel-shell'
import { useAuth } from '@/features/auth/auth-store'
import { useSettings } from '@/features/settings/settings-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { AttachmentChip, folderFrom, pathFor, readDrop } from './attachments'
import { useChatContext } from './chat-context'
import { ChangesBar } from './changes-bar'
import { ErrorCard } from './error-card'
import { toDataUrl } from './image-utils'
import { MentionMenu } from './mention-menu'
import { CopyButton, IconAction } from './message-actions'
import { ATTACH_ONLY, Markdown } from './message-parts'
import { MODELS, modelName } from './models'
import { SlashMenu } from './slash-menu'
import {
  buildCommands,
  filterCommands,
  parseSlash,
  type PanelId,
  type SlashCommand
} from './slash-commands'
import { useRightPanel } from '@/features/right-panel/store'
import { NOTES_FILE, NOTES_STARTER, requestOpenDoc } from '@/features/right-panel/docs-request'
import { useSkills } from '@/features/skills/skills-store'
import { customPrompt, skillIcon, skillPrompt } from '@/features/skills/skills-data'
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

const SUGGESTIONS = ['Explain how this project is organised', 'Find and fix a bug', 'Add a feature']
const MAX_ATTACHMENTS = 10

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
                  if (msg.feedback !== 'down') toast('Thanks for the feedback')
                  rate(msg.id, 'down')
                }}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </IconAction>
            </>
          )}
          {isLast && (
            <IconAction label="Try again" disabled={running} onClick={() => retry(msg.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </IconAction>
          )}
          {meta && (
            <span className="ml-1.5 flex items-center gap-1.5">
              <Asterisk className="h-3 w-3" />
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
    clear,
    compact,
    model,
    setModel,
    autoAccept,
    setAutoAccept
  } = useChatContext()
  const [input, setInput] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [pickIndex, setPickIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const photoPicker = useRef<HTMLInputElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const nextCaret = useRef<number | null>(null)
  const voiceBase = useRef('')

  const { spendMessage, account } = useAuth()
  const { settings } = useSettings()
  const ws = useWorkspace()
  const group = ws.groups.find((g) => g.id === ws.active.projectId)
  const folder = group?.name ?? account?.project?.name ?? ''
  const projectPath = account?.project?.path
  const files = useWorkspaceFiles(projectPath ?? '')

  const slashOpen = input.startsWith('/') && !/\s/.test(input) && !dismissed
  const skills = useSkills()
  const { openTab } = useRightPanel()
  const commands = useMemo(
    () => buildCommands(skills.active, skills.commands),
    [skills.active, skills.commands]
  )
  const slashList = slashOpen ? filterCommands(commands, input.slice(1)) : []

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

  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  // put the cursor where an inserted file name ends
  useLayoutEffect(() => {
    if (nextCaret.current === null) return
    field.current?.setSelectionRange(nextCaret.current, nextCaret.current)
    setCaret(nextCaret.current)
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
      if (l.length + fresh.length > MAX_ATTACHMENTS) toast(`You can attach up to ${MAX_ATTACHMENTS} items`)
      return [...l, ...fresh].slice(0, MAX_ATTACHMENTS)
    })
  }

  const { listening, toggle: toggleVoice, stop: stopVoice } = useDictation((spoken) =>
    setInput(voiceBase.current ? `${voiceBase.current} ${spoken}` : spoken)
  )

  const submit = (raw: string): void => {
    let text = raw
    const parsed = parseSlash(commands, raw)
    if (parsed) {
      const { command: c, args } = parsed
      if (c.kind === 'skill') text = skillPrompt(c.skill, args)
      else if (c.kind === 'custom') text = customPrompt(c.command, args)
      else if (c.kind === 'prompt') text = args ? `${c.prompt}\n\n${args}` : c.prompt
      else {
        runCommand(c)
        return
      }
    }
    const q = text.trim() || (images.length || attachments.length ? ATTACH_ONLY[0] : '')
    if (!q || running) return
    stopVoice()
    if (!spendMessage()) return // out of messages for today: the plan dialog opens instead
    send(q, images, model, autoAccept, attachments)
    setInput('')
    setImages([])
    setAttachments([])
    setAtBottom(true)
  }

  /** /init: open the project notes (AGENTS.md) in the Docs tab, creating a starter file if needed. */
  const openNotes = async (): Promise<void> => {
    if (!window.api?.docs) {
      submit(
        'Explore this repository and write a concise AGENTS.md describing structure, commands and conventions.'
      )
      return
    }
    const found = await window.api.docs.read(NOTES_FILE)
    if (!found.ok) {
      const made = await window.api.docs.write(NOTES_FILE, NOTES_STARTER)
      if (!made.ok) {
        toast.error(made.error)
        return
      }
      toast('Created project notes')
    }
    openTab('docs')
    requestOpenDoc(NOTES_FILE, true)
  }

  const runCommand = (c: SlashCommand): void => {
    setInput('')
    setPickIndex(0)
    if (c.kind === 'panel') setPanel(c.panel)
    else if (c.kind === 'prompt') submit(c.prompt)
    else if (c.kind === 'skill') submit(skillPrompt(c.skill, ''))
    else if (c.kind === 'custom') submit(customPrompt(c.command, ''))
    else if (c.action === 'notes') void openNotes()
    else if (c.action === 'clear') clear()
    else if (c.action === 'compact') compact()
    else {
      setAutoAccept((v) => !v)
      toast(autoAccept ? 'Auto-accept off' : 'Auto-accept on')
    }
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
      setInput((e as CustomEvent<string>).detail)
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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
          if (e.key === 'Tab') setInput(`/${slashList[pickIndex].id} `)
          else runCommand(slashList[pickIndex])
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
      }
    }
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
      {empty && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1.2px)] [background-size:22px_22px] [-webkit-mask-image:radial-gradient(ellipse_75%_65%_at_50%_48%,#000_20%,transparent_100%)] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_48%,#000_20%,transparent_100%)]"
        />
      )}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
        }}
        className={cn(empty ? 'flex-none px-3 md:px-4' : 'flex-1 overflow-y-auto px-3 py-3 md:px-4')}
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
                  toast('Rewound to before that message')
                }}
              />
            ) : m.role === 'system' ? (
              <div key={m.id} className="text-center text-[11.5px] text-muted-foreground">
                {m.text}
              </div>
            ) : (
              <AgentMessage key={m.id} msg={m} isLast={i === messages.length - 1} />
            )
          )}
        </div>
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          aria-label="Scroll to latest"
          onClick={() => scrollToEnd()}
          className="absolute bottom-40 left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-white/[0.12] bg-[#2b2b2a] text-muted-foreground shadow-md transition-colors hover:text-foreground"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      <div className="shrink-0 px-3 pb-1 pt-1">
        <div className="relative mx-auto w-full max-w-[46rem]">
          {slashOpen && (
            <SlashMenu
              commands={slashList}
              index={pickIndex}
              query={input.slice(1)}
              onHover={setPickIndex}
              onPick={runCommand}
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

          {totals.files > 0 && (
            <ChangesBar
              files={totals.files}
              added={totals.added}
              removed={totals.removed}
              onAccept={() => {
                acceptAll()
                toast('Changes kept')
              }}
              onDiscard={() => {
                discardAll()
                toast('Changes undone')
              }}
            />
          )}

          <div
            ref={card}
            data-tour="composer"
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => {
              if (!card.current?.contains(e.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setDragging(false)
              const dropped = readDrop(e.dataTransfer)
              void addFiles(dropped.images)
              addAttachments(dropped.attachments)
            }}
            className={cn(
              'relative rounded-3xl border bg-background p-3 shadow-sm transition-colors focus-within:border-primary/50',
              dragging && 'border-primary/60'
            )}
          >
            {dragging && (
              <div className="pointer-events-none absolute inset-1 z-10 grid place-items-center rounded-[20px] border border-dashed border-white/[0.25] bg-background/90 text-[12.5px] text-[#d6d6d3]">
                Drop images, files or folders to attach
              </div>
            )}

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

            <textarea
              ref={field}
              onPaste={(e) => {
                const pasted = [...e.clipboardData.files]
                if (pasted.length) {
                  e.preventDefault()
                  void addFiles(pasted)
                }
              }}
              aria-label="Ask AI anything"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setCaret(e.target.selectionStart)
                setPickIndex(0)
                setDismissed(false)
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              placeholder={listening ? 'Listening…' : 'Ask AI anything'}
              className="block max-h-40 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />

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
                      else toast('Available in the desktop app')
                    }
                  },
                  {
                    id: 'copy-path',
                    label: 'Copy project path',
                    disabled: !projectPath,
                    onClick: () => {
                      if (projectPath) {
                        void navigator.clipboard.writeText(projectPath).then(() => toast('Path copied'))
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
              contentClassName="min-w-[230px]"
              items={MODELS.map((m) => ({
                id: m.id,
                label: m.name,
                description: m.description,
                checked: m.id === model,
                onClick: () => setModel(m.id)
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
            {SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setInput(t)
                  field.current?.focus()
                }}
                className="cursor-pointer rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11.5px] text-[#a8a8a6] transition-colors hover:border-white/[0.2] hover:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#77776f]">Type @ to mention a file, or / for commands.</p>
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
