import React, { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { ActionMenu } from '@/components/action-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** One settings page: a bold heading, an optional line under it, then groups. */
export function Page({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-7">
      <header className="pr-8">
        <h2 className="text-[15px] font-semibold tracking-tight text-[#f3f3f1]">{title}</h2>
        {description && <p className="mt-1 text-[12.5px] leading-relaxed text-[#8e8e8a]">{description}</p>}
      </header>
      {children}
    </div>
  )
}

/** A titled section: bold heading, then rows separated by hairlines (no boxes, like Claude). */
export function Group({
  title,
  note,
  children
}: {
  title?: string
  note?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      {title && <h3 className="pb-0.5 text-[14px] font-semibold tracking-tight text-[#f3f3f1]">{title}</h3>}
      <div className="divide-y divide-white/[0.07]">{children}</div>
      {note && <p className="pt-2 text-[12px] leading-relaxed text-[#737370]">{note}</p>}
    </section>
  )
}

/** A label and short explanation on the left, the control on the right. */
export function Row({
  title,
  description,
  children,
  icon,
  className
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-[46px] items-center justify-between gap-6 py-2.5', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug text-[#f1f1ef]">{title}</div>
          {description && <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">{description}</div>}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center justify-end gap-2">{children}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50 disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-[#3b82f6]' : 'bg-[#3a3a38] hover:bg-[#444442]'
      )}
    >
      <span
        className={cn(
          'absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: React.ReactNode }[]
  onChange: (v: T) => void
  label: string
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-8 shrink-0 select-none items-center rounded-[9px] bg-[#2a2a29] p-[2px]"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-[26px] cursor-pointer items-center justify-center rounded-[7px] px-3 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50',
              active
                ? 'bg-[#3f3f3d] text-white ring-1 ring-white/[0.12]'
                : 'text-[#b4b4b0] hover:text-white'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A dropdown that reads as plain text with a chevron, like "English ⌄". */
export function Pick<T extends string>({
  value,
  options,
  onChange,
  width
}: {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (v: T) => void
  width?: number
}): React.JSX.Element {
  const current = options.find((o) => o.value === value)?.label ?? value
  return (
    <ActionMenu
      align="end"
      items={options.map((o) => ({
        id: o.value,
        label: o.label,
        checked: o.value === value,
        disabled: o.disabled,
        onClick: () => onChange(o.value)
      }))}
      trigger={
        <button
          type="button"
          style={width ? { minWidth: width } : undefined}
          className="inline-flex h-8 cursor-pointer items-center justify-end gap-1.5 rounded-lg px-2 text-[13px] text-[#f1f1ef] transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50"
        >
          <span className="truncate">{current}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8e8e8a]" />
        </button>
      }
    />
  )
}

type Variant = 'default' | 'primary' | 'danger'

/** Settings buttons: the shared Button with the three roles these pages need. */
export function Btn({
  variant = 'default',
  busy,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }): React.JSX.Element {
  return (
    <Button
      size="sm"
      type="button"
      variant={variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : 'secondary'}
      {...props}
      disabled={props.disabled || busy}
      className={className}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </Button>
  )
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    {...props}
    className={cn(
      'h-8 w-full rounded-lg border border-white/[0.12] bg-[#232322] px-2.5 text-[12.5px] text-[#f1f1ef] outline-none transition-colors placeholder:text-[#737370] focus:border-white/[0.3]',
      className
    )}
  />
))
TextInput.displayName = 'TextInput'

/**
 * A risky action that needs a second step. Optionally asks the person to type a word first.
 */
export function DangerRow({
  title,
  description,
  button,
  confirmLabel,
  typeToConfirm,
  onConfirm
}: {
  title: string
  description: string
  button: string
  confirmLabel: string
  /** If set, the confirm button stays off until this text is typed. */
  typeToConfirm?: string
  onConfirm: () => Promise<void> | void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase()

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setOpen(false)
      setTyped('')
    }
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug text-[#f1f1ef]">{title}</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[#8e8e8a]">{description}</div>
        </div>
        {!open && (
          <Btn variant="danger" onClick={() => setOpen(true)}>
            {button}
          </Btn>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-[10px] border border-[#e5584f]/25 bg-[#e5584f]/[0.06] p-3.5">
          {typeToConfirm && (
            <label className="block text-[13px] text-[#c9c9c6]">
              Type <span className="font-medium text-[#ececea]">{typeToConfirm}</span> to confirm
              <TextInput
                className="mt-1.5"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                spellCheck={false}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Btn disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="danger" busy={busy} disabled={!ready} onClick={() => void run()}>
              {confirmLabel}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
