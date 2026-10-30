import React, { useState } from 'react'
import { ChevronDown, Loader2 } from '@/components/icons'
import { ActionMenu } from '@/components/action-menu'
import { SegmentedSwitch } from '@/components/segmented-switch'
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
    <div className="w-full space-y-7">
      <header className="pb-1">
        <h2 className="text-[17px] font-medium text-[#f7f7f4]">{title}</h2>
        {description && <p className="mt-1 max-w-[500px] text-[12px] leading-relaxed text-[#9a9a96]">{description}</p>}
      </header>
      {children}
    </div>
  )
}

/** A titled section: a heading, then a bordered card whose rows are separated by hairlines. */
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
      {title && <h3 className="pb-2 text-[13px] font-medium text-[#ececea]">{title}</h3>}
      <div className="divide-y divide-white/[0.07] overflow-hidden rounded-[10px] border border-white/[0.1]">
        {React.Children.toArray(children).map((child, i) =>
          React.isValidElement(child) && child.type === Row ? child : (
            <div key={i} className="px-4 py-3">
              {child}
            </div>
          )
        )}
      </div>
      {note && <p className="px-1 pt-2 text-[12px] leading-relaxed text-[#737370]">{note}</p>}
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
    <div className={cn('flex min-h-[54px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3', className)}>
      <div className="flex min-w-[180px] flex-1 items-start gap-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium leading-snug text-[#f1f1ef]">{title}</div>
          {description && <div className="mt-0.5 text-[11.5px] leading-relaxed text-[#92928e]">{description}</div>}
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
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-[#3b82f6]' : 'bg-[#5a5a54] hover:bg-[#67675f]'
      )}
    >
      <span
        className={cn(
          'absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: React.ReactNode }[]
  onChange: (v: T) => void
  label: string
}): React.JSX.Element {
  return (
    <SegmentedSwitch
      options={options}
      value={value}
      onChange={onChange}
      itemWidth={68}
      height={28}
    />
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
          className="inline-flex h-7 cursor-pointer items-center justify-end gap-1.5 px-2 text-[12px] text-[#f1f1ef] transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
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
      className={cn(
        'h-8 rounded-[7px] border-transparent px-3 text-[12.5px] font-medium text-white shadow-none',
        variant === 'primary' && 'bg-[#3b82f6] hover:bg-[#2f6fe0]',
        variant === 'danger' && 'bg-[#d6453d] hover:bg-[#bf3a33]',
        variant === 'default' && 'bg-[#33332f] hover:bg-[#3d3d39]',
        className
      )}
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
      'h-8 w-full rounded-[7px] border border-[#3a3a37] bg-[#272726] px-2.5 text-[12.5px] text-white outline-none transition-colors placeholder:text-[#9a9a95] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]',
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-[180px] flex-1">
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
        <div className="mt-3 space-y-3 border border-[#e5584f]/25 bg-[#e5584f]/[0.06] p-3">
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
