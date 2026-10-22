import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, FileText, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, TextInput, Toggle } from '@/features/settings/kit'
import { useSkills } from '@/features/skills/skills-store'
import {
  CATEGORIES,
  ICONS,
  nameProblem,
  skillIcon,
  slugify,
  type CustomCommand,
  type Skill
} from '@/features/skills/skills-data'
import { cn } from '@/lib/utils'
import { MiniTabs, PanelFrame } from './ui'

type Tab = 'discover' | 'mine' | 'commands'
type View =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string | null }
  | { name: 'command'; id: string | null }

/** Puts a message in the composer so the person can adjust it before sending. */
const prefill = (text: string): void => {
  window.dispatchEvent(new CustomEvent('assistant:prefill', { detail: text }))
}

function Tile({ icon }: { icon: string }): React.JSX.Element {
  const Icon = skillIcon(icon)
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-white/[0.06] text-[#b4b4b1]">
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

const label = 'mb-1 block text-[12px] text-[#a8a8a6]'
const area =
  'slim-scroll w-full resize-none rounded-[5px] border border-white/[0.09] bg-[#222220] px-2 py-1.5 text-[12px] leading-[18px] text-[#ededeb] outline-none transition-colors placeholder:text-[#737370] focus:border-white/[0.22]'

/** Skills library, the person's own skills, and their own / commands. */
export function SkillsPanel({
  initialTab,
  onClose
}: {
  initialTab: Tab
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [view, setView] = useState<View>({ name: 'list' })
  const back = (): void => setView({ name: 'list' })

  const title =
    view.name === 'detail'
      ? 'Skill'
      : view.name === 'edit'
        ? view.id
          ? 'Edit skill'
          : 'New skill'
        : view.name === 'command'
          ? view.id
            ? 'Edit command'
            : 'New command'
          : tab === 'commands'
            ? 'Your commands'
            : 'Skills'

  return (
    <PanelFrame title={title} onClose={onClose} width={400}>
      {view.name === 'list' && (
        <ListView tab={tab} setTab={setTab} setView={setView} onClose={onClose} />
      )}
      {view.name === 'detail' && <DetailView id={view.id} setView={setView} onBack={back} onClose={onClose} />}
      {view.name === 'edit' && (
        <SkillEditor id={view.id} onBack={back} onSaved={(id) => setView({ name: 'detail', id })} onClose={onClose} />
      )}
      {view.name === 'command' && <CommandEditor id={view.id} onBack={back} />}
    </PanelFrame>
  )
}

function ListView({
  tab,
  setTab,
  setView,
  onClose
}: {
  tab: Tab
  setTab: (t: Tab) => void
  setView: (v: View) => void
  onClose: () => void
}): React.JSX.Element {
  const sk = useSkills()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (s: Skill): boolean =>
    !q || `${s.name} ${s.id} ${s.description} ${s.category}`.toLowerCase().includes(q)

  const discover = sk.all.filter((s) => s.source === 'catalog' && match(s))
  const mine = sk.all.filter((s) => sk.isInstalled(s.id) && match(s))

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <MiniTabs
          value={tab}
          onChange={(t) => {
            setTab(t)
            setQuery('')
          }}
          options={[
            { value: 'discover', label: 'Discover' },
            { value: 'mine', label: `Yours${mine.length && !q ? ` · ${mine.length}` : ''}` },
            { value: 'commands', label: 'Commands' }
          ]}
        />
        <Btn
          variant="primary"
          onClick={() => setView(tab === 'commands' ? { name: 'command', id: null } : { name: 'edit', id: null })}
        >
          <Plus className="h-3.5 w-3.5" />
          {tab === 'commands' ? 'New command' : 'New skill'}
        </Btn>
      </div>

      {tab !== 'commands' && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737370]" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
            className="pl-7"
          />
        </div>
      )}

      {tab === 'discover' && (
        <div className="space-y-4">
          <p className="text-[12.5px] leading-5 text-[#8d8d8a]">
            A skill teaches the AI how to do one job your way. Add the ones you want, then use them
            with <span className="text-[#d6d6d3]">/</span> in the message box.
          </p>
          {discover.length === 0 && <Empty text={`No skills match “${query}”.`} />}
          {(q ? [null] : CATEGORIES).map((cat) => {
            const rows = cat ? discover.filter((s) => s.category === cat) : discover
            if (!rows.length) return null
            return (
              <section key={cat ?? 'all'}>
                {cat && (
                  <h3 className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">
                    {cat}
                  </h3>
                )}
                <ul className="-mx-1">
                  {rows.map((s) => (
                    <SkillRow
                      key={s.id}
                      skill={s}
                      onOpen={() => setView({ name: 'detail', id: s.id })}
                      right={
                        sk.isInstalled(s.id) ? (
                          <span className="flex items-center gap-1 text-[12px] text-[#8d8d8a]">
                            <Check className="h-3.5 w-3.5" /> Added
                          </span>
                        ) : (
                          <Btn
                            onClick={() => {
                              sk.install(s.id)
                              toast(`${s.name} added. Use it with /${s.id}`)
                            }}
                          >
                            Add
                          </Btn>
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {tab === 'mine' &&
        (mine.length === 0 ? (
          <Empty
            text={q ? `No skills match “${query}”.` : 'You have not added any skills yet.'}
            action={!q && <Btn onClick={() => setTab('discover')}>Browse skills</Btn>}
          />
        ) : (
          <ul className="-mx-1">
            {mine.map((s) => (
              <SkillRow
                key={s.id}
                skill={s}
                custom={s.source === 'custom'}
                onOpen={() => setView({ name: 'detail', id: s.id })}
                right={
                  <Toggle
                    label={`${s.name} on or off`}
                    checked={sk.isEnabled(s.id)}
                    onChange={(on) => sk.setEnabled(s.id, on)}
                  />
                }
              />
            ))}
          </ul>
        ))}

      {tab === 'commands' && (
        <div>
          <p className="mb-3 text-[12.5px] leading-5 text-[#8d8d8a]">
            Save a message you send often as your own command. Type{' '}
            <span className="text-[#d6d6d3]">/name</span> and it is sent for you.
          </p>
          {sk.commands.length === 0 ? (
            <Empty text="No commands yet." />
          ) : (
            <ul className="-mx-1">
              {sk.commands.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setView({ name: 'command', id: c.id })}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] text-[#ececea]">/{c.id}</span>
                      <span className="block truncate text-[11.5px] text-[#8d8d8a]">
                        {c.description || c.prompt}
                      </span>
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-[#737370]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end border-t border-white/[0.07] pt-3">
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  custom,
  right,
  onOpen
}: {
  skill: Skill
  custom?: boolean
  right: React.ReactNode
  onOpen: () => void
}): React.JSX.Element {
  return (
    <li className="flex items-center gap-1 rounded-[8px] pr-2 transition-colors hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1.5 py-1.5 text-left"
      >
        <Tile icon={skill.icon} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[12.5px] text-[#ececea]">
            {skill.name}
            {custom && (
              <span className="rounded-full bg-white/[0.07] px-1.5 text-[10px] leading-[15px] text-[#a8a8a6]">
                yours
              </span>
            )}
          </span>
          <span className="block truncate text-[11.5px] text-[#8d8d8a]">{skill.description}</span>
        </span>
      </button>
      <span className="shrink-0">{right}</span>
    </li>
  )
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[8px] border border-dashed border-white/[0.1] px-4 py-7 text-center text-[12.5px] text-[#8d8d8a]">
      {text}
      {action}
    </div>
  )
}

function DetailView({
  id,
  setView,
  onBack,
  onClose
}: {
  id: string
  setView: (v: View) => void
  onBack: () => void
  onClose: () => void
}): React.JSX.Element {
  const sk = useSkills()
  const skill = sk.all.find((s) => s.id === id)
  const [confirm, setConfirm] = useState(false)
  if (!skill) {
    return (
      <div>
        <BackLink onBack={onBack} />
        <Empty text="This skill no longer exists." />
      </div>
    )
  }
  const installed = sk.isInstalled(id)
  const custom = skill.source === 'custom'
  const steps = skill.instructions.split('\n').filter(Boolean)

  return (
    <div>
      <BackLink onBack={onBack} />
      <div className="mt-2 flex items-start gap-3">
        <Tile icon={skill.icon} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-[#ececea]">{skill.name}</div>
          <div className="mt-0.5 text-[12px] text-[#8d8d8a]">
            /{skill.id} · {custom ? 'Made by you' : skill.category}
          </div>
        </div>
        {installed && (
          <label className="flex items-center gap-2 text-[12px] text-[#a8a8a6]">
            {sk.isEnabled(id) ? 'On' : 'Off'}
            <Toggle label="Skill on or off" checked={sk.isEnabled(id)} onChange={(on) => sk.setEnabled(id, on)} />
          </label>
        )}
      </div>

      <p className="mt-3 text-[12.5px] leading-5 text-[#c9c9c6]">{skill.description}</p>

      <section className="mt-4">
        <h3 className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">How it works</h3>
        <ol className="space-y-1 rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12.5px] leading-5 text-[#c9c9c6]">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      {skill.example && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">Try saying</h3>
          <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.07] bg-white/[0.03] py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 text-[12.5px] italic text-[#c9c9c6]">“{skill.example}”</span>
            <Btn
              onClick={() => {
                if (!installed) sk.install(id)
                prefill(`/${skill.id} ${skill.example}`)
                onClose()
              }}
            >
              Use it
            </Btn>
          </div>
        </section>
      )}

      {skill.files.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">Example files</h3>
          <div className="flex flex-wrap gap-1.5">
            {skill.files.map((f) => (
              <FileChip key={f} name={f} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3">
        {custom ? (
          confirm ? (
            <span className="flex items-center gap-2 text-[12px] text-[#a8a8a6]">
              Delete this skill?
              <Btn
                variant="danger"
                onClick={() => {
                  sk.deleteSkill(id)
                  toast('Skill deleted')
                  onBack()
                }}
              >
                Delete
              </Btn>
              <Btn onClick={() => setConfirm(false)}>Keep</Btn>
            </span>
          ) : (
            <Btn variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Btn>
          )
        ) : installed ? (
          <Btn
            onClick={() => {
              sk.uninstall(id)
              toast(`${skill.name} removed`)
            }}
          >
            Remove
          </Btn>
        ) : (
          <Btn
            variant="primary"
            onClick={() => {
              sk.install(id)
              toast(`${skill.name} added. Use it with /${id}`)
            }}
          >
            Add skill
          </Btn>
        )}
        {custom && (
          <Btn onClick={() => setView({ name: 'edit', id })}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Btn>
        )}
      </div>
    </div>
  )
}

function BackLink({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 flex cursor-pointer items-center gap-1 rounded-[5px] px-1 py-0.5 text-[12px] text-[#8d8d8a] transition-colors hover:text-[#ececea]"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> All skills
    </button>
  )
}

function FileChip({ name, onRemove }: { name: string; onRemove?: () => void }): React.JSX.Element {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] bg-white/[0.07] py-0.5 pl-2 pr-1.5 text-[11.5px] text-[#c9c9c6]">
      <FileText className="h-3 w-3 shrink-0 text-[#8d8d8a]" />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="cursor-pointer text-[#8d8d8a] hover:text-[#ececea]">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/** Plain-language steps the AI would follow, taken from the instructions. This is a preview, not a real run. */
function previewSteps(draft: { instructions: string; files: string[] }, sample: string): string[] {
  const lines = draft.instructions
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)
  return [
    sample.trim() ? `Reads your request: “${sample.trim().slice(0, 60)}”` : 'Reads your request',
    ...draft.files.map((f) => `Looks at your example file ${f}`),
    ...lines.map((l) => (l.length > 80 ? `${l.slice(0, 77)}…` : l)),
    'Replies in plain language'
  ]
}

function SkillEditor({
  id,
  onBack,
  onSaved,
  onClose
}: {
  id: string | null
  onBack: () => void
  onSaved: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const sk = useSkills()
  const existing = id ? sk.all.find((s) => s.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [example, setExample] = useState(existing?.example ?? '')
  const [files, setFiles] = useState<string[]>(existing?.files ?? [])
  const [icon, setIcon] = useState(existing?.icon ?? 'spark')
  const [touched, setTouched] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const slug = slugify(name)
  const taken = sk.all.map((s) => s.id).filter((x) => x !== id)
  const problem = nameProblem(slug, taken)
  const missing = !instructions.trim() ? 'Tell the AI what to do.' : null
  const canSave = !problem && !missing

  const [test, setTest] = useState<{ steps: string[]; shown: number; running: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])

  const runTest = (): void => {
    if (missing) {
      setTouched(true)
      return
    }
    clearInterval(timer.current)
    const steps = previewSteps({ instructions, files }, example)
    setTest({ steps, shown: 0, running: true })
    let n = 0
    timer.current = setInterval(() => {
      n += 1
      setTest({ steps, shown: n, running: n < steps.length })
      if (n >= steps.length) clearInterval(timer.current)
    }, 420)
  }

  const draft = (): Skill => ({
    id: slug,
    name: name.trim(),
    description: description.trim() || 'A skill you made.',
    instructions: instructions.trim(),
    example: example.trim(),
    category: 'Quality',
    icon,
    triggers: [],
    files,
    source: 'custom'
  })

  const save = (): void => {
    setTouched(true)
    if (!canSave) return
    sk.saveSkill(draft(), id ?? undefined)
    toast(id ? 'Skill saved' : `Skill created. Use it with /${slug}`)
    onSaved(slug)
  }

  const useInChat = (): void => {
    if (!canSave) {
      setTouched(true)
      return
    }
    sk.saveSkill(draft(), id ?? undefined)
    prefill(`/${slug} ${example.trim()}`.trim())
    onClose()
  }

  return (
    <div>
      <BackLink onBack={onBack} />
      <div className="mt-3 space-y-3.5">
        <div>
          <label htmlFor="sk-name" className={label}>Name</label>
          <TextInput id="sk-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Release notes" />
          <p className={cn('mt-1 text-[11.5px]', touched && problem ? 'text-[#e8b365]' : 'text-[#737370]')}>
            {touched && problem ? problem : slug ? `You will type /${slug}` : 'This becomes the / command.'}
          </p>
        </div>

        <div>
          <span className={label}>Icon</span>
          <div className="flex flex-wrap gap-1">
            {Object.keys(ICONS).map((k) => {
              const Icon = ICONS[k]
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  aria-pressed={icon === k}
                  onClick={() => setIcon(k)}
                  className={cn(
                    'grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] transition-colors',
                    icon === k ? 'bg-white/[0.14] text-[#ececea]' : 'text-[#8d8d8a] hover:bg-white/[0.06]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="sk-desc" className={label}>What it is for <span className="text-[#737370]">(optional)</span></label>
          <TextInput id="sk-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Turns merged changes into release notes" />
        </div>

        <div>
          <label htmlFor="sk-ins" className={label}>What should the AI do?</label>
          <textarea
            id="sk-ins"
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={'1. Read the changes since the last release.\n2. Group them as New, Improved and Fixed.\n3. Write short notes a customer would understand.'}
            className={area}
          />
          <p className={cn('mt-1 text-[11.5px]', touched && missing ? 'text-[#e8b365]' : 'text-[#737370]')}>
            {touched && missing ? missing : 'Write it like you would explain the job to a new teammate.'}
          </p>
        </div>

        <div>
          <label htmlFor="sk-ex" className={label}>Example message <span className="text-[#737370]">(optional)</span></label>
          <TextInput id="sk-ex" value={example} onChange={(e) => setExample(e.target.value)} placeholder="Write release notes for version 1.2" />
        </div>

        <div>
          <span className={label}>Example files <span className="text-[#737370]">(optional)</span></span>
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((f) => (
              <FileChip key={f} name={f} onRemove={() => setFiles((l) => l.filter((x) => x !== f))} />
            ))}
            <Btn onClick={() => picker.current?.click()}>
              <Plus className="h-3.5 w-3.5" /> Add file
            </Btn>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name)
                setFiles((l) => [...new Set([...l, ...names])].slice(0, 8))
                e.target.value = ''
              }}
            />
          </div>
          <p className="mt-1 text-[11.5px] text-[#737370]">Show the AI what a good result looks like.</p>
        </div>

        <section className="rounded-[8px] border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12.5px] text-[#ececea]">Test it</div>
              <div className="text-[11.5px] text-[#8d8d8a]">See how the AI will read your instructions.</div>
            </div>
            <Btn onClick={runTest} busy={test?.running}>
              {test ? 'Run again' : 'Run test'}
            </Btn>
          </div>
          {test && (
            <>
              <ul className="mt-3 space-y-1.5" aria-live="polite">
                {test.steps.slice(0, test.shown).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-[18px] text-[#c9c9c6]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5fd17a]" />
                    {s}
                  </li>
                ))}
                {test.running && (
                  <li className="flex items-center gap-2 text-[12px] text-[#8d8d8a]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
                  </li>
                )}
              </ul>
              {!test.running && (
                <p className="mt-2.5 text-[11.5px] text-[#8d8d8a]">
                  This is a preview. Use “Save and try in chat” for a real run.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3">
        <Btn onClick={useInChat}>Save and try in chat</Btn>
        <span className="flex gap-2">
          <Btn onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Save skill
          </Btn>
        </span>
      </div>
    </div>
  )
}

function CommandEditor({ id, onBack }: { id: string | null; onBack: () => void }): React.JSX.Element {
  const sk = useSkills()
  const existing = id ? sk.commands.find((c) => c.id === id) : undefined
  const [name, setName] = useState(existing?.id ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [prompt, setPrompt] = useState(existing?.prompt ?? '')
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const slug = slugify(name)
  const taken = useMemo(
    () => [...sk.all.map((s) => s.id), ...sk.commands.map((c) => c.id)].filter((x) => x !== id),
    [sk.all, sk.commands, id]
  )
  const problem = nameProblem(slug, taken)
  const missing = !prompt.trim() ? 'Write the message to send.' : null

  const save = (): void => {
    setTouched(true)
    if (problem || missing) return
    const cmd: CustomCommand = { id: slug, description: description.trim(), prompt: prompt.trim() }
    sk.saveCommand(cmd, id ?? undefined)
    toast(id ? 'Command saved' : `Command created. Type /${slug} to use it`)
    onBack()
  }

  return (
    <div>
      <BackLink onBack={onBack} />
      <div className="mt-3 space-y-3.5">
        <div>
          <label htmlFor="cm-name" className={label}>Name</label>
          <TextInput id="cm-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="standup" />
          <p className={cn('mt-1 text-[11.5px]', touched && problem ? 'text-[#e8b365]' : 'text-[#737370]')}>
            {touched && problem ? problem : slug ? `You will type /${slug}` : 'Letters, numbers and dashes.'}
          </p>
        </div>
        <div>
          <label htmlFor="cm-desc" className={label}>Short description <span className="text-[#737370]">(optional)</span></label>
          <TextInput id="cm-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Summarise what I did today" />
        </div>
        <div>
          <label htmlFor="cm-prompt" className={label}>Message to send</label>
          <textarea
            id="cm-prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Summarise what changed today in three bullet points for my team standup."
            className={area}
          />
          <p className={cn('mt-1 text-[11.5px]', touched && missing ? 'text-[#e8b365]' : 'text-[#737370]')}>
            {touched && missing ? missing : 'Type $ARGUMENTS where text typed after the command should go.'}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3">
        {existing ? (
          confirm ? (
            <span className="flex items-center gap-2 text-[12px] text-[#a8a8a6]">
              Delete?
              <Btn
                variant="danger"
                onClick={() => {
                  sk.deleteCommand(existing.id)
                  toast('Command deleted')
                  onBack()
                }}
              >
                Delete
              </Btn>
              <Btn onClick={() => setConfirm(false)}>Keep</Btn>
            </span>
          ) : (
            <Btn variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Btn>
          )
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Btn onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Save command
          </Btn>
        </span>
      </div>
    </div>
  )
}
