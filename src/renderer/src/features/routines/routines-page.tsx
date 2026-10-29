import { ModalOverlay } from '@/components/modal-overlay'
import React, { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ChevronDown, Clock3, MoreHorizontal, Plus } from '@/components/icons'
import { toast } from 'sonner'
import { ActionMenu, type ActionMenuItem } from '@/components/action-menu'
import { Btn, Segmented, Toggle } from '@/features/settings/kit'
import { useNotify } from '@/features/settings/notifications'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { useRoutines, type Routine, type RoutineCadence } from './routines-store'

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

const PRIMARY =
  'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-[#5b9bff]/60 bg-[#2563eb] px-3 text-[12.5px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-colors hover:bg-[#2f6fe0] disabled:cursor-not-allowed disabled:opacity-40'

/** Ideas to start from, for people who are not sure what a routine is good for. */
const IDEAS: { title: string; prompt: string; cadence: RoutineCadence; time: string; hint: string }[] = [
  {
    title: 'Morning check-in',
    hint: 'What changed since yesterday',
    prompt: 'Look at what changed in this project since yesterday and give me a short summary of what needs my attention today.',
    cadence: 'daily',
    time: '09:00'
  },
  {
    title: 'Run the tests',
    hint: 'Catch breakage early',
    prompt: 'Run the project’s tests. If anything fails, tell me which test and the most likely cause. Do not change any files.',
    cadence: 'daily',
    time: '08:00'
  },
  {
    title: 'Weekly cleanup review',
    hint: 'Dead code and to-dos',
    prompt: 'Look for unused files, leftover TODO comments and anything that looks out of date. List what you find, most important first. Do not change any files.',
    cadence: 'weekly',
    time: '10:00'
  },
  {
    title: 'Check dependencies',
    hint: 'Outdated or risky packages',
    prompt: 'Check the project’s dependencies for ones that are badly out of date or have known security problems, and tell me what is worth updating. Do not change any files.',
    cadence: 'weekly',
    time: '09:00'
  }
]

/**
 * Runs routines. Every run gets its own new chat, inside the routine's project, named after the routine
 * and the time. A routine never grabs the screen by surprise: when one is due the person gets a
 * notification with a Run button and starts it when ready. Routines marked "Start by itself" open their
 * chat on their own. A run never interrupts a response that is still being written.
 */
