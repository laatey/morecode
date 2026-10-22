import React from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { useSettings } from '@/features/settings/settings-store'
import { FIXED_SHORTCUTS, SHORTCUTS, comboParts, useBindings } from '@/features/settings/shortcuts'
import { useSkills } from '@/features/skills/skills-store'
import { GROUP_ORDER, buildCommands } from '../slash-commands'
import { KeyChip, PanelFrame } from './ui'
import { buttonVariants } from '@/components/ui/button'

export function HelpPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { startTour } = useAuth()
  const { openSettings } = useSettings()
  const bindings = useBindings()
  const sk = useSkills()
  const commands = buildCommands(sk.active, sk.commands)
  const rows = [
    ...FIXED_SHORTCUTS.slice(0, 4).map((f) => ({ label: f.label, keys: f.keys })),
    ...SHORTCUTS.slice(0, 5).map((d) => ({ label: d.label, keys: comboParts(bindings[d.id]) }))
  ]
  return (
    <PanelFrame title="Help" onClose={onClose} width={460}>
      <p className="mb-3 text-[12.5px] leading-5 text-[#8d8d8a]">
        Type <span className="text-[#d6d6d3]">/</span> in the message box to run a command.
      </p>

      <div className="space-y-3.5">
        {GROUP_ORDER.filter((g) => commands.some((c) => c.group === g)).map((g) => (
          <section key={g}>
            <h3 className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">
              {g}
            </h3>
            <ul className="space-y-1">
              {commands.filter((c) => c.group === g).map((c) => (
                <li key={c.id} className="flex gap-3 text-[12.5px]">
                  <span className="w-[92px] shrink-0 font-medium text-[#d6d6d3]">/{c.id}</span>
                  <span className="text-[#8d8d8a]">{c.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-4 border-t border-white/[0.07] pt-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#77776f]">Keyboard</h3>
          <button
            type="button"
            onClick={() => {
              onClose()
              openSettings('shortcuts')
            }}
            className="cursor-pointer text-[12px] text-[#7db1ff] hover:underline"
          >
            See all and change
          </button>
        </div>
        <ul className="space-y-1.5">
          {rows.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-[12.5px]">
              <span className="text-[#8d8d8a]">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <KeyChip key={`${k}${i}`}>{k}</KeyChip>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3.5 text-[12.5px]">
        <span className="text-[#8d8d8a]">New here?</span>
        <button
          type="button"
          onClick={() => {
            onClose()
            setTimeout(startTour, 150)
          }}
          className={buttonVariants({ variant: 'secondary', size: 'xs' })}
        >
          Take the tour
        </button>
      </div>
    </PanelFrame>
  )
}
