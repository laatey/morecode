import React, { useSyncExternalStore } from 'react'
import { Copy } from '@/components/icons'
import { toast } from 'sonner'
import { Tip } from '@/components/tooltip'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-store'
import { getPlan } from '@/features/billing/plans'
import { getUsageVersion, subscribeUsage } from '@/features/billing/usage-log'
import { getUsageSnapshot } from './usage-data'
import { modelName } from '../models'
import type { PanelContext } from './panel-shell'
import { Bar, limitTone, PanelFrame } from './ui'

function Limit({
  label,
  resets,
  percent
}: {
  label: string
  resets: string
  percent: number
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-[12.5px]">
        <span className="text-[#ececea]">{label}</span>
        <span className="flex-1 text-right text-[11.5px] text-[#8d8d8a]">{resets}</span>
        <span
          className={cn(
            'w-9 text-right tabular-nums',
            percent >= 90 ? 'text-[#f0746c]' : 'text-[#ececea] font-medium'
          )}
        >
          {percent}%
        </span>
      </div>
      <Bar percent={percent} tone={limitTone(percent)} label={label} />
    </div>
  )
}

export function UsagePanel({
  ctx,
  onClose
}: {
  ctx: PanelContext
  onClose: () => void
}): React.JSX.Element {
  const { account, openPlanDialog, messagesLeft } = useAuth()
  useSyncExternalStore(subscribeUsage, getUsageVersion) // refresh while the AI works
  const u = getUsageSnapshot(account, modelName(ctx.model))

  const copy = (): void => {
    const text = [
      ...u.limits.map((l) => `${l.label}: ${l.percent}% (${l.resets})`),
      `Requests this session: ${u.session.requests}`,
      ...u.breakdown.map((b) => `${b.label}: ${b.value}`)
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => toast.success('Usage copied'))
  }

  return (
    <PanelFrame
      title="Usage"
      onClose={onClose}
      actions={
        <Tip label="Copy summary" side="top">
          <button
            type="button"
            aria-label="Copy summary"
            onClick={copy}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </Tip>
      }
    >
      <div className="space-y-3.5">
        {u.limitsNote && <p className="text-[12.5px] leading-5 text-[#8d8d8a]">{u.limitsNote}</p>}
        {u.limits.map((l) => (
          <Limit key={l.id} label={l.label} resets={l.resets} percent={l.percent} />
        ))}
      </div>

      {account && (
        <div className="mt-4 flex items-center justify-between rounded-[8px] border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
          <div className="text-[12.5px]">
            <span className="text-[#ececea]">
              {account.apiKey ? 'Your own API key' : `${getPlan(account.plan).name} plan`}
            </span>
            <span className="ml-2 text-[11.5px] text-[#8d8d8a]">
              {account.apiKey ? 'No daily limit' : `${messagesLeft} messages left today`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose()
              openPlanDialog('upgrade')
            }}
            className="cursor-pointer rounded-[6px] bg-white/[0.07] px-2.5 py-1 text-[12px] text-[#ececea] transition-colors hover:bg-white/[0.12]"
          >
            {account.plan === 'free' ? 'Upgrade' : 'Change plan'}
          </button>
        </div>
      )}

      <section className="mt-5">
        <h3 className="mb-2 text-[12.5px] font-medium text-[#ececea]">This session</h3>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5 border-y border-white/[0.07] py-2.5 text-[12px]">
          <Metric label="Requests" value={u.session.requests} />
          <Metric label="API" value={u.session.apiTime} />
          <Metric label="Active" value={u.session.activeTime} />
          <Metric
            label="Lines"
            value={
              <>
                <span className="text-[var(--diff-add)]">+{u.session.added}</span>{' '}
                <span className="text-[var(--diff-del)]">−{u.session.removed}</span>
              </>
            }
          />
          <Metric label={u.session.modelName} value={`${u.session.modelShare}%`} />
          <Metric label="Cache hit" value={`${u.session.cacheHit}%`} />
        </dl>
      </section>

      <section className="mt-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[12.5px] font-medium text-[#ececea]">Breakdown</h3>
          <span className="text-[11.5px] text-[#8d8d8a]">{u.session.modelName}</span>
        </div>
        <table className="mt-1 w-full text-[12px]">
          <tbody>
            {u.breakdown.map((b) => (
              <tr key={b.label} className="border-b border-white/[0.06] last:border-b-0">
                <td className="py-1.5 text-[#8d8d8a]">
                  <Tip label={b.hint} side="left">
                    <span className="cursor-default">{b.label}</span>
                  </Tip>
                </td>
                <td className="py-1.5 text-right tabular-nums text-[#d6d6d3]">{b.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-5">
        <h3 className="text-[12.5px] font-medium text-[#ececea]">What’s using your limits?</h3>
        <p className="mt-1 text-[11.5px] leading-4 text-[#77776f]">This session · this computer only</p>
        <ul className="mt-2 space-y-1.5">
          {u.drivers.length === 0 && (
            <li className="text-[12.5px] text-[#8d8d8a]">Nothing yet. Send a message and this fills in.</li>
          )}
          {u.drivers.map((d) => (
            <li key={d.id} className="flex items-baseline gap-2.5 text-[12.5px]">
              <span className="w-9 shrink-0 tabular-nums text-[#ececea]">{d.percent}%</span>
              <Tip label={d.hint} side="top" align="start">
                <span className="cursor-help text-[#c9c9c6] underline decoration-dotted decoration-white/30 underline-offset-[3px]">
                  {d.label}
                </span>
              </Tip>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-5 rounded-[8px] border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
        <div className="text-[11.5px] font-medium text-[#ececea]">Tip</div>
        <p className="mt-0.5 text-[12px] leading-[18px] text-[#8d8d8a]">{u.tip}</p>
      </div>
    </PanelFrame>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[#8d8d8a]">{label}</dt>
      <dd className="tabular-nums text-[#d6d6d3]">{value}</dd>
    </div>
  )
}