export function RoutineScheduler(): null {
  const { routines, markRun } = useRoutines()
  const { ask, running, owner } = useChatContext()
  const { newChat, rename, activeId, groups } = useWorkspace()
  const notify = useNotify()
  const [pending, setPending] = useState<{ chatId: string; text: string } | null>(null)
  const [queued, setQueued] = useState<string[]>([])
  const told = useRef(new Set<string>())

  const start = (id: string): void => {
    const r = routines.find((item) => item.id === id)
    if (!r) return
    const now = Date.now()
    const project = r.projectId && groups.some((g) => g.id === r.projectId) ? r.projectId : null
    const chatId = newChat(project)
    rename(chatId, `${r.title} · ${stamp(now)}`)
    markRun(r.id, now, chatId)
    setPending({ chatId, text: r.prompt })
  }

  // "Run now" and the Run button on a notification join one queue, handled one at a time
  useEffect(() => {
    const onRun = (event: Event): void => setQueued((q) => [...q, (event as CustomEvent<string>).detail])
    window.addEventListener('routine:run', onRun)
    return () => window.removeEventListener('routine:run', onRun)
  }, [])

  useEffect(() => {
    const check = (): void => {
      if (running || pending) return
      const queuedId = queued[0]
      if (queuedId) {
        setQueued((q) => q.filter((x) => x !== queuedId))
        start(queuedId)
        return
      }
      for (const r of routines) {
        if (!r.enabled || r.nextRunAt > Date.now()) continue
        if (r.auto) return start(r.id)
        const key = `${r.id}:${r.nextRunAt}`
        if (told.current.has(key)) continue
        told.current.add(key)
        notify('finished', `Routine ready: ${r.title}`, 'Open Routines to run it, or run it from here.')
        toast(`Routine ready: ${r.title}`, {
          duration: 60_000,
          action: { label: 'Run', onClick: () => window.dispatchEvent(new CustomEvent('routine:run', { detail: r.id })) }
        })
      }
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

interface Draft {
  title: string
  prompt: string
  cadence: RoutineCadence
  time: string
  weekday: number
  projectId: string
  auto: boolean
}
const BLANK: Draft = { title: '', prompt: '', cadence: 'daily', time: '09:00', weekday: 1, projectId: '', auto: false }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function RoutinesPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { routines, add, update, toggle, remove } = useRoutines()
  const { running } = useChatContext()
  const { groups, chats, select, active } = useWorkspace()
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const openNew = (preset?: Partial<Draft>): void =>
    setEditing({ id: null, draft: { ...BLANK, projectId: active.projectId ?? '', ...preset } })
  const openEdit = (r: Routine): void =>
    setEditing({
      id: r.id,
      draft: { title: r.title, prompt: r.prompt, cadence: r.cadence, time: r.time, weekday: r.weekday, projectId: r.projectId ?? '', auto: Boolean(r.auto) }
    })
  const set = (patch: Partial<Draft>): void => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))

  const save = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!editing) return
    const d = editing.draft
    if (!d.title.trim() || !d.prompt.trim()) return
    const values = { title: d.title.trim(), prompt: d.prompt.trim(), cadence: d.cadence, time: d.time, weekday: d.weekday, projectId: d.projectId || null, auto: d.auto }
    if (editing.id) update(editing.id, values)
    else add(values)
    setEditing(null)
  }

  const runNow = (id: string): void => {
    if (running) {
      toast.error('Wait for the current response to finish before running a routine.')
      return
    }
    // the run opens in its own new chat, so the person lands in it (they pressed Run)
    window.dispatchEvent(new CustomEvent('routine:run', { detail: id }))
    onBack()
  }
  const projectName = (id?: string | null): string => groups.find((g) => g.id === id)?.name ?? 'No project'
  const when = (r: Routine): string => describe(r.cadence, r.time, r.weekday)
  const draft = editing?.draft

  return (
    <main className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3 md:px-10">
      <div className="mx-auto max-w-[720px]">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </button>

        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[24px] font-semibold text-[#ececea]">Routines</h1>
            <p className="mt-1.5 max-w-[520px] text-[13px] leading-5 text-muted-foreground">
              Give MoreCode a task to repeat on a schedule. Each run gets its own chat in your list, so nothing
              lands in the chat you are working in.
            </p>
          </div>
          <button type="button" onClick={() => openNew()} className={PRIMARY}>
            <Plus className="h-3.5 w-3.5" /> New routine
          </button>
        </header>

        {routines.length === 0 ? (
          <section>
            <h2 className="mb-2 text-[12px] font-medium text-[#cfcfcb]">Start from an idea</h2>
            <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-[10px] border border-white/[0.1]">
              {IDEAS.map((idea) => (
                <li key={idea.title} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#ececea]">{idea.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {idea.hint} · {describe(idea.cadence, idea.time, 1)}
                    </div>
                  </div>
                  <Btn onClick={() => openNew({ title: idea.title, prompt: idea.prompt, cadence: idea.cadence, time: idea.time })}>Use this</Btn>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Routines run while MoreCode is open. Commands still follow your approval settings, so a run may pause to ask.
            </p>
          </section>
        ) : (
          <section>
            <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-[10px] border border-white/[0.1]">
              {routines.map((r) => {
                const due = r.enabled && r.nextRunAt <= now
                const lastChat = r.lastChatId && chats.some((c) => c.id === r.lastChatId) ? r.lastChatId : null
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Toggle checked={r.enabled} onChange={() => toggle(r.id)} label={`${r.enabled ? 'Pause' : 'Resume'} ${r.title}`} />
                    <div className={`min-w-0 flex-1 ${r.enabled ? '' : 'opacity-60'}`}>
                      <div className="truncate text-[13px] font-medium text-[#ececea]">{r.title}</div>
                      <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {when(r)} · {projectName(r.projectId)}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#858580]">
                        {due ? (
                          <span className="text-[#7db0ff]">Ready to run</span>
                        ) : r.enabled ? (
                          `Next ${date(r.nextRunAt)}`
                        ) : (
                          'Paused'
                        )}
                        {r.lastRunAt ? ` · Last ${date(r.lastRunAt)}` : ''}
                        {lastChat && (
                          <button
                            type="button"
                            onClick={() => {
                              select(lastChat)
                              onBack()
                            }}
                            className="ml-2 cursor-pointer text-[#7db0ff] hover:underline"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </div>
                    {due ? (
                      <button type="button" disabled={running} onClick={() => runNow(r.id)} className={PRIMARY}>
                        Run
                      </button>
                    ) : (
                      <Btn disabled={running} onClick={() => runNow(r.id)}>
                        Run now
                      </Btn>
                    )}
                    <ActionMenu
                      align="end"
                      items={[
                        { id: 'edit', label: 'Edit', onClick: () => openEdit(r) },
                        { id: 'delete', label: 'Delete', danger: true, separatorBefore: true, onClick: () => remove(r.id) }
                      ]}
                      trigger={
                        <button
                          type="button"
                          aria-label={`More for ${r.title}`}
                          className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/[0.07] hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      }
                    />
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Routines run while MoreCode is open. When one is due you get a notification with a Run button, unless
              it is set to start by itself.
            </p>
          </section>
        )}

        <Dialog.Root open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
          <Dialog.Portal>
            <ModalOverlay tone="blurred" />
            <Dialog.Content
              aria-describedby="routine-create-description"
              className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[11px] border border-white/[0.12] bg-[#272726] shadow-[0_24px_80px_rgba(0,0,0,0.58)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <div className="border-b border-white/[0.08] px-4 pb-3 pt-4">
                <Dialog.Title className="text-[15px] font-semibold text-[#ececea]">
                  {editing?.id ? 'Edit routine' : 'New routine'}
                </Dialog.Title>
                <Dialog.Description id="routine-create-description" className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Say what MoreCode should do and when.
                </Dialog.Description>
              </div>
              {draft && (
                <form onSubmit={save} className="slim-scroll max-h-[min(520px,calc(100vh-120px))] overflow-y-auto">
                  <div className="space-y-3.5 px-4 py-3.5">
                    <label className="flex flex-col gap-1.5 text-[12px] text-[#c3c3bf]">
                      Name
                      <input
                        autoFocus
                        className={field}
                        value={draft.title}
                        onChange={(event) => set({ title: event.target.value })}
                        placeholder="Morning check-in"
                        maxLength={80}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-[12px] text-[#c3c3bf]">
                      What should it do?
                      <textarea
                        className="min-h-[88px] resize-y rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-[#777773] focus:border-white/[0.28]"
                        value={draft.prompt}
                        onChange={(event) => set({ prompt: event.target.value })}
                        placeholder="Look at what changed since yesterday and tell me what needs attention."
                      />
                    </label>
                    <MenuChoice
                      label="Where it runs"
                      value={groups.some((g) => g.id === draft.projectId) ? draft.projectId : ''}
                      items={[{ value: '', label: 'No project' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                      onChange={(projectId) => set({ projectId })}
                    />
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5 text-[11px] text-[#a8a8a3]">
                        Repeat
                        <Segmented
                          label="Repeat"
                          value={draft.cadence}
                          onChange={(cadence) => set({ cadence })}
                          options={[
                            { value: 'hourly', label: 'Hourly' },
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' }
                          ]}
                        />
                      </div>
                      {draft.cadence !== 'hourly' && <ClockPicker value={draft.time} onChange={(time) => set({ time })} />}
                      {draft.cadence === 'weekly' && (
                        <MenuChoice
                          label="Day"
                          value={String(draft.weekday)}
                          items={DAYS.map((day, index) => ({ value: String(index), label: day }))}
                          onChange={(value) => set({ weekday: Number(value) })}
                        />
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-4 border-t border-white/[0.07] pt-3.5">
                      <div>
                        <div className="text-[12.5px] font-medium text-[#f1f1ef]">Start by itself</div>
                        <div className="mt-0.5 text-[11.5px] leading-relaxed text-[#92928e]">
                          Off: you get a notification and press Run. On: it opens a new chat and runs when it is due, even if you are in another chat.
                        </div>
                      </div>
                      <Toggle checked={draft.auto} onChange={(auto) => set({ auto })} label="Start by itself" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
                    <Btn onClick={() => setEditing(null)}>Cancel</Btn>
                    <button type="submit" disabled={!draft.title.trim() || !draft.prompt.trim()} className={PRIMARY}>
                      {editing?.id ? 'Save' : 'Create routine'}
                    </button>
                  </div>
                </form>
              )}
              <Dialog.Close
                aria-label="Close"
                className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
              >
                <span aria-hidden>×</span>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </main>
  )
}
