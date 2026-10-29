import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Plus, Search, ShieldCheck, Trash2, X } from '@/components/icons'
import { Btn, TextInput, Toggle } from '@/features/settings/kit'
import { SkillsPanel } from '@/features/ai-assistant/panels/skills-panel'
import { CATALOG, entryById, type CatalogEntry } from '@/features/connectors/catalog'
import { useConnectors, type Connector, type Draft, type Perm } from '@/features/connectors/connectors-store'
import { ConnectorLogo } from '@/features/connectors/logo'
import { cn } from '@/lib/utils'

type Tab = 'skills' | 'connectors'
type Sub = 'yours' | 'discover'
type View = { name: 'list' } | { name: 'connect'; catalogId?: string } | { name: 'detail'; id: string }

const TAB_KEY = 'morecode:customize-tab'
const SUB_KEY = 'morecode:customize-sub'
const pick = <T extends string>(key: string, ok: T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && ok.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const keep = (key: string, v: string): void => {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* harmless */
  }
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }): React.JSX.Element {
  return (
    <div role="tablist" className="flex items-center gap-6 border-b border-[#33332f]">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            '-mb-px cursor-pointer border-b-2 px-0.5 pb-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none',
            o.value === value ? 'border-white text-white' : 'border-transparent text-[#8f8f8a] hover:text-[#e2e2e0]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Item({ logo, title, note, right, onClick }: { logo: React.ReactNode; title: string; note?: string; right?: React.ReactNode; onClick?: () => void }): React.JSX.Element {
  const body = (
    <>
      {logo}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-[#f1f1ef]">{title}</span>
        {note && <span className="block truncate text-[12.5px] text-[#8f8f8a]">{note}</span>}
      </span>
      {right}
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-[10px] bg-[#272726] px-3 py-2.5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'cursor-pointer transition-colors hover:bg-[#30302e] focus-visible:outline-none')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------------- list ---------------- */

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a9a9a4]" />
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search connectors" className="h-8 pl-7" />
    </div>
  )
}

function ConnectorsTab({ view, setView }: { view: View; setView: (v: View) => void }): React.JSX.Element {
  const cx = useConnectors()
  const [sub, setSub] = useState<Sub>(() => pick(SUB_KEY, ['yours', 'discover'], cx.connectors.length ? 'yours' : 'discover'))
  const [q, setQ] = useState('')
  const set = (s: Sub): void => {
    setSub(s)
    keep(SUB_KEY, s)
    setQ('')
  }
  const needle = q.trim().toLowerCase()
  const hit = (...t: (string | undefined)[]): boolean => !needle || t.join(' ').toLowerCase().includes(needle)

  if (view.name === 'connect') return <ConnectView catalogId={view.catalogId} onBack={() => setView({ name: 'list' })} onDone={(id) => setView({ name: 'detail', id })} />
  if (view.name === 'detail') return <DetailView id={view.id} onBack={() => setView({ name: 'list' })} />

  const mine = cx.connectors.filter((c) => hit(c.name, c.description))
  const found = CATALOG.filter((e) => hit(e.name, e.description, e.by, e.category))

  return (
    <div className="pt-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchBox value={q} onChange={setQ} />
        </div>
        <div className="flex items-center rounded-[8px] bg-[#272726] p-0.5">
          {(['yours', 'discover'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set(s)}
              className={cn('cursor-pointer rounded-[6px] px-3 py-1 text-[12.5px] font-medium capitalize transition-colors', sub === s ? 'bg-[#ececea] text-[#1a1a19]' : 'text-[#9a9a95] hover:text-white')}
            >
              {s}
            </button>
          ))}
        </div>
        <Btn onClick={() => setView({ name: 'connect' })} className="h-8 gap-1 border-transparent bg-[#272726] shadow-none hover:bg-[#30302e]">
          <Plus className="h-3.5 w-3.5" /> Add custom
        </Btn>
      </div>

      {sub === 'yours' ? (
        mine.length ? (
          <div className="flex flex-col gap-1.5">
            {mine.map((c) => (
              <Item
                key={c.id}
                logo={<ConnectorLogo id={c.catalogId ?? c.id} domain={c.domain} name={c.name} size={36} />}
                title={c.name}
                note={c.enabled ? `${c.tools.length} tool${c.tools.length === 1 ? '' : 's'}` : 'Off'}
                onClick={() => setView({ name: 'detail', id: c.id })}
                right={<ChevronRight className="h-4 w-4 text-[#77776f]" />}
              />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-[13px] text-[#8f8f8a]">
            {cx.connectors.length ? 'No matches.' : 'Nothing connected yet. '}
            {!cx.connectors.length && (
              <button type="button" className="cursor-pointer font-medium text-white underline underline-offset-2" onClick={() => set('discover')}>
                Browse connectors
              </button>
            )}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-1.5">
          {found.map((e) => {
            const added = cx.connectors.some((c) => c.catalogId === e.id)
            return (
              <Item
                key={e.id}
                logo={<ConnectorLogo id={e.id} domain={e.domain} name={e.name} size={36} />}
                title={e.name}
                note={e.description}
                onClick={() => {
                  const mineHere = cx.connectors.find((c) => c.catalogId === e.id)
                  setView(mineHere ? { name: 'detail', id: mineHere.id } : { name: 'connect', catalogId: e.id })
                }}
                right={
                  added ? (
                    <Check className="h-4 w-4 text-[#4cc38a]" />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-[#3a3a37] text-[#e2e2e0]">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  )
                }
              />
            )
          })}
          {!found.length && <p className="py-10 text-center text-[13px] text-[#8f8f8a]">No matches. Add it as a custom connector.</p>}
        </div>
      )}
    </div>
  )
}

/* ---------------- connect (store entry or custom) ---------------- */

const label = 'mb-1.5 block text-[12.5px] text-[#a9a9a4]'

function ConnectView({ catalogId, onBack, onDone }: { catalogId?: string; onBack: () => void; onDone: (id: string) => void }): React.JSX.Element {
  const cx = useConnectors()
  const entry: CatalogEntry | undefined = entryById(catalogId)
  const [name, setName] = useState(entry?.name ?? '')
  const [kind, setKind] = useState<'http' | 'stdio'>(entry?.kind ?? 'http')
  const [url, setUrl] = useState(entry?.url ?? '')
  const [token, setToken] = useState('')
  const [command, setCommand] = useState(entry?.command ?? '')
  const [argLine, setArgLine] = useState(entry ? '' : '')
  const [envText, setEnvText] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [oauth, setOauth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const custom = !entry
  const ready = custom ? Boolean(name.trim() && (kind === 'http' ? url.trim() : command.trim())) : (entry.fields ?? []).every((f) => vals[f.key]?.trim()) && (entry.auth !== 'token' || token.trim() !== '')

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    let draft: Draft
    if (entry) {
      const env: Record<string, string> = {}
      const extra: string[] = []
      for (const f of entry.fields ?? []) (f.target === 'env' ? (env[f.key] = vals[f.key].trim()) : extra.push(vals[f.key].trim()))
      draft = { catalogId: entry.id, name: entry.name, kind: entry.kind, url: entry.url, command: entry.command, args: [...(entry.args ?? []), ...extra], token: token || undefined, env, oauth: entry.auth === 'oauth' }
    } else {
      const env: Record<string, string> = {}
      for (const line of envText.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
        if (m) env[m[1]] = m[2].trim()
      }
      const args = (argLine.match(/"[^"]*"|\S+/g) ?? []).map((a) => a.replace(/^"|"$/g, ''))
      draft = { name, kind, url, command, args, token: oauth ? undefined : token || undefined, env, oauth: kind === 'http' && oauth }
    }
    const r = await cx.add(draft)
    setBusy(false)
    if (r.error) return setError(r.error)
    onDone(r.id)
  }

  return (
    <div className="pt-4">
      <button type="button" onClick={onBack} className="mb-4 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-[#8f8f8a] hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Connectors
      </button>
      <div className="mb-5 flex items-center gap-3">
        <ConnectorLogo id={entry?.id} domain={entry?.domain} name={name || 'C'} size={40} />
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-white">{entry ? entry.name : 'Custom connector'}</h2>
          <p className="truncate text-[12.5px] text-[#8f8f8a]">{entry ? `${entry.description} · by ${entry.by}` : 'Connect any MCP server, on the web or on this computer.'}</p>
        </div>
      </div>

      <div className="flex max-w-[460px] flex-col gap-3.5">
        {custom && (
          <>
            <div>
              <span className={label}>Name</span>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="My server" className="h-8" />
            </div>
            <div>
              <span className={label}>Type</span>
              <div className="inline-flex rounded-[8px] bg-[#272726] p-0.5">
                {([['http', 'Remote (URL)'], ['stdio', 'Local (command)']] as const).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={cn('cursor-pointer rounded-[6px] px-3 py-1 text-[12.5px] font-medium transition-colors', kind === k ? 'bg-[#ececea] text-[#1a1a19]' : 'text-[#9a9a95] hover:text-white')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {kind === 'http' ? (
              <>
                <div>
                  <span className={label}>Server URL</span>
                  <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className="h-8 font-mono" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#e2e2e0]">
                  <Toggle checked={oauth} onChange={setOauth} label="Sign in with your browser" /> Sign in with your browser
                </label>
                {!oauth && (
                  <div>
                    <span className={label}>Access token (optional)</span>
                    <TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Sent as a Bearer token" className="h-8" />
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <span className={label}>Command</span>
                  <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className="h-8 font-mono" />
                </div>
                <div>
                  <span className={label}>Arguments</span>
                  <TextInput value={argLine} onChange={(e) => setArgLine(e.target.value)} placeholder="-y @scope/some-mcp-server" className="h-8 font-mono" />
                </div>
                <div>
                  <span className={label}>Environment variables (one per line, optional)</span>
                  <textarea
                    value={envText}
                    onChange={(e) => setEnvText(e.target.value)}
                    rows={3}
                    placeholder="API_KEY=…"
                    className="slim-scroll w-full resize-none rounded-[7px] border border-[#3a3a37] bg-[#272726] px-2.5 py-2 font-mono text-[12.5px] text-white outline-none placeholder:text-[#9a9a95] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                  />
                </div>
              </>
            )}
          </>
        )}

        {entry?.auth === 'token' && (
          <div>
            <span className={label}>{entry.tokenLabel ?? 'Access token'}</span>
            <TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} className="h-8" autoFocus />
            {entry.tokenHint && <p className="mt-1 text-[12px] text-[#77776f]">{entry.tokenHint}</p>}
          </div>
        )}
        {(entry?.auth === 'oauth' || (custom && oauth)) && <p className="text-[12px] text-[#77776f]">Your browser opens so you can sign in and allow access. Come back here when it says you are done.</p>}
        {entry?.fields?.map((f) => (
          <div key={f.key}>
            <span className={label}>{f.label}</span>
            <TextInput type={f.secret ? 'password' : 'text'} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={f.placeholder} className="h-8" />
          </div>
        ))}
        {entry?.kind === 'stdio' && <p className="text-[12px] text-[#77776f]">Runs on this computer with “{entry.command} {entry.args?.join(' ')}”. The first start can take a moment while it downloads.</p>}

        {error && <p className="text-[12px] leading-5 text-[var(--diff-del)]">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <Btn variant="primary" busy={busy} disabled={!ready} onClick={() => void connect()} className="h-8 px-3">
            {busy ? (entry?.auth === 'oauth' || oauth ? 'Waiting for sign-in…' : 'Connecting…') : entry?.auth === 'oauth' || oauth ? 'Sign in & connect' : 'Connect'}
          </Btn>
          <Btn onClick={onBack} disabled={busy} className="h-8 px-3">
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  )
}

/* ---------------- detail + tool permissions ---------------- */

const PERMS: { value: Perm; title: string; icon: React.ReactNode }[] = [
  { value: 'allow', title: 'Always allow', icon: <Check className="h-3.5 w-3.5" /> },
  { value: 'ask', title: 'Needs approval', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { value: 'block', title: 'Never allow', icon: <X className="h-3.5 w-3.5" /> }
]

function PermControl({ value, onChange }: { value: Perm | null; onChange: (p: Perm) => void }): React.JSX.Element {
  return (
    <div className="inline-flex shrink-0 rounded-[8px] bg-[#1c1c1b] p-0.5">
      {PERMS.map((p) => (
        <button
          key={p.value}
          type="button"
          title={p.title}
          aria-label={p.title}
          aria-pressed={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn('grid h-6 w-7 cursor-pointer place-items-center rounded-[5px] transition-colors', value === p.value ? 'bg-[#ececea] text-[#1a1a19]' : 'text-[#77776f] hover:text-white')}
        >
          {p.icon}
        </button>
      ))}
    </div>
  )
}

function DetailView({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const cx = useConnectors()
  const c: Connector | undefined = cx.get(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // bring the tool list up to date whenever the page opens
  useEffect(() => {
    if (!c?.enabled) return
    let live = true
    void cx.refresh(id).then((e) => live && setError(e))
    return () => {
      live = false
    }
    // only when this connector is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const groups = useMemo(() => {
    const t = c?.tools ?? []
    return [
      { title: 'Read-only tools', tools: t.filter((x) => x.readOnly), fallback: 'allow' as Perm },
      { title: 'Write / delete tools', tools: t.filter((x) => !x.readOnly), fallback: 'ask' as Perm }
    ].filter((g) => g.tools.length)
  }, [c?.tools])

  if (!c) return <div className="pt-4"><button type="button" onClick={onBack} className="text-[12.5px] text-[#8d8d8a]">Back</button></div>

  return (
    <div className="pt-4">
      <button type="button" onClick={onBack} className="mb-4 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-[#8f8f8a] hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Connectors
      </button>
      <div className="mb-1 flex items-center gap-3">
        <ConnectorLogo id={c.catalogId ?? c.id} domain={c.domain} name={c.name} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold text-white">{c.name}</h2>
          <p className="truncate text-[12.5px] text-[#8f8f8a]">{c.description ?? (c.kind === 'http' ? c.url : `${c.command} ${c.args.join(' ')}`)}</p>
        </div>
        <Toggle checked={c.enabled} onChange={(v) => cx.setEnabled(id, v)} label={`Use ${c.name}`} />
      </div>
      {error && <p className="mt-2 text-[12px] text-[var(--diff-del)]">{error}</p>}

      <h3 className="mb-1 mt-8 text-[14px] font-semibold text-white">Tool permissions</h3>
      <p className="mb-3 text-[12.5px] text-[#8f8f8a]">Choose when the AI may use these tools.</p>
      {groups.map((g) => {
        const eff = g.tools.map((t) => c.perms[t.name] ?? g.fallback)
        const same = eff.every((p) => p === eff[0]) ? eff[0] : null
        return (
          <div key={g.title} className="mb-4 overflow-hidden rounded-[10px] bg-[#272726]">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[13px] font-medium text-white">
                {g.title} <span className="font-normal text-[#77776f]">{g.tools.length}</span>
              </span>
              <PermControl value={same} onChange={(p) => cx.setPerm(id, g.tools.map((t) => t.name), p === g.fallback ? null : p)} />
            </div>
            {g.tools.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-3 border-t border-[#323230] px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12px] text-[#e2e2e0]">{t.name}</span>
                  {t.description && <span className="block truncate text-[12px] text-[#77776f]">{t.description}</span>}
                </span>
                <PermControl value={c.perms[t.name] ?? g.fallback} onChange={(p) => cx.setPerm(id, [t.name], p === g.fallback ? null : p)} />
              </div>
            ))}
          </div>
        )
      })}
      {!c.tools.length && <p className="py-4 text-[13px] text-[#8f8f8a]">{c.enabled ? 'No tools listed yet.' : 'Turn the connector on to see its tools.'}</p>}

      <div className="mt-6 flex items-center gap-2">
        <Btn busy={busy} onClick={() => { setBusy(true); void cx.refresh(id).then((e) => { setError(e); setBusy(false) }) }}>Reconnect</Btn>
        {c.auth === 'oauth' && (
          <Btn busy={busy} onClick={() => { setBusy(true); void cx.reauth(id).then((e) => { setError(e); setBusy(false) }) }}>Sign in again</Btn>
        )}
        <Btn variant="danger" onClick={() => { cx.remove(id); onBack() }}>
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Btn>
      </div>
    </div>
  )
}

/* ---------------- the page ---------------- */

export function CustomizePage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(() => pick(TAB_KEY, ['skills', 'connectors'], 'connectors'))
  const [view, setView] = useState<View>({ name: 'list' })
  const change = (t: Tab): void => {
    setTab(t)
    keep(TAB_KEY, t)
    setView({ name: 'list' })
  }

  // "/skills" and "/commands" in the chat land here
  useEffect(() => {
    const on = (e: Event): void => change(((e as CustomEvent<Tab>).detail ?? 'skills') as Tab)
    window.addEventListener('customize:tab', on)
    return () => window.removeEventListener('customize:tab', on)
  }, [])

  return (
    <div className="slim-scroll h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-6 pb-16 pt-9">
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-white">Customize</h1>
        <p className="mb-6 text-[13.5px] text-[#8f8f8a]">Teach the AI your way of working, and connect the tools you use.</p>
        <Tabs value={tab} onChange={change} options={[{ value: 'skills', label: 'Skills' }, { value: 'connectors', label: 'Connectors' }]} />
        {tab === 'skills' ? (
          <div className="pt-4">
            <SkillsPanel initialTab="mine" onClose={() => undefined} embedded />
          </div>
        ) : (
          <ConnectorsTab view={view} setView={setView} />
        )}
      </div>
    </div>
  )
}
