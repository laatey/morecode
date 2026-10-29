import { ModalOverlay } from '@/components/modal-overlay'
import React, { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import {
  Bell,
  CircleHelp,
  CreditCard,
  FolderOpen,
  LogOut,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  SquarePen,
  type IconComponent
} from '@/components/icons'
import { useModelChoices } from '@/features/ai-assistant/use-model-choices'
import { useChatContext } from '@/features/ai-assistant/chat-context'
import { KeyChip } from '@/features/ai-assistant/panels/ui'
import { buildCommands } from '@/features/ai-assistant/slash-commands'
import { useSkills } from '@/features/skills/skills-store'
import { useAuth } from '@/features/auth/auth-store'
import { TAB_DEFINITIONS } from '@/features/right-panel/registry'
import { useRightPanel } from '@/features/right-panel/store'
import { SETTINGS_TAB_LABELS } from '@/features/settings/settings-page'
import { useSettings, type SettingsTab } from '@/features/settings/settings-store'
import { comboParts, useBindings } from '@/features/settings/shortcuts'
import { ago } from '@/features/workspace/format'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  group: string
  label: string
  detail?: string
  icon: IconComponent
  /** Shortcut id, to show its keys on the right. */
  shortcut?: string
  /** Extra words that should find this item. */
  words?: string
  run: () => void
}

