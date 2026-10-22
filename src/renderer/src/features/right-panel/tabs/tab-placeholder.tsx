import React from 'react'
import type { LucideIcon } from 'lucide-react'

/** Temporary body for every tab until its real content is built. Delete when no longer used. */
export function TabPlaceholder({
  icon: Icon,
  title
}: {
  icon: LucideIcon
  title: string
}): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/70">
      <Icon className="h-6 w-6 stroke-[1.5]" />
      <span className="text-[13px]">{title}</span>
    </div>
  )
}
