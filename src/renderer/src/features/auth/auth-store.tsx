import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadBillingConfig } from '../billing/prices'
import { getPlan, type PlanId } from '../billing/plans'
import { dayKey, rollDay } from '../billing/usage'
import { workspaceKey } from '@/lib/storage-keys'
import { defaultAuthService } from './http-auth-service'
import {
  EMPTY_BILLING,
  type Account,
  type AuthService,
  type Card,
  type Project
} from './auth-service'

export type PlanDialogReason = 'upgrade' | 'limit'

interface AuthApi {
  /** 'loading' only on the first frame while the saved session is read. */
  status: 'loading' | 'signed-out' | 'signed-in'
  service: AuthService
  account: Account | null
  /** Other signed-in accounts on this computer, for "switch account". */
  others: Account[]
  /** Use this account after a successful sign in or sign up. */
  setSession: (a: Account) => void
  update: (patch: Partial<Account>) => Promise<void>
  signOut: () => Promise<void>
  switchTo: (id: string) => Promise<void>
  /** Remember a project and make it the current one. */
  openProject: (p: Project) => Promise<void>
  /** Messages left today on the current plan (Infinity when using your own key). */
  messagesLeft: number
  /** Count one sent message. Returns false (and opens the limit dialog) when none are left. */
  spendMessage: () => boolean
  /** Re-read the plan and today's count from the server (the server's count is the one that is enforced). */
  refreshAccount: () => void
  planDialog: PlanDialogReason | null
  openPlanDialog: (reason?: PlanDialogReason) => void
  closePlanDialog: () => void
  /** Choose a plan. Paid plans also record a card (if given) and an invoice. */
  choosePlan: (
    id: PlanId,
    extra?: { yearly?: boolean; card?: Card; patch?: Partial<Account> }
  ) => Promise<void>
  /** Take an account the server just sent (after a payment, say) as the current one. Nothing is sent back. */
  applyAccount: (a: Account) => void
  /**
   * Stop paying for a plan. With real payments the plan keeps working until the end of the period already
   * paid for; with the demo it drops to Free at once.
   */
  cancelPlan: () => Promise<void>
  /** Remove the account, its saved chats and its sign-in. */
  deleteAccount: () => Promise<void>
  tourOpen: boolean
  startTour: () => void
  endTour: () => Promise<void>
}

const Ctx = createContext<AuthApi | null>(null)