// eslint-disable-next-line react-refresh/only-export-components
/** Lets other parts of the app react to a palette choice without sharing state. */
export const emit = (name: string, detail?: unknown): void => {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

const snippetAround = (text: string, needle: string): string => {
  const i = text.toLowerCase().indexOf(needle)
  if (i < 0) return ''
  const start = Math.max(0, i - 24)
  return `${start ? '…' : ''}${text.slice(start, i + needle.length + 48).trim()}…`
}

export function CommandPalette(): React.JSX.Element {
  const ws = useWorkspace()
  return (
    <Dialog.Root open={ws.searchOpen} onOpenChange={ws.setSearchOpen}>
      <Dialog.Portal>
        <ModalOverlay tone="light" />
        <PaletteBody />
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody(): React.JSX.Element {
  const ws = useWorkspace()
  const { account, openProject, openPlanDialog, startTour, signOut } = useAuth()
  const { openSettings } = useSettings()
  const { openTab } = useRightPanel()
  const { model, setModel, autoAccept, setAutoAccept } = useChatContext()
  const { choices: modelChoices, choose: chooseModel } = useModelChoices(setModel)
  const skills = useSkills()
  const bindings = useBindings()
  const [query, setQuery] = useState('')

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const settings = (tab: SettingsTab) => (): void => openSettings(tab)

    for (const c of [...ws.chats].filter((x) => !x.archived).sort((a, b) => b.updatedAt - a.updatedAt)) {
      out.push({
        id: `chat:${c.id}`,
        group: 'Chats',
        label: c.title,
        detail: ago(c.updatedAt),
        icon: MessageSquare,
        run: () => ws.select(c.id)
      })
    }

    out.push(
      { id: 'new-chat', group: 'Actions', label: 'New chat', icon: SquarePen, shortcut: 'new-chat', run: () => ws.newChat() },
      { id: 'open-settings', group: 'Actions', label: 'Open settings', icon: SettingsIcon, shortcut: 'settings', words: 'preferences options', run: settings('general') },
      { id: 'left', group: 'Actions', label: 'Show or hide the left sidebar', icon: PanelLeft, shortcut: 'toggle-sidebar', run: () => emit('app:layout', 'left') },
      { id: 'right', group: 'Actions', label: 'Show or hide the right sidebar', icon: PanelRight, shortcut: 'toggle-panel', run: () => emit('app:layout', 'right') },
      {
        id: 'auto-accept',
        group: 'Actions',
        label: autoAccept ? 'Ask before accepting edits' : 'Accept edits automatically',
        icon: Sparkles,
        words: 'permissions review',
        run: () => setAutoAccept((v) => !v)
      }
    )

    for (const d of TAB_DEFINITIONS) {
      const shortcut = d.kind === 'terminal' ? 'open-terminal' : d.kind === 'diff' ? 'open-changes' : d.kind === 'docs' ? 'open-docs' : undefined
      out.push({ id: `tab:${d.kind}`, group: 'Tools', label: `Open ${d.title}`, detail: d.description, icon: d.icon, shortcut, run: () => openTab(d.kind) })
    }

    for (const c of buildCommands(skills.active, skills.commands)) {
      out.push({ id: `cmd:${c.id}`, group: 'Commands', label: `/${c.id}`, detail: c.description, icon: c.icon, run: () => emit('assistant:run', c.id) })
    }

    for (const c of modelChoices) {
      if (c.model.id !== model) out.push({ id: `model:${c.model.id}`, group: 'Models', label: `Switch to ${c.model.name}`, detail: c.locked ? `${c.model.description} · Upgrade to use` : c.model.description, icon: Sparkles, words: 'model', run: () => void chooseModel(c) })
    }

    for (const r of account?.recents ?? []) {
      if (r.path !== account?.project?.path || r.name !== account?.project?.name)
        out.push({ id: `project:${r.path}${r.name}`, group: 'Projects', label: `Open ${r.name}`, detail: r.path, icon: FolderOpen, words: 'folder project', run: () => void openProject(r) })
    }
    if (window.api?.workspace) {
      out.push({
        id: 'open-folder',
        group: 'Projects',
        label: 'Open another folder…',
        icon: FolderOpen,
        words: 'project',
        run: () => void window.api.workspace.choose().then((w) => w && void openProject({ name: w.name, path: w.root }))
      })
    }

    for (const tab of Object.keys(SETTINGS_TAB_LABELS) as SettingsTab[]) {
      if (tab === 'general' || tab === 'billing' || tab === 'about') continue
      out.push({
        id: `settings:${tab}`,
        group: 'Settings',
        label: SETTINGS_TAB_LABELS[tab],
        detail: 'Settings',
        icon: tab === 'notifications' ? Bell : SettingsIcon,
        run: settings(tab)
      })
    }

    out.push(
      { id: 'billing', group: 'Account', label: 'Usage and billing', detail: 'Plan, invoices, payment method', icon: CreditCard, words: 'invoice card plan limit', run: settings('billing') },
      { id: 'upgrade', group: 'Account', label: 'Upgrade plan', icon: Rocket, run: () => openPlanDialog('upgrade') },
      { id: 'help', group: 'Account', label: 'Help and what’s new', icon: CircleHelp, words: 'docs support about version', run: settings('about') },
      { id: 'bug', group: 'Account', label: 'Report a bug', icon: CircleHelp, words: 'feedback problem', run: settings('about') },
      { id: 'tour', group: 'Account', label: 'Take the tour', icon: CircleHelp, run: () => setTimeout(startTour, 200) },
      { id: 'sign-out', group: 'Account', label: 'Sign out', icon: LogOut, run: () => void signOut() }
    )
    return out
  }, [ws, account, skills.active, skills.commands, model, autoAccept, openSettings, openTab, modelChoices, chooseModel, setAutoAccept, openProject, openPlanDialog, startTour, signOut])

  const needle = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!needle) {
      const pick = (g: string, n: number): Item[] => items.filter((i) => i.group === g).slice(0, n)
      return [...pick('Chats', 4), ...pick('Actions', 5), ...pick('Tools', 3), ...pick('Account', 2)].map((i) => ({ item: i, snippet: '' }))
    }
    const words = needle.split(/\s+/)
    const scored: Array<{ item: Item; snippet: string; score: number }> = []
    for (const item of items) {
      const hay = `${item.label} ${item.words ?? ''}`.toLowerCase()
      if (words.every((w) => hay.includes(w))) {
        scored.push({ item, snippet: '', score: item.label.toLowerCase().startsWith(needle) ? 0 : 1 })
      } else if (item.group === 'Chats' && needle.length > 1) {
        const body = ws.textOf(item.id.slice(5))
        if (words.every((w) => body.toLowerCase().includes(w))) {
          scored.push({ item, snippet: snippetAround(body, words[0]), score: 3 })
        }
      }
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 30)
  }, [items, needle, ws])

  const groups = useMemo(() => {
    const map = new Map<string, typeof results>()
    for (const r of results) map.set(r.item.group, [...(map.get(r.item.group) ?? []), r])
    return [...map.entries()]
  }, [results])

  const choose = (item: Item): void => {
    ws.setSearchOpen(false)
    setTimeout(item.run, 60)
  }

  return (
    <Dialog.Content
      aria-describedby={undefined}
      className="fixed left-1/2 top-[14vh] z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 select-text overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#262625] shadow-[0_12px_36px_rgba(0,0,0,0.5)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      <Command shouldFilter={false} loop label="Command palette">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#77776f]" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search chats, run a command, open a setting"
            className="h-10 flex-1 bg-transparent text-[13px] text-[#ececea] outline-none placeholder:text-[#77776f]"
          />
        </div>
        <Command.List className="slim-scroll max-h-[min(280px,50vh)] overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-[#8d8d8a]">
            Nothing matches “{query}”.
          </Command.Empty>
          {groups.map(([name, rows]) => (
            <Command.Group
              key={name}
              heading={name}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-[#77776f]"
            >
              {rows.map(({ item, snippet }) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => choose(item)}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-[#d6d6d3] outline-none',
                    'data-[selected=true]:bg-white/[0.08] data-[selected=true]:text-[#ececea]'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-[#8d8d8a]" />
                  <span className="shrink-0 truncate">{item.label}</span>
                  {(snippet || item.detail) && (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#77776f]">{snippet || item.detail}</span>
                  )}
                  {item.shortcut && bindings[item.shortcut] && (
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {comboParts(bindings[item.shortcut]).map((k, i) => (
                        <KeyChip key={`${k}${i}`}>{k}</KeyChip>
                      ))}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-white/[0.07] px-3 py-1.5 text-[11px] text-[#77776f]">
          <span className="flex items-center gap-1.5"><KeyChip>↑</KeyChip><KeyChip>↓</KeyChip> to move</span>
          <span className="flex items-center gap-1.5"><KeyChip>Enter</KeyChip> to run</span>
          <span className="ml-auto flex items-center gap-1.5"><KeyChip>Esc</KeyChip> to close</span>
        </div>
      </Command>
    </Dialog.Content>
  )
}
