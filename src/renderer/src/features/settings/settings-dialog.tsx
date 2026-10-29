import { ModalOverlay } from '@/components/modal-overlay'
import React, { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { AboutPage } from './pages/about'
import { AppearancePage } from './pages/appearance'
import { BillingPage } from './pages/billing'
import { DataPage } from './pages/data'
import { GeneralPage } from './pages/general'
import { ModelsPage } from './pages/models'
import { NotificationsPage } from './pages/notifications'
import { PermissionsPage } from './pages/permissions'
import { ShortcutsPage } from './pages/shortcuts'
import { useSettings, type SettingsTab } from './settings-store'

interface NavSection {
  title: string
  items: { id: SettingsTab; label: string }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Preferences',
    items: [
      { id: 'general', label: 'General' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'models', label: 'Models' },
      { id: 'shortcuts', label: 'Shortcuts' },
      { id: 'notifications', label: 'Notifications' }
    ]
  },
  {
    title: 'Safety',
    items: [
      { id: 'permissions', label: 'Permissions' },
      { id: 'data', label: 'Privacy' }
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'billing', label: 'Billing' },
      { id: 'about', label: 'Help and about' }
    ]
  }
]

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)

// eslint-disable-next-line react-refresh/only-export-components
export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = Object.fromEntries(
  ALL_ITEMS.map((n) => [n.id, n.label])
) as Record<SettingsTab, string>

const PAGES: Record<SettingsTab, () => React.JSX.Element> = {
  general: GeneralPage,
  appearance: AppearancePage,
  models: ModelsPage,
  permissions: PermissionsPage,
  shortcuts: ShortcutsPage,
  notifications: NotificationsPage,
  billing: BillingPage,
  data: DataPage,
  about: AboutPage
}

export function SettingsDialog(): React.JSX.Element {
  const { open, closeSettings, tab, setTab } = useSettings()
  const scroller = useRef<HTMLDivElement>(null)
  const Page = PAGES[tab] ?? GeneralPage // a saved tab that no longer exists falls back to General

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && closeSettings()}>
      <Dialog.Portal>
        <ModalOverlay tone="blurred" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(540px,calc(100vh-56px))] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 select-text overflow-hidden rounded-[10px] border border-white/[0.12] bg-[#272726] shadow-[0_24px_80px_rgba(0,0,0,0.58)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <nav aria-label="Settings navigation" className="flex w-[174px] shrink-0 flex-col border-r border-white/[0.1] bg-[#272726] px-2 py-2">
            <div className="slim-scroll -mx-1 flex-1 overflow-y-auto px-1 py-0.5">
              {NAV_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <p className="mt-3 flex h-6 items-center px-2 text-[11.5px] text-muted-foreground">
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((n) => {
                        const active = tab === n.id
                        return (
                          <button
                            key={n.id}
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setTab(n.id)}
                            className={cn(
                              'flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]',
                              active
                                ? 'bg-white/[0.09] text-white'
                                : 'text-[#c9c9c5] hover:bg-white/[0.05] hover:text-white'
                            )}
                          >
                            <span className="truncate">{n.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </nav>

          <div className="relative flex min-w-0 flex-1 flex-col bg-[#272726]">
            <Dialog.Close
              aria-label="Close settings"
              className="absolute right-2 top-2 z-20 grid h-7 w-7 cursor-pointer place-items-center rounded-[5px] text-[#d0d0cc] transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
            <div ref={scroller} className="slim-scroll h-full overflow-y-auto px-5 py-4 pr-9">
              <Page />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

