import React, { useEffect, useRef, useState } from 'react'
import { Bot, Columns2, Eraser, Square, SquareTerminal } from '@/components/icons'
import { IconButton } from '@/components/layout/icon-button'
import { useChatInsights } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { platform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { Ansi } from '../terminal/ansi'
import { exampleCommand, promptGlyph, promptPath } from '../terminal/prompt'
import {
  clearTerminal,
  ensureStarted,
  runCommand,
  stopCommand,
  terminalAvailable,
  useTerminalSession
} from '../terminal/terminal-store'
import { useRightPanel } from '../store'
import type { TabContentProps } from '../types'
import { Chip, TabButton, TabEmpty, TabToolbar } from './tab-kit'

/** The start of a line, the way this computer's shell writes it: `C:\\app>` on Windows, `~/app %` on a Mac, `~/app $` on Linux. */
function Prompt({ cwd, className }: { cwd: string | null; className?: string }): React.JSX.Element {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-baseline gap-1.5', className)}>
      <span className="min-w-0 truncate text-[#6ea8fe]" title={cwd ?? undefined}>
        {promptPath(cwd, platform)}
      </span>
      <span className="shrink-0 text-[#5fd17a]">{promptGlyph(platform)}</span>
    </span>
  )
}

function AiCommands(): React.JSX.Element {
  const { commands } = useChatInsights()
  if (!commands.length) {
    return (
      <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
        Checks and commands the AI runs for you will be listed here.
      </p>
    )
  }
  return (
    <div className="slim-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3 font-mono text-[12px] leading-5">
      {commands.map((c) => (
        <div key={c.id}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[#ececea]">
              <span className="text-[#5fd17a]">{promptGlyph(platform)}</span> {c.command}
            </span>
            <Chip tone={c.status === 'done' ? 'good' : c.status === 'error' ? 'bad' : 'warn'}>
              {c.status === 'done' ? 'Passed' : c.status === 'error' ? 'Failed' : 'Running'}
            </Chip>
          </div>
          {c.output && <pre className="mt-0.5 whitespace-pre-wrap text-[#a9a9a6]">{c.output}</pre>}
        </div>
      ))}
    </div>
  )
}

/** Run commands in your project folder. Output keeps streaming while you look at other tabs. */
export function TerminalTab({ tabId }: TabContentProps): React.JSX.Element {
  const session = useTerminalSession(tabId)
  const { splitTab } = useRightPanel()
  const ws = useWorkspace()
  const project = ws.groups.find((group) => group.id === ws.active.projectId)
  const [view, setView] = useState<'shell' | 'ai'>('shell')
  const [input, setInput] = useState('')
  const [cursor, setCursor] = useState<number | null>(null) // position while walking through history
  const field = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const available = terminalAvailable()

  useEffect(() => {
    // Follows the open project: opening another project moves the terminal to its folder.
    void ensureStarted(tabId, project?.folder ?? null)
  }, [tabId, project?.folder])

  // stay pinned to the newest output
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session.entries, view])

  useEffect(() => {
    if (view === 'shell') field.current?.focus()
  }, [view])

  if (!available) {
    return (
      <TabEmpty icon={SquareTerminal} title="Terminal needs the desktop app">
        This preview runs in a browser, which cannot start commands on your computer. Open MoreCode as a desktop app to use the terminal.
      </TabEmpty>
    )
  }

  const submit = (): void => {
    const text = input
    setInput('')
    setCursor(null)
    void runCommand(tabId, text)
  }

  const walk = (dir: -1 | 1): void => {
    const h = session.history
    if (!h.length) return
    const at = cursor ?? h.length
    const next = Math.min(h.length, Math.max(0, at + dir))
    setCursor(next === h.length ? null : next)
    setInput(next === h.length ? '' : h[next])
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1f1f1e]">
      <TabToolbar className="py-1">
        <div className="flex items-center gap-0.5">
          {(
            [
              ['shell', 'Shell'],
              ['ai', 'AI commands']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] transition-colors',
                view === id ? 'bg-white/[0.09] text-[#ececea]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {id === 'ai' && <Bot className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {view === 'shell' && (
          <>
            {session.running && (
              <TabButton onClick={() => stopCommand(tabId)} className="h-6 text-[11.5px]">
                <Square className="h-2.5 w-2.5 fill-current" /> Stop
              </TabButton>
            )}
            <IconButton title="Open another terminal beside this one" onClick={() => splitTab('terminal')}>
              <Columns2 className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Clear" onClick={() => clearTerminal(tabId)}>
              <Eraser className="h-3.5 w-3.5" />
            </IconButton>
          </>
        )}
      </TabToolbar>

      {view === 'ai' ? (
        <AiCommands />
      ) : (
        <div
          ref={scroller}
          onMouseUp={() => {
            // clicking in the empty area focuses the prompt, but never steals a text selection
            if (!window.getSelection()?.toString()) field.current?.focus()
          }}
          className="slim-scroll min-h-0 flex-1 cursor-text select-text overflow-y-auto p-3 font-mono text-[12px] leading-5"
        >
          {session.entries.length === 0 && (
            <p className="mb-2 font-sans text-[12px] text-muted-foreground">
              Type a command and press Enter. Try <span className="font-mono text-[#d6d6d3]">{exampleCommand(platform)}</span>{' '}
              or <span className="font-mono text-[#d6d6d3]">npm run lint</span>.
            </p>
          )}
          {session.entries.map((e) =>
            e.kind === 'cmd' ? (
              <div key={e.id} className="mt-1.5 break-all text-[#ececea]">
                <Prompt cwd={e.cwd ?? null} /> {e.text}
              </div>
            ) : e.failed ? (
              <div key={e.id} className="flex items-center gap-2 font-sans text-[12px] italic text-muted-foreground">
                {e.text}
              </div>
            ) : (
              <pre
                key={e.id}
                className={cn(
                  'whitespace-pre-wrap break-words font-mono',
                  e.kind === 'err' ? 'text-[#f0a09a]' : e.kind === 'info' ? 'italic text-muted-foreground' : 'text-[#c9c9c6]'
                )}
              >
                <Ansi text={e.text} />
              </pre>
            )
          )}

          <div className="mt-1.5 flex items-center gap-2">
            <Prompt cwd={session.cwd} className="max-w-[60%] shrink-0" />
            <input
              ref={field}
              value={input}
              disabled={Boolean(session.running)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Terminal input"
              placeholder={session.running ? 'Running… press Ctrl+C to stop' : ''}
              onChange={(e) => {
                setInput(e.target.value)
                setCursor(null)
              }}
              onKeyDown={(e) => {
                const ctrl = e.ctrlKey && !e.metaKey
                if (e.key === 'Enter') {
                  submit()
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  walk(e.key === 'ArrowUp' ? -1 : 1)
                } else if (ctrl && e.key.toLowerCase() === 'l') {
                  e.preventDefault()
                  clearTerminal(tabId)
                } else if (ctrl && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
                  e.preventDefault()
                  if (session.running) stopCommand(tabId)
                  else setInput('')
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[#ececea] caret-[#ececea] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
          </div>
        </div>
      )}
    </div>
  )
}
