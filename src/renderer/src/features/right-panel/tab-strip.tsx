import React, { useEffect, useRef, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Columns2, Pencil, Plus, RotateCcw, X, XCircle } from '@/components/icons'
import { ActionMenu, ActionMenuItem } from '@/components/action-menu'
import { IconButton } from '@/components/layout/icon-button'
import { FileIcon } from '@/components/file-icon'
import { cn } from '@/lib/utils'
import { getTabDefinition, TAB_DEFINITIONS } from './registry'
import { getLayout, LAYOUTS } from './layouts'
import { useRightPanel } from './store'

const MENU =
  'app-no-drag z-50 min-w-[176px] overflow-hidden rounded-[6px] border border-border bg-muted p-0.5 text-foreground shadow-lg outline-none select-none animate-in fade-in-0 zoom-in-95'
const MENU_ROW =
  'flex cursor-pointer items-center gap-2 rounded-[4px] py-[5.5px] pl-2.5 pr-3 text-[12.5px] leading-[18px] text-foreground outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-foreground/[0.07]'

/** The tab's name turns into a text box. Enter saves, Escape cancels, an empty name restores the default. */
function RenameField({
  initial,
  onDone
}: {
  initial: string
  onDone: (title: string | null) => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (value: string | null): void => {
    if (finished.current) return
    finished.current = true
    onDone(value)
  }
  return (
    <input
      ref={ref}
      defaultValue={initial}
      maxLength={40}
      aria-label="Tab name"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className="min-w-0 flex-1 rounded-[3px] bg-scrim/30 px-1 text-[12px] text-scrim-foreground outline-none ring-1 ring-primary/70"
    />
  )
}

/** Chrome-style tab strip + "new tab" and layout picker. Tabs can be renamed, dragged and split. */
export function TabStrip(): React.JSX.Element {
  const {
    tabs,
    paneTabs,
    layout,
    focusedPane,
    titles,
    showTab,
    closeTab,
    closeOthers,
    openTab,
    setLayout,
    renameTab,
    moveTab,
    moveBeside,
    titleOf
  } = useRightPanel()
  const activeId = paneTabs[focusedPane]
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // tabs keep a readable width and the strip slides; the tab you pick or open is brought into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [activeId, tabs.length])

  const newTabItems: ActionMenuItem[] = TAB_DEFINITIONS.map((d) => ({
    id: d.kind,
    label: d.title,
    icon: <d.icon className="h-3.5 w-3.5 stroke-[1.7]" />,
    onClick: () => openTab(d.kind)
  }))

  const layoutItems: ActionMenuItem[] = LAYOUTS.map((l) => ({
    id: l.id,
    label: l.label,
    icon: <l.icon className="h-3.5 w-3.5 stroke-[1.7]" />,
    checked: l.id === layout,
    onClick: () => setLayout(l.id)
  }))
  const LayoutIcon = getLayout(layout).icon

  return (
    <div className="app-no-drag flex h-[34px] shrink-0 items-center gap-1 border-b border-border/50 px-2">
      <div
        role="tablist"
        ref={listRef}
        // the mouse wheel slides the strip sideways
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
        }}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const def = getTabDefinition(tab.kind)
          if (!def) return null
          const Icon = def.icon
          const active = tab.id === activeId
          const name = titleOf(tab)
          const editing = renaming === tab.id
          return (
            <ContextMenu.Root key={tab.id}>
              <ContextMenu.Trigger asChild>
                <div
                  role="tab"
                  data-tab-id={tab.id}
                  aria-selected={active}
                  tabIndex={0}
                  title={name}
                  draggable={!editing}
                  onDragStart={(e) => {
                    setDragging(tab.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', tab.id)
                  }}
                  onDragOver={(e) => {
                    if (!dragging || dragging === tab.id) return
                    e.preventDefault()
                    setOver(tab.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragging && dragging !== tab.id) moveTab(dragging, index)
                    setDragging(null)
                    setOver(null)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  onClick={() => showTab(tab.id)}
                  onDoubleClick={() => setRenaming(tab.id)}
                  onKeyDown={(e) => {
                    if (editing) return
                    if (e.key === 'Enter' || e.key === ' ') showTab(tab.id)
                    if (e.key === 'F2') setRenaming(tab.id)
                  }}
                  onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                  className={cn(
                    'group relative flex h-6 min-w-[104px] max-w-[190px] shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-[12px] cursor-default outline-none transition-colors',
                    active
                      ? 'bg-foreground/[0.09] text-foreground'
                      : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
                    dragging === tab.id && 'opacity-40',
                    over === tab.id &&
                      'before:absolute before:-left-[3px] before:inset-y-1 before:w-[2px] before:rounded-full before:bg-primary'
                  )}
                >
                  {tab.kind === 'file' && /\.\w+/.test(name) ? (
                    <FileIcon name={name.replace(/ •$/, '')} className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3 w-3 shrink-0 stroke-[1.8]" />
                  )}
                  {editing ? (
                    <RenameField
                      initial={name}
                      onDone={(value) => {
                        setRenaming(null)
                        if (value !== null) renameTab(tab.id, value)
                      }}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  )}
                  {!editing && (
                    <button
                      type="button"
                      aria-label={`Close ${name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tab.id)
                      }}
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] hover:bg-foreground/[0.12]',
                        active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
                      )}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={MENU}>
                  <ContextMenu.Item className={MENU_ROW} onSelect={() => setRenaming(tab.id)}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Rename
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-0.5 h-px bg-foreground/[0.08]" />
                  {titles[tab.id] && (
                    <>
                      <ContextMenu.Item className={MENU_ROW} onSelect={() => renameTab(tab.id, '')}>
                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /> Use the original name
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="my-0.5 h-px bg-foreground/[0.08]" />
                    </>
                  )}
                  <ContextMenu.Item className={MENU_ROW} onSelect={() => moveBeside(tab.id)}>
                    <Columns2 className="h-3.5 w-3.5 text-muted-foreground" /> Show beside the current tab
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-0.5 h-px bg-foreground/[0.08]" />
                  <ContextMenu.Item className={MENU_ROW} onSelect={() => closeTab(tab.id)}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" /> Close
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-0.5 h-px bg-foreground/[0.08]" />
                  <ContextMenu.Item
                    className={MENU_ROW}
                    disabled={tabs.length < 2}
                    onSelect={() => closeOthers(tab.id)}
                  >
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" /> Close the other tabs
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <ActionMenu
          align="end"
          items={newTabItems}
          trigger={
            <IconButton title="New tab" className="p-1">
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <ActionMenu
          align="end"
          items={layoutItems}
          trigger={
            <IconButton title="Layout" className="p-1">
              <LayoutIcon className="h-3.5 w-3.5 stroke-[1.7]" />
            </IconButton>
          }
        />
      </div>
    </div>
  )
}
