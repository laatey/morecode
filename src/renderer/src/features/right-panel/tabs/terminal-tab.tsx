import React, { useEffect, useRef, useState } from 'react'
import { Columns2, Eraser, Square, SquareTerminal } from '@/components/icons'
import { IconButton } from '@/components/layout/icon-button'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { platform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { Ansi } from '../terminal/ansi'
import { exampleCommand, promptGlyph, promptPath } from '../terminal/prompt'
import {
  clearTerminal,
  ensureStarted,
  runCommand,
  sendTerminalInput,
  stopCommand,
  terminalAvailable,
  useTerminalSession
} from '../terminal/terminal-store'
import { useRightPanel } from '../store'
import type { TabContentProps } from '../types'
import { TabButton, TabEmpty, TabToolbar } from './tab-kit'

/** The start of a line, the way this computer's shell writes it. A long path wraps onto the next line instead of being cut off. */
function Prompt({ cwd, className }: { cwd: string | null; className?: string }): React.JSX.Element {
  return (
    <span className={cn('break-all', className)}>
      <span className="text-link">{promptPath(cwd, platform)}</span>{' '}
      <span className="text-success">{promptGlyph(platform)}</span>
    </span>
  )
}

/** Every command typed in this terminal, newest first. Picking one puts it back at the prompt to edit or run again. */
function History({ commands, onPick }: { commands: string[]; onPick: (command: string) => void }): React.JSX.Element {
  const unique = [...new Set([...commands].reverse())]
  if (!unique.length) {
    return (
      <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        Commands you run in this terminal will be listed here.
      </p>
    )
  }
  return (
    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto py-1.5">
      <p className="px-3 pb-1.5 pt-1 text-[11.5px] text-muted-foreground">Click a command to bring it back to the prompt.</p>
      <ul>
        {unique.map((command) => (
          <li key={command}>
            <button
              type="button"
              onClick={() => onPick(command)}
              title="Edit and run again"
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-1.5 text-left font-mono text-[12px] leading-5 text-soft-foreground transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
            >
              <span className="shrink-0 text-success">{promptGlyph(platform)}</span>
              <span className="min-w-0 flex-1 break-all">{command}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Run commands in your project folder. Output keeps streaming while you look at other tabs. */
export function TerminalTab({ tabId }: TabContentProps): React.JSX.Element {
  const session = useTerminalSession(tabId)
  const { splitTab } = useRightPanel()
  const ws = useWorkspace()
  const project = ws.groups.find((group) => group.id === ws.active.projectId)
  const [view, setView] = useState<'shell' | 'history'>('shell')
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
    if (session.running) {
      sendTerminalInput(tabId, text)
      return
    }
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
    <div className="flex h-full min-h-0 flex-col bg-inset">
      <TabToolbar className="py-1">
        <div className="flex items-center gap-0.5">
          {(
            [
              ['shell', 'Shell'],
              ['history', 'History']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] transition-colors',
                view === id ? 'bg-foreground/[0.09] text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
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

      {view === 'history' ? (
        <History
          commands={session.history}
          onPick={(command) => {
            setInput(command)
            setCursor(null)
            setView('shell')
          }}
        />
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
            <div className="mb-3 font-sans text-[12px] leading-relaxed text-muted-foreground">
              <p>
                Type a command and press Enter. Try <span className="font-mono text-soft-foreground">{exampleCommand(platform)}</span>{' '}
                or <span className="font-mono text-soft-foreground">npm run lint</span>.
              </p>
              <p className="mt-1 text-[11.5px] text-faint-foreground">Up and Down browse earlier commands · Ctrl+L clears · Ctrl+C stops</p>
            </div>
          )}
          {session.entries.map((e) =>
            e.kind === 'cmd' ? (
              <div key={e.id} className="mt-3 break-all text-foreground first:mt-0">
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
                  e.kind === 'err' ? 'text-destructive' : e.kind === 'info' ? 'italic text-muted-foreground' : 'text-soft-foreground'
                )}
              >
                <Ansi text={e.text} />
              </pre>
            )
          )}

          <div className="mt-3">
            {!session.running && (
              <div className="break-all text-link" title={session.cwd ?? undefined}>
                {promptPath(session.cwd, platform)}
              </div>
            )}
            <div className="flex items-center gap-2">
              {!session.running && <span className="shrink-0 text-success">{promptGlyph(platform)}</span>}
              <input
              ref={field}
              value={input}
              spellCheck={false}
              autoComplete="off"
              aria-label="Terminal input"
              placeholder={session.running ? 'Input for the running command (Ctrl+C stops it)' : ''}
              onChange={(e) => {
                setInput(e.target.value)
                setCursor(null)
              }}
              onKeyDown={(e) => {
                const ctrl = e.ctrlKey && !e.metaKey
                if (e.key === 'Enter') {
                  submit()
                } else if (!session.running && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
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
              className="min-w-0 flex-1 bg-transparent text-foreground caret-foreground outline-none placeholder:text-muted-foreground"
            />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
