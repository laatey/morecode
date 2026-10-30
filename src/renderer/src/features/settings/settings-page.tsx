import React, { useEffect, useRef } from 'react'
import { ArrowLeft } from '@/components/icons'
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

export function SettingsPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const { closeSettings, tab, setTab } = useSettings()
  const scroller = useRef<HTMLDivElement>(null)
  const Page = PAGES[tab] ?? GeneralPage

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  const handleBack = (): void => {
    closeSettings()
    onBack?.()
  }

  return (
    <main className="flex min-h-0 flex-1 select-text overflow-hidden">
      <nav
        aria-label="Settings navigation"
        className="flex w-[clamp(164px,18vw,248px)] shrink-0 flex-col border-r border-white/[0.08] px-2.5 pb-4 pt-3"
      >
        <button
          type="button"
          onClick={handleBack}
          className="mb-3 inline-flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </button>

        <div className="slim-scroll -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.title} className={idx > 0 ? 'mt-4' : undefined}>
              <p className="mb-1 flex h-6 items-center px-2 text-[11.5px] text-muted-foreground">
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

      <div ref={scroller} className="slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-6">
        <div className="mx-auto w-full max-w-[min(820px,100%)]">
          <Page />
        </div>
      </div>
    </main>
  )
}
