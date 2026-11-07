import React, { useState } from 'react'
import { CreditCard, Download } from '@/components/icons'
import { toast } from 'sonner'
import { Bar, limitTone } from '@/features/ai-assistant/panels/ui'
import { useAuth } from '@/features/auth/auth-store'
import { errorText } from '@/features/auth/ui'
import { EMPTY_BILLING, type Invoice } from '@/features/auth/auth-service'
import { toCard, validateCard } from '@/features/billing/card'
import { getPlan } from '@/features/billing/plans'
import { money, priceOf, useBillingConfig } from '@/features/billing/prices'
import { LIMIT_LABEL, resetsIn, windowOf } from '@/features/billing/limits'
import { getUsageHistory } from '@/features/billing/usage'
import { Btn, DangerRow, Group, Page, Row, TextInput } from '../kit'
import { useSettings } from '../settings-store'

const date = (t: number): string => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function downloadReceipt(inv: Invoice, email: string): void {
  const text = [
    'MoreCode receipt',
    '',
    `Invoice: ${inv.id}`,
    `Date: ${date(inv.date)}`,
    `Billed to: ${email}`,
    `Item: ${inv.description}`,
    `Total: ${inv.currency ? `${inv.amount.toFixed(2)} ${inv.currency}` : `$${inv.amount.toFixed(2)} USD`}`,
    ''
  ].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = `${inv.id}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

function CardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }): React.JSX.Element {
  const { account, update } = useAuth()
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!account) return <></>
  return (
    <form
      className="space-y-3 py-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        const problem = validateCard(number, expiry, cvc)
        if (problem) return setError(problem)
        setError(null)
        setBusy(true)
        const billing = account.billing ?? EMPTY_BILLING
        setTimeout(() => {
          void update({ billing: { ...billing, card: toCard(number, expiry) } }).then(() => {
            toast.success('Payment method saved')
            onDone()
          })
        }, 700)
      }}
    >
      <TextInput
        aria-label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        autoFocus
        placeholder="1234 5678 9012 3456"
        value={number}
        onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          aria-label="Expiry"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/YY"
          value={expiry}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 4)
            setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
          }}
        />
        <TextInput
          aria-label="Security code"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder="Security code"
          value={cvc}
          onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </div>
      {error && <p className="text-[12.5px] text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-faint-foreground">Demo only. Just the brand and last four digits are kept.</p>
        <div className="flex gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" type="submit" busy={busy}>
            Save card
          </Btn>
        </div>
      </div>
    </form>
  )
}

export function BillingPage(): React.JSX.Element {
  const { account, service, update, openPlanDialog, cancelPlan } = useAuth()
  const { closeSettings } = useSettings()
  const { cfg } = useBillingConfig()
  const [editingCard, setEditingCard] = useState(false)
  const [cardBusy, setCardBusy] = useState(false)
  if (!account) return <></>
  const plan = getPlan(account.plan)
  const billing = account.billing ?? EMPTY_BILLING
  const real = cfg.billing === 'paystack' // real payments: the card is handled by Paystack, never typed here
  const currency = billing.currency ?? cfg.currency
  const history = getUsageHistory(account)
  const peak = Math.max(1, ...history.map((d) => d.count))
  const hasHistory = history.some((d) => d.count > 0)
  const off = cfg.billing === 'off' // no payments, or no AI behind them: nothing can be bought
  const session = windowOf(account, 'session')
  const week = windowOf(account, 'week')
  const price = priceOf(cfg, account.plan, billing.yearly)

  const changeCard = (): void => {
    if (!service.billing) return
    setCardBusy(true)
    service.billing
      .cardLink()
      .then((url) => window.open(url, '_blank'))
      .catch((e) => toast.error(errorText(e)))
      .finally(() => setCardBusy(false))
  }
  return (
    <Page title="Usage and billing">
      <Group title="Plan">
        <Row
          title={`${plan.name}${account.apiKey ? ' with your own API key' : ''}`}
          description={
            plan.id === 'free'
              ? off
              ? 'Free forever. Paid plans are not available yet.'
              : 'Free forever. Upgrade for higher limits and every model.'
              : billing.cancelling && billing.renews
                ? `Cancelled. You keep ${plan.name} until ${date(billing.renews)}, then you are on Free.`
                : `${money(price, currency)} a month${billing.yearly ? ', billed yearly' : ''}${billing.renews ? `. Renews ${date(billing.renews)}.` : '.'}`
          }
        >
          {!off && (
            <Btn
              variant="primary"
              onClick={() => {
                // the plan picker is its own window, so settings steps aside first
                closeSettings()
                setTimeout(() => openPlanDialog('upgrade'), 120)
              }}
            >
              {plan.id === 'free' ? 'Upgrade' : 'Change plan'}
            </Btn>
          )}
        </Row>
        {billing.pastDue && !billing.cancelling && plan.id !== 'free' && (
          <Row title="Your last payment did not go through" description="Your plan keeps working for a few days. Update your card so it can renew.">
            <Btn variant="primary" busy={cardBusy} onClick={changeCard}>
              Update card
            </Btn>
          </Row>
        )}
        {plan.id !== 'free' && !billing.cancelling && (
          <DangerRow
            title="Cancel plan"
            description={
              real && billing.renews
                ? `It stops renewing. You keep ${plan.name} until ${date(billing.renews)}, then go back to Free.`
                : 'You go back to Free right away, with its smaller limits.'
            }
            button="Cancel plan"
            confirmLabel="Yes, cancel"
            onConfirm={async () => {
              try {
                await cancelPlan()
                toast.success(real ? 'Cancelled. Your plan stays until the end of the period.' : 'You’re on Free')
              } catch (e) {
                toast.error(errorText(e))
              }
            }}
          />
        )}
      </Group>

      <Group title="Usage limits">
        {account.apiKey ? (
          <Row title="Your own API key" description="There is no limit here. Your provider bills you directly." />
        ) : session && week ? (
          <div className="space-y-4 py-4">
            {(['session', 'week'] as const).map((kind) => {
              const w = kind === 'session' ? session : week
              return (
                <div key={kind} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-medium text-foreground">{LIMIT_LABEL[kind]}</span>
                    <span className="text-right text-muted-foreground">
                      {w.percent}% used · {resetsIn(w.resetsAt)}
                    </span>
                  </div>
                  <Bar percent={w.percent} tone={limitTone(w.percent)} label={`${LIMIT_LABEL[kind]} used`} />
                </div>
              )
            })}
            <p className="text-[11.5px] leading-5 text-faint-foreground">
              A limit starts with your first message and resets when its time is up. Longer tasks and bigger models use it up faster.
            </p>
          </div>
        ) : (
          <Row title="No limits to show" description="Your usage limits appear here once you are signed in to a MoreCode server." />
        )}
        <div className="py-4">
          <div className="mb-3 flex items-center justify-between text-[12px]">
            <span className="font-medium text-soft-foreground">Usage history</span>
            <span className="text-faint-foreground">Last 14 days</span>
          </div>
          {hasHistory ? (
            <>
              <div className="flex h-[88px] items-end gap-1.5" role="img" aria-label="Messages sent each day for the last 14 days">
                {history.map((d) => (
                  <div key={d.key} className="group flex h-full flex-1 items-end" title={`${d.label}: ${d.count} messages`}>
                    <div
                      className={d.today ? 'w-full rounded-t-[4px] bg-primary' : 'w-full rounded-t-[4px] bg-primary transition-colors group-hover:bg-primary/90'}
                      style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-faint-foreground">
                <span>{history[0].label}</span>
                <span>Today</span>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-muted-foreground">
              Your actual message history will appear here after you start a chat.
            </div>
          )}
        </div>
      </Group>

      {!off && (
      <Group title="Payment method">
        {real ? (
          billing.card ? (
            <Row icon={<CreditCard className="h-4 w-4 text-muted-foreground" />} title={`${billing.card.brand} ending ${billing.card.last4}`} description={`Expires ${billing.card.exp}`}>
              <Btn busy={cardBusy} onClick={changeCard}>
                Update card
              </Btn>
            </Row>
          ) : (
            <Row title="No card on file" description="Your card is saved securely by Paystack when you pay for a plan." />
          )
        ) : editingCard ? (
          <CardForm onDone={() => setEditingCard(false)} onCancel={() => setEditingCard(false)} />
        ) : billing.card ? (
          <Row
            icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
            title={`${billing.card.brand} ending ${billing.card.last4}`}
            description={`Expires ${billing.card.exp}`}
          >
            <Btn onClick={() => setEditingCard(true)}>Replace</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                void update({ billing: { ...billing, card: null } }).then(() => toast.success('Card removed'))
              }}
            >
              Remove
            </Btn>
          </Row>
        ) : (
          <Row title="No card on file" description="Add one to pay for a plan.">
            <Btn onClick={() => setEditingCard(true)}>Add card</Btn>
          </Row>
        )}
      </Group>
      )}

      <Group title="Invoices">
        {billing.invoices.length === 0 ? (
          <p className="py-3 text-[12.5px] text-muted-foreground">No invoices yet. They appear here after your first payment.</p>
        ) : (
          billing.invoices.map((inv) => (
            <Row key={inv.id} title={inv.description} description={`${date(inv.date)} · ${inv.id}`}>
              <span className="text-[13px] tabular-nums text-soft-foreground">{money(inv.amount, inv.currency ?? 'USD')}</span>
              <Btn aria-label={`Download receipt ${inv.id}`} onClick={() => downloadReceipt(inv, account.email)}>
                <Download className="h-3.5 w-3.5" /> Receipt
              </Btn>
            </Row>
          ))
        )}
      </Group>
    </Page>
  )
}
