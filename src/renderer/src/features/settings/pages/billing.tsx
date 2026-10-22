import React, { useState } from 'react'
import { CreditCard, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Bar, limitTone } from '@/features/ai-assistant/panels/ui'
import { useAuth } from '@/features/auth/auth-store'
import { errorText } from '@/features/auth/ui'
import { EMPTY_BILLING, type Invoice } from '@/features/auth/auth-service'
import { toCard, validateCard } from '@/features/billing/card'
import { getPlan } from '@/features/billing/plans'
import { money, priceOf, useBillingConfig } from '@/features/billing/prices'
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
            toast('Payment method saved')
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
      {error && <p className="text-[12.5px] text-[#f4a39e]">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-[#77776f]">Demo only. Just the brand and last four digits are kept.</p>
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
  const { account, service, update, openPlanDialog, cancelPlan, messagesLeft } = useAuth()
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
  const peak = Math.max(1, ...history.map((d) => d.count), plan.dailyMessages > 100 ? 0 : plan.dailyMessages)
  const used = account.sentToday
  const pct = account.apiKey ? 0 : Math.min(100, (used / plan.dailyMessages) * 100)
  const price = priceOf(cfg, account.plan, billing.yearly)

  const changeCard = (): void => {
    if (!service.billing) return
    setCardBusy(true)
    service.billing
      .cardLink()
      .then((url) => window.open(url, '_blank'))
      .catch((e) => toast(errorText(e)))
      .finally(() => setCardBusy(false))
  }
  return (
    <Page title="Usage and billing">
      <Group title="Plan">
        <Row
          title={`${plan.name}${account.apiKey ? ' with your own API key' : ''}`}
          description={
            plan.id === 'free'
              ? 'Free forever. Upgrade for more messages and every model.'
              : billing.cancelling && billing.renews
                ? `Cancelled. You keep ${plan.name} until ${date(billing.renews)}, then you are on Free.`
                : `${money(price, currency)} a month${billing.yearly ? ', billed yearly' : ''}${billing.renews ? `. Renews ${date(billing.renews)}.` : '.'}`
          }
        >
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
                : 'You go back to Free right away, with 25 messages a day.'
            }
            button="Cancel plan"
            confirmLabel="Yes, cancel"
            onConfirm={async () => {
              try {
                await cancelPlan()
                toast(real ? 'Cancelled. Your plan stays until the end of the period.' : 'You’re on Free')
              } catch (e) {
                toast(errorText(e))
              }
            }}
          />
        )}
      </Group>

      <Group title="Messages">
        <div className="space-y-2 py-3.5">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-[#ececea]">Today</span>
            <span className="text-[#8d8d8a]">
              {account.apiKey ? `${used} sent, no limit` : `${used} of ${plan.dailyMessages} used, ${messagesLeft} left`}
            </span>
          </div>
          {!account.apiKey && <Bar percent={pct} tone={limitTone(pct)} label="Messages used today" />}
        </div>
        <div className="py-3.5">
          <div className="mb-2 text-[12.5px] text-[#8d8d8a]">Last 14 days</div>
          <div className="flex h-[72px] items-end gap-1" role="img" aria-label="Messages sent each day for the last 14 days">
            {history.map((d) => (
              <div key={d.key} className="flex h-full flex-1 items-end" title={`${d.label}: ${d.count} messages`}>
                <div
                  className={d.today ? 'w-full rounded-[3px] bg-[#3b82f6]' : 'w-full rounded-[3px] bg-white/[0.18]'}
                  style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-[#77776f]">
            <span>{history[0].label}</span>
            <span>Today</span>
          </div>
        </div>
      </Group>

      <Group title="Payment method">
        {real ? (
          billing.card ? (
            <Row icon={<CreditCard className="h-4 w-4 text-[#a8a8a6]" />} title={`${billing.card.brand} ending ${billing.card.last4}`} description={`Expires ${billing.card.exp}`}>
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
            icon={<CreditCard className="h-4 w-4 text-[#a8a8a6]" />}
            title={`${billing.card.brand} ending ${billing.card.last4}`}
            description={`Expires ${billing.card.exp}`}
          >
            <Btn onClick={() => setEditingCard(true)}>Replace</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                void update({ billing: { ...billing, card: null } }).then(() => toast('Card removed'))
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

      <Group title="Invoices">
        {billing.invoices.length === 0 ? (
          <p className="py-3 text-[12.5px] text-[#8d8d8a]">No invoices yet. They appear here after your first payment.</p>
        ) : (
          billing.invoices.map((inv) => (
            <Row key={inv.id} title={inv.description} description={`${date(inv.date)} · ${inv.id}`}>
              <span className="text-[13px] tabular-nums text-[#c9c9c6]">{money(inv.amount, inv.currency ?? 'USD')}</span>
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
