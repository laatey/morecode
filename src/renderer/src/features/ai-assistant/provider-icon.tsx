import React from 'react'
import {
  Activity,
  BookOpen,
  Clock,
  Database,
  Eye,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  Lightbulb,
  Mail,
  Pencil,
  ShieldCheck,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import type { Step } from './types'

export { type Step }
// eslint-disable-next-line react-refresh/only-export-components
export const stepText = (s: Step): string => (typeof s === 'string' ? s : s.text)

const files = {
  ...import.meta.glob('../../assets/stack/*.svg', { eager: true, import: 'default' }),
  ...import.meta.glob('../../assets/providers/*.svg', { eager: true, import: 'default' })
} as Record<string, string>

const logos: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path
      .split('/')
      .pop()!
      .replace(/\.svg$/, ''),
    url
  ])
)

const MONOCHROME = new Set(['resend', 'openai', 'anthropic'])

const GENERIC: Record<string, LucideIcon> = {
  activity: Activity,
  'book-open': BookOpen,
  clock: Clock,
  database: Database,
  gauge: Gauge,
  globe: Globe,
  'key-round': KeyRound,
  layers: Layers,
  mail: Mail,
  'shield-check': ShieldCheck,
  'user-round': UserRound
}

const SIZE = 'h-3.5 w-3.5 shrink-0'

export function StepIcon({ step }: { step: Step }): React.JSX.Element {
  const icon = typeof step === 'string' ? null : (step.icon ?? null)

  if (icon?.startsWith('lucide:')) {
    const Generic = GENERIC[icon.slice(7)]
    if (Generic) return <Generic className={SIZE} />
  } else if (icon && logos[icon]) {
    const url = logos[icon]
    if (MONOCHROME.has(icon)) {
      return (
        <span
          aria-hidden
          className={`${SIZE} inline-block bg-current`}
          style={{
            WebkitMaskImage: `url(${url})`,
            maskImage: `url(${url})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center'
          }}
        />
      )
    }
    return <img src={url} alt="" className={`${SIZE} object-contain`} />
  }

  const text = stepText(step)
  const Fallback = /^(read|review|look|check|fetch|inspect|scan)/i.test(text)
    ? Eye
    : /^(writ|edit|creat|delet|updat|chang|modif|apply|generat|remov)/i.test(text)
      ? Pencil
      : Lightbulb

  return <Fallback className={`${SIZE} text-muted-foreground`} />
}