export function AuthProvider({
  service = defaultAuthService,
  children
}: {
  service?: AuthService
  children: React.ReactNode
}): React.JSX.Element {
  const [status, setStatus] = useState<AuthApi['status']>('loading')
  const [account, setAccount] = useState<Account | null>(null)
  const [others, setOthers] = useState<Account[]>([])
  const [planDialog, setPlanDialog] = useState<PlanDialogReason | null>(null)
  const [tourOpen, setTourOpen] = useState(false)
  // the newest account, so two changes in a row (a payment arriving, then "onboarded") build on each other
  const latest = useRef<Account | null>(null)
  useEffect(() => {
    latest.current = account
  }, [account])

  useEffect(() => {
    void service.restore().then((r) => {
      setAccount(r.current ? rollDay(r.current) : null)
      setOthers(r.others)
      setStatus(r.current ? 'signed-in' : 'signed-out')
    })
  }, [service])

  // a payment confirmed (or a plan that ended) while the app was in the background shows up when you come back
  useEffect(() => {
    if (!service.hosted || status !== 'signed-in') return
    let last = Date.now()
    const onFocus = (): void => {
      if (Date.now() - last < 30_000) return
      last = Date.now()
      void service.restore().then((r) => r.current && setAccount((now) => (now && now.id === r.current!.id ? rollDay({ ...r.current!, apiKey: now.apiKey }) : now)))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [service, status])

  const applyAccount = useCallback((a: Account) => {
    const next = rollDay({ ...a, apiKey: latest.current?.apiKey ?? a.apiKey })
    latest.current = next
    setAccount(next)
  }, [])

  const setSession = useCallback((a: Account) => {
    setAccount(rollDay(a))
    setOthers((o) => o.filter((x) => x.id !== a.id))
    setStatus('signed-in')
  }, [])

  const update = useCallback(
    async (patch: Partial<Account>) => {
      const current = latest.current
      if (!current) return
      const next = { ...current, ...patch }
      latest.current = next
      setAccount(next)
      await service.save(next)
    },
    [service]
  )

  const signOut = useCallback(async () => {
    await service.signOut()
    if (account) setOthers((o) => [account, ...o.filter((x) => x.id !== account.id)])
    setAccount(null)
    setStatus('signed-out')
    setPlanDialog(null)
    setTourOpen(false)
  }, [account, service])

  const switchTo = useCallback(
    async (id: string) => {
      const next = await service.switchTo(id)
      setOthers((o) => [...(account ? [account] : []), ...o.filter((x) => x.id !== id)])
      setAccount(rollDay(next))
      setStatus('signed-in')
    },
    [account, service]
  )

  const openProject = useCallback(
    async (p: Project) => {
      if (!account) return
      // The project shown in the sidebar and the desktop command/file workspace must be one thing.
      // Previously this only changed account metadata, leaving agents in whichever old folder was
      // last selected in the native dialog.
      if (p.path && window.api?.workspace?.open) await window.api.workspace.open(p.path)
      const recents = [
        p,
        ...account.recents.filter((r) => r.path !== p.path || r.name !== p.name)
      ].slice(0, 6)
      await update({ project: p, recents })
    },
    [account, update]
  )

  // The count shown after a send is an instant estimate. Once a run has finished the server's own count replaces it,
  // so the two cannot drift apart. Several calls close together make one request.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshAccount = useCallback((): void => {
    if (!service.hosted) return
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      void service.restore().then(
        (r) =>
          r.current &&
          setAccount((now) =>
            now && now.id === r.current!.id ? rollDay({ ...r.current!, apiKey: now.apiKey }) : now
          )
      )
    }, 1500)
  }, [service])

  const messagesLeft =
    !account || account.apiKey
      ? Infinity
      : Math.max(0, getPlan(account.plan).dailyMessages - account.sentToday)

  const spendMessage = useCallback((): boolean => {
    if (!account) return true
    if (messagesLeft <= 0) {
      setPlanDialog('limit')
      return false
    }
    const today = dayKey()
    void update({
      sentToday: account.sentToday + 1,
      sentDate: today,
      usage: { ...account.usage, [today]: (account.usage?.[today] ?? 0) + 1 }
    })
    return true
  }, [account, messagesLeft, update])

  const cancelPlan = useCallback(async () => {
    if (!account) return
    if (service.billing && (await loadBillingConfig()).billing === 'paystack') {
      setAccount(rollDay({ ...(await service.billing.cancel()), apiKey: account.apiKey }))
      return
    }
    const billing = account.billing ?? EMPTY_BILLING
    await update({ plan: 'free', sentToday: 0, billing: { ...billing, renews: null } })
  }, [account, service, update])

  const choosePlan = useCallback(
    async (id: PlanId, extra?: { yearly?: boolean; card?: Card; patch?: Partial<Account> }) => {
      if (!account) return
      const plan = getPlan(id)
      const billing = account.billing ?? EMPTY_BILLING
      if (id === 'free') {
        if (account.plan !== 'free') {
          if (extra?.patch) await update(extra.patch)
          return cancelPlan()
        }
        await update({ ...extra?.patch, plan: id, sentToday: 0, billing: { ...billing, renews: null } })
        return
      }
      const yearly = Boolean(extra?.yearly)
      const price = yearly ? plan.yearly : plan.monthly
      const now = Date.now()
      const stamp = new Date(now).toISOString().slice(0, 7).replace('-', '')
      await update({
        ...extra?.patch,
        plan: id,
        sentToday: 0,
        billing: {
          card: extra?.card ?? billing.card,
          yearly,
          renews: now + (yearly ? 365 : 30) * 86_400_000,
          invoices: [
            {
              id: `INV-${stamp}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
              date: now,
              description: `${plan.name} plan, ${yearly ? 'billed yearly' : 'billed monthly'}`,
              amount: yearly ? price * 12 : price
            },
            ...billing.invoices
          ]
        }
      })
    },
    [account, update, cancelPlan]
  )

  const deleteAccount = useCallback(async () => {
    if (!account) return
    await service.deleteAccount(account.id)
    try {
      localStorage.removeItem(workspaceKey(account.id))
    } catch {
      // storage blocked: nothing to remove
    }
    setAccount(null)
    setStatus('signed-out')
    setPlanDialog(null)
    setTourOpen(false)
  }, [account, service])

  const endTour = useCallback(async () => {
    setTourOpen(false)
    if (account && !account.tourSeen) await update({ tourSeen: true })
  }, [account, update])

  const value = useMemo<AuthApi>(
    () => ({
      status,
      service,
      account,
      others,
      setSession,
      update,
      signOut,
      switchTo,
      openProject,
      messagesLeft,
      spendMessage,
      refreshAccount,
      choosePlan,
      applyAccount,
      cancelPlan,
      deleteAccount,
      planDialog,
      openPlanDialog: (reason = 'upgrade') => setPlanDialog(reason),
      closePlanDialog: () => setPlanDialog(null),
      tourOpen,
      startTour: () => setTourOpen(true),
      endTour
    }),
    [
      status,
      service,
      account,
      others,
      setSession,
      update,
      signOut,
      switchTo,
      openProject,
      messagesLeft,
      spendMessage,
      refreshAccount,
      choosePlan,
      applyAccount,
      cancelPlan,
      deleteAccount,
      planDialog,
      tourOpen,
      endTour
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
