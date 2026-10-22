import React from 'react'
import { File as FileIcon, Folder, X } from 'lucide-react'
import type { Attachment } from './types'

/** Absolute path of a picked or dropped file (desktop only). */
export function pathFor(file: File): string | undefined {
  try {
    return window.api?.pathFor?.(file) || undefined
  } catch {
    return undefined
  }
}

/** Split what was dropped into pictures, files and folders. Must run inside the drop event. */
export function readDrop(dt: DataTransfer): { images: File[]; attachments: Attachment[] } {
  const images: File[] = []
  const attachments: Attachment[] = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    const file = item.getAsFile()
    if (entry?.isDirectory) {
      attachments.push({ kind: 'folder', name: entry.name, path: file ? pathFor(file) : undefined })
    } else if (file) {
      if (file.type.startsWith('image/')) images.push(file)
      else attachments.push({ kind: 'file', name: file.name, path: pathFor(file) })
    }
  }
  return { images, attachments }
}

/** A chosen folder (from the folder picker) becomes one attachment, not hundreds of files. */
export function folderFrom(files: FileList | null): Attachment | null {
  const first = files?.[0]
  if (!first) return null
  const rel = first.webkitRelativePath
  const name = rel.split('/')[0]
  if (!name) return null
  const full = pathFor(first)
  return { kind: 'folder', name, path: full ? full.slice(0, full.length - rel.length) + name : undefined }
}

export function AttachmentChip({
  item,
  onRemove
}: {
  item: Attachment
  onRemove?: () => void
}): React.JSX.Element {
  const Icon = item.kind === 'folder' ? Folder : FileIcon
  return (
    <span
      title={item.path ?? item.name}
      className="inline-flex h-6 max-w-[200px] items-center gap-1.5 rounded-[6px] border border-white/[0.09] bg-white/[0.04] pl-1.5 pr-1 text-[12px] text-[#d6d6d3]"
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{item.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
          className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[3px] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
