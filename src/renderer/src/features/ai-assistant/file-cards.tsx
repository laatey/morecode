import React from 'react'
import { toast } from 'sonner'
import { Download, FileText, FolderOpen } from '@/components/icons'
import { useRightPanel } from '@/features/right-panel/store'
import type { ResultFile } from './types'

const size = (bytes: number): string => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : `${bytes} B`)
const kind = (name: string): string => (name.split('.').pop() ?? '').toUpperCase()

const act =
  'flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground'

/**
 * Files the AI made that are worth keeping (a PDF, a spreadsheet, a zip), offered right in the chat: open one in the
 * side panel, show it on your computer, or save a copy somewhere you choose.
 */
export function FileCards({ files }: { files: ResultFile[] }): React.JSX.Element {
  const { openFile } = useRightPanel()
  return (
    <div className="my-1.5 space-y-1.5">
      {files.map((f) => (
        <div key={f.path} className="flex items-center gap-2.5 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.07] text-muted-foreground">
            <FileText className="h-4 w-4 stroke-[1.7]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-foreground" title={f.path}>
              {f.name}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {kind(f.name)} · {size(f.size)}
            </div>
          </div>
          <button type="button" className={act} onClick={() => openFile(f.path)}>
            Open
          </button>
          <button type="button" className={act} title="Show on your computer" onClick={() => void window.api?.files?.reveal(f.path)}>
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={act}
            title="Save a copy…"
            onClick={() =>
              void window.api?.files?.saveAs(f.path).then((saved) => {
                if (saved) toast.success('Saved')
              })
            }
          >
            <Download className="h-3.5 w-3.5" /> Save as…
          </button>
        </div>
      ))}
    </div>
  )
}
