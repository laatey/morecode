import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Brain } from '@/components/icons'
import { ActionMenu } from '@/components/action-menu'
import { cn } from '@/lib/utils'
import { setMemoryOff, useMemoryOff } from '@/lib/chat-memory'
import { useSettings } from '@/features/settings/settings-store'

/** "Memory: on (3)" in the message box. One click makes this chat fresh; nothing else changes. */
export function MemoryPill({ chatId, projectPath }: { chatId: string; projectPath?: string }): React.JSX.Element | null {
  const { settings, openSettings } = useSettings()
  const off = useMemoryOff(chatId)
  const [count, setCount] = useState<number | null>(null)
  const api = typeof window !== 'undefined' ? window.api?.memory : undefined
  const disabled = settings.rules.memory === 'block'

  const refresh = useCallback(() => {
    if (!api) return
    void api.list(projectPath).then((v) => setCount(v.global.length + v.project.length))
  }, [api, projectPath])
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh, off, chatId])

  if (!api) return null
  const label = disabled ? 'Memory: off' : off ? 'Memory: off for this chat' : `Memory: on${count ? ` (${count})` : ''}`
  const active = !disabled && !off

  return (
    <ActionMenu
      side="top"
      align="start"
      items={[
        disabled
          ? { id: 'enable', label: 'Turn memory on in settings', onClick: () => openSettings('memory') }
          : off
            ? { id: 'on', label: 'Use memory in this chat', onClick: () => setMemoryOff(chatId, false) }
            : { id: 'off', label: 'Fresh start: no memory in this chat', onClick: () => { setMemoryOff(chatId, true); toast('Memory is off for this chat') } },
        ...(disabled ? [] : [{
          id: 'forget',
          label: 'Forget what this chat saved',
          onClick: () => {
            void api.forgetChat(chatId, projectPath).then((n) => {
              toast(n ? `Forgot ${n} note${n === 1 ? '' : 's'} from this chat` : 'This chat has not saved anything')
              refresh()
            })
          }
        }]),
        { id: 'manage', label: 'Manage memory', onClick: () => openSettings('memory') }
      ]}
      trigger={
        <button
          type="button"
          aria-label={`${label}. Change memory for this chat`}
          title={label}
          className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] transition-colors hover:text-foreground', active && 'text-soft-foreground')}
        >
          <Brain className="h-3.5 w-3.5 stroke-[1.8]" />
          <span className="@max-[30rem]:sr-only">{label}</span>
        </button>
      }
    />
  )
}
