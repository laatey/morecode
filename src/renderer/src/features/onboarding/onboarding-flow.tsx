import React, { useState } from 'react'
import { ArrowLeft, Check, Code2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell, Heading } from '@/features/auth/auth-layout'
import { useAuth } from '@/features/auth/auth-store'
import type { Experience } from '@/features/auth/auth-service'
import { Submit, TextLink } from '@/features/auth/ui'
import { PlanPicker } from '@/features/billing/plan-picker'
import { getPlan } from '@/features/billing/plans'
import { cn } from '@/lib/utils'
import { ProjectPicker } from './project-picker'

const LEVELS: { id: Experience; title: string; body: string; sample: string }[] = [
  {
    id: 'new',
    title: 'I’m new to coding',
    body: 'Plain language and small steps.',
    sample: 'I changed how the button moves so it stops cleanly instead of bouncing. You can try it in the Browser tab.'
  },
  {
    id: 'some',
    title: 'I know some',
    body: 'A short explanation with the key details.',
    sample: 'Replaced the back-out easing with ease-out and clamped the result, so the grid snap no longer overshoots.'
  },
  {
    id: 'pro',
    title: 'I code for a living',
    body: 'Brief and technical. Just the change.',
    sample: 'easeOutBack → easeOutQuart in animateTo(); clamped t to [0,1]. Types and lint pass.'
  }
]

const STEPS = ['About you', 'Project', 'Plan'] as const

function Steps({ index }: { index: number }): React.JSX.Element {
  return (
    <ol className="mb-8 flex items-center gap-3" aria-label="Setup progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-3" aria-current={i === index ? 'step' : undefined}>
          <span
            className={cn(
              'grid h-6 w-6 place-items-center rounded-full text-[12px] tabular-nums transition-colors',
              i < index && 'bg-[#3fb950]/20 text-[#5fd17a]',
              i === index && 'bg-[#3b82f6] text-white',
              i > index && 'bg-white/[0.07] text-[#77776f]'
            )}
          >
            {i < index ? <Check className="h-3 w-3 stroke-[3]" /> : i + 1}
          </span>
          <span className={cn('text-[13px]', i === index ? 'text-[#ececea]' : 'text-[#77776f]')}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-8 bg-white/[0.1]" />}
        </li>
      ))}
    </ol>
  )
}

function AboutYou({ onNext }: { onNext: () => void }): React.JSX.Element {
  const { account, update } = useAuth()
  const [level, setLevel] = useState<Experience>(account?.profile?.experience ?? 'some')
  const sample = LEVELS.find((l) => l.id === level)?.sample

  const next = (): void => {
    void update({ profile: { goals: account?.profile?.goals ?? [], experience: level } })
    onNext()
  }

  return (
    <>
      <Heading title={`Nice to meet you${account?.name ? `, ${account.name.split(' ')[0]}` : ''}`}>
        One quick question so MoreCode talks to you the right way.
      </Heading>

      <section aria-labelledby="level" className="mb-7">
        <h2 id="level" className="mb-2.5 text-[14px] font-medium">
          How much coding do you know?
        </h2>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={level === l.id}
              onClick={() => setLevel(l.id)}
              className={cn(
                'cursor-pointer rounded-[10px] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50',
                level === l.id ? 'border-[#3b82f6]/70 bg-[#3b82f6]/[0.08]' : 'border-white/[0.09] hover:border-white/[0.18] hover:bg-white/[0.04]'
              )}
            >
              <span className="block text-[13.5px] text-[#ececea]">{l.title}</span>
              <span className="block text-[12.5px] text-[#8d8d8a]">{l.body}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-[10px] bg-white/[0.04] p-3.5" aria-live="polite">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] text-[#77776f]">
            <Code2 className="h-3.5 w-3.5" /> How the AI will explain a change
          </p>
          <p className="text-[13.5px] leading-6 text-[#c9c9c6]">{sample}</p>
        </div>
      </section>

      <div className="flex justify-end">
        <div className="w-40">
          <Submit type="button" onClick={next}>
            Continue
          </Submit>
        </div>
      </div>
    </>
  )
}

function ProjectStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }): React.JSX.Element {
  const { openProject } = useAuth()
  return (
    <>
      <Heading title="Where will you work?">
        MoreCode reads and edits files in one folder, and nowhere else.
      </Heading>
      <ProjectPicker
        onPick={(p) => {
          void openProject(p).then(onNext)
        }}
      />
      <div className="mt-6 flex items-center justify-between">
        <TextLink className="inline-flex items-center gap-1.5 text-[13px] text-[#8d8d8a]" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </TextLink>
        <TextLink className="text-[13px]" onClick={onNext}>
          Skip for now
        </TextLink>
      </div>
    </>
  )
}

function PlanStep({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { update, choosePlan } = useAuth()
  const finish = (patch: Parameters<typeof update>[0]): void => {
    void update({ ...patch, onboarded: true })
  }
  return (
    <>
      <Heading title="Pick how you’ll use it">
        Start free and change this any time from your profile.
      </Heading>
      <PlanPicker
        compact
        onChosen={(id, extra) => {
          toast(`You’re on ${getPlan(id).name}`)
          void choosePlan(id, { ...extra, patch: { onboarded: true } })
        }}
        onPaid={(id) => {
          toast(`You’re on ${getPlan(id).name}`)
          void update({ onboarded: true })
        }}
        onKey={(key) => {
          toast('API key saved')
          finish({ apiKey: key })
        }}
      />
      <div className="mt-6">
        <TextLink className="inline-flex items-center gap-1.5 text-[13px] text-[#8d8d8a]" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </TextLink>
      </div>
    </>
  )
}

/** Three setup steps shown once, right after the first sign-in. */
export function OnboardingFlow(): React.JSX.Element {
  const [step, setStep] = useState(0)
  return (
    <AuthShell showcase={false} wide>
      <Steps index={step} />
      {step === 0 && <AboutYou onNext={() => setStep(1)} />}
      {step === 1 && <ProjectStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <PlanStep onBack={() => setStep(1)} />}
    </AuthShell>
  )
}
