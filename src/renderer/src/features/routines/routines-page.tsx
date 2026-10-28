import { ModalOverlay } from '@/components/modal-overlay'
import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Clock3,
  Pause,
  Play,
  Plus,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { ActionMenu, type ActionMenuItem } from '@/components/action-menu'
import { IconButton } from '@/components/layout/icon-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { useRoutines, type RoutineCadence } from './routines-store'

const field =
  'h-9 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 text-[13px] text-foreground outline-none placeholder:text-[#777773] focus:border-white/[0.28]'
const describe = (cadence: RoutineCadence, time: string, weekday: number): string => {
  if (cadence === 'hourly') return 'Every hour'
  if (cadence === 'daily') return `Every day at ${time}`
  return `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday]} at ${time}`
}
const date = (value?: number): string =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
    : 'Not run yet'

function MenuChoice({
  label,
  value,
  items,
  onChange
}: {
  label: string
  value: string
  items: { value: string; label: string }[]
  onChange: (value: string) => void
}): React.JSX.Element {
  const selected = items.find((item) => item.value === value)?.label ?? value
  const menuItems: ActionMenuItem[] = items.map((item) => ({
    id: item.value,
    label: item.label,
    checked: item.value === value,
    onClick: () => onChange(item.value)
  }))
  return (
    <label className="flex flex-col gap-1.5 text-[11px] text-[#a8a8a3]">
      {label}
      <ActionMenu
        align="start"
        contentClassName="max-h-[min(300px,50vh)] overflow-y-auto slim-scroll"
        items={menuItems}
        trigger={(open) => (
          <button
            type="button"
            aria-label={`${label}: ${selected}`}
            className="flex h-8 min-w-[126px] cursor-pointer items-center justify-between gap-3 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 text-[12px] text-[#e2e2df] hover:bg-white/[0.07]"
          >
            {selected}
            <ChevronDown
              className={`h-3.5 w-3.5 text-[#92928d] transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      />
    </label>
  )
}

function ClockPicker({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [hourText, minuteText] = value.split(':')
  const hour24 = Number(hourText) || 0
  const hour12 = ((hour24 + 11) % 12) + 1
  const period = hour24 < 12 ? 'AM' : 'PM'
  const setParts = (hour: number, minute: number, ampm: string): void => {
    const hourOfDay = (hour % 12) + (ampm === 'PM' ? 12 : 0)
    onChange(`${String(hourOfDay).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  const format = (raw: string): string => {
    const [h, m] = raw.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }
  const choice = (
    text: string,
    selected: boolean,
    onClick: () => void,
    label: string
  ): React.JSX.Element => (
    <button
      key={text}
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-7 cursor-pointer rounded-[5px] text-[11.5px] tabular-nums transition-colors ${selected ? 'bg-[#3568d4] text-white' : 'text-[#c9c9c5] hover:bg-white/[0.08] hover:text-white'}`}
    >
      {text}
    </button>
  )
  return (
    <label className="flex flex-col gap-1.5 text-[11px] text-[#a8a8a3]">
      Time
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 min-w-[126px] cursor-pointer items-center justify-between gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 text-[12px] text-[#e2e2df] hover:bg-white/[0.07]"
          >
            <span className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 text-[#92928d]" />
              {format(value)}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-[#92928d] transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={5}
          className="z-[60] w-[252px] rounded-lg border border-white/[0.12] bg-[#2b2b2a] p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#d2d2cf]">Choose a time</span>
            <span className="text-[12px] tabular-nums text-[#a9c8ff]">{format(value)}</span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_44px] gap-2">
            <div>
              <p className="mb-1 text-center text-[10px] text-[#777773]">HOUR</p>
              <div className="slim-scroll grid max-h-[176px] grid-cols-3 gap-1 overflow-y-auto">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) =>
                  choice(
                    String(h),
                    h === hour12,
                    () => setParts(h, Number(minuteText), period),
                    `${h} o'clock`
                  )
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-center text-[10px] text-[#777773]">MINUTE</p>
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) =>
                  choice(
                    String(m).padStart(2, '0'),
                    m === Number(minuteText),
                    () => setParts(hour12, m, period),
                    `${m} minutes`
                  )
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-center text-[10px] text-[#777773]">PERIOD</p>
              <div className="grid gap-1">
                {(['AM', 'PM'] as const).map((p) =>
                  choice(p, p === period, () => setParts(hour12, Number(minuteText), p), p)
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 h-7 w-full cursor-pointer rounded-md bg-white/[0.07] text-[11.5px] text-[#e2e2df] hover:bg-white/[0.12]"
          >
            Done
          </button>
        </PopoverContent>
      </Popover>
    </label>
  )
}

const stamp = (at: number): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at)

/**
 * Runs routines the way scheduled-task features usually work: every run gets its own new chat,
 * inside the project the routine belongs to and named after the routine and the time, so runs never
 * land in whichever chat happens to be open and each one can be opened and read later.
 * A run waits while the AI is busy and never interrupts it.
 */
export function RoutineScheduler(): null {
  const { routines, markRun } = useRoutines()
  const { ask, running, owner } = useChatContext()
  const { newChat, rename, activeId, groups } = useWorkspace()
  const [pending, setPending] = useState<{ chatId: string; text: string } | null>(null)
  const [queued, setQueued] = useState<string[]>([])

  const start = (id: string): void => {
    const r = routines.find((item) => item.id === id)
    if (!r) return
    const now = Date.now()
    const project = r.projectId && groups.some((g) => g.id === r.projectId) ? r.projectId : null
    const chatId = newChat(project)
    rename(chatId, `${r.title} · ${stamp(now)}`)
    markRun(r.id, now, chatId)
    setPending({ chatId, text: `Run this scheduled routine: ${r.title}\n\n${r.prompt}` })
    toast.success(`Routine started: ${r.title}`)
  }

  // due routines and "Run now" presses join one queue, handled one at a time
  useEffect(() => {
    const onRun = (event: Event): void => setQueued((q) => [...q, (event as CustomEvent<string>).detail])
    window.addEventListener('routine:run', onRun)
    return () => window.removeEventListener('routine:run', onRun)
  }, [])

  useEffect(() => {
    const check = (): void => {
      if (running || pending) return
      const id = queued[0] ?? routines.find((item) => item.enabled && item.nextRunAt <= Date.now())?.id
      if (!id) return
      setQueued((q) => q.filter((x) => x !== id))
      start(id)
    }
    check()
    const timer = window.setInterval(check, 15_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines, running, pending, queued])

  // send once the new chat is open and loaded
  useEffect(() => {
    if (!pending || running || activeId !== pending.chatId || owner !== pending.chatId) return
    ask(pending.text)
    setPending(null)
  }, [pending, running, activeId, owner, ask])

  return null
}

export function RoutinesPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { routines, add, toggle, remove } = useRoutines()
  const { running } = useChatContext()
  const { groups, chats, select, active } = useWorkspace()
  const [projectId, setProjectId] = useState<string>(active.projectId ?? '')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cadence, setCadence] = useState<RoutineCadence>('daily')
  const [time, setTime] = useState('09:00')
  const [weekday, setWeekday] = useState(1)

  const save = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!title.trim() || !prompt.trim()) return
    add({ title: title.trim(), prompt: prompt.trim(), cadence, time, weekday, projectId: projectId || null })
    setTitle('')
    setPrompt('')
    setCreating(false)
  }

  const runNow = (id: string): void => {
    if (running) {
      toast.error('Wait for the current response to finish before running a routine.')
      return
    }
    window.dispatchEvent(new CustomEvent('routine:run', { detail: id }))
    onBack() // the run opens in its own new chat
  }
  const projectName = (id?: string | null): string => groups.find((g) => g.id === id)?.name ?? 'No project'

  return (
    <main className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-3 md:px-10">
      <div className="mx-auto max-w-[760px]">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </button>
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[#82aaff]">
              <CalendarClock className="h-4 w-4" />
              <span className="text-[11px] font-medium uppercase tracking-[0.1em]">Automation</span>
            </div>
            <h1 className="font-display text-[24px] font-semibold text-[#ececea]">Routines</h1>
            <p className="mt-1.5 max-w-[560px] text-[13px] leading-5 text-muted-foreground">
              Have MoreCode repeat a task hourly, daily, or weekly. Routines run while the app is
              open and use the current project and chat.
            </p>
            <p className="mt-1 text-[11.5px] text-[#858580]">
              Commands still follow your normal approval settings, so a routine may pause for
              permission.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[#3568d4] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#4779e4]"
          >
            <Plus className="h-3.5 w-3.5" /> New routine
          </button>
        </header>

        <Dialog.Root open={creating} onOpenChange={setCreating}>
          <Dialog.Portal>
            <ModalOverlay tone="blurred" />
            <Dialog.Content
              aria-describedby="routine-create-description"
          className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[11px] border border-white/[0.12] bg-[#272726] shadow-[0_24px_80px_rgba(0,0,0,0.58)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <div className="border-b border-white/[0.08] px-4 pb-3 pt-4">
                <Dialog.Title className="text-[15px] font-semibold text-[#ececea]">
                  Create a routine
                </Dialog.Title>
                <Dialog.Description
                  id="routine-create-description"
                  className="mt-1 text-[12px] leading-5 text-muted-foreground"
                >
                  Choose what MoreCode should do and when it should run.
                </Dialog.Description>
              </div>
              <form
                onSubmit={save}
                className="slim-scroll max-h-[min(460px,calc(100vh-120px))] overflow-y-auto"
              >
                <div className="space-y-3.5 px-4 py-3.5">
                  <label className="flex flex-col gap-1.5 text-[12px] text-[#c3c3bf]">
                    Name
                    <input
                      autoFocus
                      className={field}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Check project health"
                      maxLength={80}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[12px] text-[#c3c3bf]">
                    Instructions
                    <textarea
                      className="min-h-[88px] resize-y rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-[#777773] focus:border-white/[0.28]"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Check the latest changes, run the relevant tests, and summarize anything that needs attention."
                    />
                  </label>
                  <MenuChoice
                    label="Runs in"
                    value={groups.some((g) => g.id === projectId) ? projectId : ''}
                    items={[{ value: '', label: 'No project (loose chat)' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                    onChange={setProjectId}
                  />
                  <div className="flex flex-wrap items-end gap-3">
                    <MenuChoice
                      label="Repeat"
                      value={cadence}
                      items={[
                        { value: 'hourly', label: 'Every hour' },
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' }
                      ]}
                      onChange={(value) => setCadence(value as RoutineCadence)}
                    />
                    {cadence !== 'hourly' && <ClockPicker value={time} onChange={setTime} />}
                    {cadence === 'weekly' && (
                      <MenuChoice
                        label="Day"
                        value={String(weekday)}
                        items={[
                          'Sunday',
                          'Monday',
                          'Tuesday',
                          'Wednesday',
                          'Thursday',
                          'Friday',
                          'Saturday'
                        ].map((day, index) => ({ value: String(index), label: day }))}
                        onChange={(value) => setWeekday(Number(value))}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!title.trim() || !prompt.trim()}
                    className="h-8 cursor-pointer rounded-md bg-[#3568d4] px-3 text-[12px] font-medium text-white hover:bg-[#4779e4] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save routine
                  </button>
                </div>
              </form>
              <Dialog.Close
                aria-label="Close"
                className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
              >
                <span aria-hidden>×</span>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-2">
          <h2 className="text-[12px] font-medium text-[#cfcfcb]">Your routines</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">{routines.length}</span>
        </div>

        {routines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.14] px-5 py-12 text-center">
            <Clock3 className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
            <p className="text-[13px] text-[#d6d6d3]">No routines yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Create one to have MoreCode repeat a task on a schedule.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {routines.map((routine) => (
              <li
                key={routine.id}
                className="rounded-lg border border-white/[0.1] bg-[#20201f] p-4 transition-colors hover:border-white/[0.16]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[13.5px] font-medium text-[#e3e3e0]">
                        {routine.title}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] ${routine.enabled ? 'bg-[#254e36] text-[#a6e4b5]' : 'bg-white/[0.07] text-muted-foreground'}`}
                      >
                        {routine.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#b7b7b2]">
                      <CalendarClock className="h-3.5 w-3.5 text-[#82aaff]" />{' '}
                      {describe(routine.cadence, routine.time, routine.weekday)} · {projectName(routine.projectId)}
                    </p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-muted-foreground">
                      {routine.prompt}
                    </p>
                    <p className="mt-3 text-[11px] text-[#858580]">
                      Last started: {date(routine.lastRunAt)}
                      {routine.lastChatId && chats.some((c) => c.id === routine.lastChatId) && (
                        <button
                          type="button"
                          onClick={() => {
                            select(routine.lastChatId!)
                            onBack()
                          }}
                          className="ml-2 cursor-pointer text-[#82aaff] hover:underline"
                        >
                          Open that chat
                        </button>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#858580]">
                      Next run: {routine.enabled ? date(routine.nextRunAt) : 'Paused'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 border-l border-white/[0.08] pl-2">
                    <IconButton
                      title="Run now"
                      disabled={running}
                      onClick={() => runNow(routine.id)}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      title={routine.enabled ? 'Pause routine' : 'Resume routine'}
                      onClick={() => toggle(routine.id)}
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton title="Delete routine" onClick={() => remove(routine.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
