import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AuthError } from './auth-service'

export const errorText = (e: unknown): string =>
  e instanceof AuthError ? e.message : 'Something went wrong. Please try again.'

/** Counts down from `seconds`; call `restart()` after resending a code. */
export function useCountdown(seconds: number): [number, () => void] {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, () => setLeft(seconds)]
}

const inputClass =
  'h-10 w-full rounded-[8px] border bg-white/[0.04] px-3 text-[14px] text-[#ececea] outline-none transition-colors placeholder:text-[#77776f] focus:bg-white/[0.06]'

export function Field({
  label,
  error,
  hint,
  right,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | null
  hint?: string
  /** Small element on the label row, e.g. "Forgot password?". */
  right?: React.ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] text-[#c9c9c6]">
          {label}
        </label>
        {right}
      </div>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-e` : undefined}
        {...props}
        className={cn(
          inputClass,
          error ? 'border-[#e5584f]/70' : 'border-white/[0.1] focus:border-[#3b82f6]/70',
          props.className
        )}
      />
      {error ? (
        <p id={`${id}-e`} role="alert" className="mt-1.5 text-[12px] text-[#f0746c]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[#77776f]">{hint}</p>
      ) : null}
    </div>
  )
}

/** 0 (empty), 1 (under 8 characters), then 2 to 4. Length matters most; a mix of cases and digits helps. */
export function passwordScore(pw: string): number {
  if (!pw) return 0
  if (pw.length < 8) return 1
  let s = 2
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s++
  return Math.min(4, s)
}

const STRENGTH = [
  ['', ''],
  ['Too short', 'bg-[#e5584f]'],
  ['Okay', 'bg-[#e5a54b]'],
  ['Good', 'bg-[#a3c23f]'],
  ['Strong', 'bg-[#3fb950]']
] as const

export function PasswordField({
  label = 'Password',
  meter,
  error,
  right,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  meter?: boolean
  error?: string | null
  right?: React.ReactNode
}): React.JSX.Element {
  const [shown, setShown] = useState(false)
  const value = String(props.value ?? '')
  const score = passwordScore(value)
  return (
    <div>
      <div className="relative">
        <Field
          {...props}
          label={label}
          right={right}
          error={error}
          type={shown ? 'text' : 'password'}
          className="pr-10"
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown((s) => !s)}
          className={cn(
            'absolute right-2 grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] text-[#8d8d8a] transition-colors hover:bg-white/[0.07] hover:text-[#ececea]',
            // sits on the input itself (below the label row), with or without an error line under it
            'top-[31px]'
          )}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {meter && value && (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= score ? STRENGTH[score][1] : 'bg-white/[0.1]'
                )}
              />
            ))}
          </div>
          <span className="w-14 text-right text-[11.5px] text-[#8d8d8a]">{STRENGTH[score][0]}</span>
        </div>
      )}
    </div>
  )
}

/** Six boxes for an emailed code. Accepts typing, paste, and backspace to go back. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  error
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  error?: boolean
}): React.JSX.Element {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  useEffect(() => refs.current[0]?.focus(), [])

  const set = (next: string): void => {
    const clean = next.replace(/\D/g, '').slice(0, 6)
    onChange(clean)
    if (clean.length === 6) onComplete?.(clean)
    refs.current[Math.min(clean.length, 5)]?.focus()
  }

  return (
    <div
      role="group"
      aria-label="6-digit code"
      className="flex gap-2"
      onPaste={(e) => {
        e.preventDefault()
        set(e.clipboardData.getData('text'))
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1)
            set(value.slice(0, i) + ch + value.slice(i + 1))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault()
              set(value.slice(0, i - 1))
            }
            if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus()
            if (e.key === 'ArrowRight') refs.current[Math.min(5, i + 1)]?.focus()
          }}
          className={cn(
            'h-12 w-full min-w-0 rounded-[8px] border bg-white/[0.04] text-center text-[18px] font-medium tabular-nums text-[#ececea] outline-none transition-colors focus:bg-white/[0.07] disabled:opacity-50',
            error ? 'border-[#e5584f]/70' : 'border-white/[0.1] focus:border-[#3b82f6]/70'
          )}
        />
      ))}
    </div>
  )
}

export function Submit({
  loading,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }): React.JSX.Element {
  return (
    <Button
      size="lg"
      type="submit"
      {...props}
      disabled={loading || props.disabled}
      className={cn('w-full', className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return <Button variant="secondary" size="lg" type="button" {...props} className={cn('w-full', className)} />
}

export function TextLink({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'cursor-pointer text-[#7db1ff] underline-offset-2 transition-colors hover:text-[#a3c8ff] hover:underline focus-visible:outline-none focus-visible:underline disabled:cursor-not-allowed disabled:text-[#77776f] disabled:no-underline',
        className
      )}
    />
  )
}

export function FormError({ children }: { children?: React.ReactNode }): React.JSX.Element | null {
  if (!children) return null
  return (
    <div
      role="alert"
      className="rounded-[8px] border border-[#e5584f]/40 bg-[#e5584f]/10 px-3 py-2 text-[13px] text-[#f4a39e]"
    >
      {children}
    </div>
  )
}

export function Divider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[12px] text-[#77776f]">
      <span className="h-px flex-1 bg-white/[0.09]" />
      {children}
      <span className="h-px flex-1 bg-white/[0.09]" />
    </div>
  )
}

const GoogleMark = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
  </svg>
)

const GitHubMark = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
  </svg>
)

/** "Continue with Google / GitHub". Shows which one is connecting. */
export function SocialButtons({
  busy,
  onPick
}: {
  busy: 'google' | 'github' | null
  onPick: (p: 'google' | 'github') => void
}): React.JSX.Element {
  const items = [
    { id: 'google' as const, label: 'Google', mark: <GoogleMark /> },
    { id: 'github' as const, label: 'GitHub', mark: <GitHubMark /> }
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((p) => (
        <SecondaryButton key={p.id} disabled={busy !== null} onClick={() => onPick(p.id)}>
          {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.mark}
          {busy === p.id ? 'Connecting…' : p.label}
        </SecondaryButton>
      ))}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  children
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-5 text-[#a8a8a6]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-white/[0.25] text-transparent transition-colors peer-checked:border-[#3b82f6] peer-checked:bg-[#3b82f6] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#3b82f6]/50">
        <Check className="h-3 w-3 stroke-[3]" />
      </span>
      <span>{children}</span>
    </label>
  )
}
