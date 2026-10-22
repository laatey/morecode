import React, { useState } from 'react'
import { Check, ChevronRight, ChevronsUpDown, CircleHelp, LifeBuoy, LogOut, Plus, Rocket, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/features/auth/auth-store'
import type { Account } from '@/features/auth/auth-service'
import { getPlan } from '@/features/billing/plans'
import { useSettings } from '@/features/settings/settings-store'
import { comboParts, useBindings } from '@/features/settings/shortcuts'
import { KeyChip } from '@/features/ai-assistant/panels/ui'
import { cn } from '@/lib/utils'

const initials = (a: Account): string =>
  a.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || a.email[0]?.toUpperCase() || '?'

const Avatar = ({ account, size = 24 }: { account: Account; size?: number }): React.JSX.Element => (
  <span
    className="flex shrink-0 items-center justify-center rounded-full bg-[#3b82f6]/25 font-medium text-[#a3c8ff]"
    style={{ width: size, height: size, fontSize: size * 0.42 }}
  >
    {initials(account)}
  </span>
)

const Row = ({
  icon,
  children,
  right,
  onClick,
  danger
}: {
  icon: React.ReactNode
  children: React.ReactNode
  right?: React.ReactNode
  onClick: () => void
  danger?: boolean
}): React.JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex h-[28px] w-full cursor-pointer items-center gap-2 rounded-[5px] px-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none',
      danger ? 'text-[#f0746c]' : 'text-[#e2e2e0]'
    )}
  >
    <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5', danger ? 'text-[#f0746c]' : 'text-[#a8a8a6]')}>{icon}</span>
    <span className="flex-1 truncate">{children}</span>
    {right}
  </button>
)

/** The account button at the bottom of the left sidebar, and the card it opens. */
export function ProfileMenu(): React.JSX.Element | null {
  const { account, others, signOut, switchTo, openPlanDialog, startTour, messagesLeft } = useAuth()
  const { openSettings } = useSettings()
  const bindings = useBindings()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  if (!account) return null
  const plan = getPlan(account.plan)
  const used = account.sentToday
  const pct = account.apiKey ? 0 : Math.min(100, (used / plan.dailyMessages) * 100)
  const close = (): void => {
    setOpen(false)
    setSwitching(false)
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="profile"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Avatar account={account} size={22} />
          <span className="truncate">{account.name}</span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="app-no-drag w-[220px] rounded-[8px] border-white/[0.1] bg-[#262625] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
          <Avatar account={account} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium leading-tight text-[#ececea]">{account.name}</p>
            <p className="truncate text-[11px] leading-tight text-[#8d8d8a]">{account.email}</p>
          </div>
        </div>

        <div className="mx-1 mb-1 rounded-[6px] bg-white/[0.04] px-2 py-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#ececea]">{account.apiKey ? 'Your own API key' : `${plan.name} plan`}</span>
            <span className="text-[#8d8d8a]">
              {account.apiKey ? 'No limit' : `${Math.max(0, messagesLeft)} messages left`}
            </span>
          </div>
          {!account.apiKey && (
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.1]">
              <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-[#e5584f]' : 'bg-[#3b82f6]')} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {switching ? (
          <div>
            <p className="px-1.5 pb-0.5 pt-0.5 text-[10.5px] text-[#77776f]">Switch to</p>
            {[account, ...others].map((a, i) => (
              <React.Fragment key={a.id}>
                {i > 0 && <div className="my-0.5 h-px bg-white/[0.08]" />}
                <button
                  type="button"
                  onClick={() => {
                    if (a.id === account.id) return close()
                    void switchTo(a.id).then(() => toast(`Switched to ${a.name}`))
                    close()
                  }}
                  className="flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-[5px] px-1.5 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <Avatar account={a} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] text-[#ececea]">{a.name}</span>
                    <span className="block truncate text-[10.5px] text-[#8d8d8a]">{a.email}</span>
                  </span>
                  {a.id === account.id && <Check className="h-3.5 w-3.5 text-[#5aa6ff]" />}
                </button>
              </React.Fragment>
            ))}
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                void signOut().then(() => toast('Sign in with another account. This one stays in the list.'))
              }}
            >
              Add another account
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row icon={<ChevronRight className="h-3.5 w-3.5 rotate-180" />} onClick={() => setSwitching(false)}>
              Back
            </Row>
          </div>
        ) : (
          <div>
            <Row
              icon={<Rocket className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                openPlanDialog('upgrade')
              }}
            >
              {account.plan === 'free' ? 'Upgrade plan' : 'Change plan'}
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row
              icon={<Settings className="h-3.5 w-3.5" />}
              right={
                <span className="flex gap-0.5">
                  {comboParts(bindings.settings).map((k, i) => (
                    <KeyChip key={`${k}${i}`}>{k}</KeyChip>
                  ))}
                </span>
              }
              onClick={() => {
                close()
                openSettings('general')
              }}
            >
              Settings
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row icon={<ChevronsUpDown className="h-3.5 w-3.5" />} right={<ChevronRight className="h-3 w-3 text-[#77776f]" />} onClick={() => setSwitching(true)}>
              Switch account
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row
              icon={<LifeBuoy className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                openSettings('about')
              }}
            >
              Help and what’s new
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row
              icon={<CircleHelp className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                setTimeout(startTour, 150)
              }}
            >
              Take the tour
            </Row>
            <div className="my-0.5 h-px bg-white/[0.08]" />
            <Row
              danger
              icon={<LogOut className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                void signOut()
              }}
            >
              Sign out
            </Row>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
