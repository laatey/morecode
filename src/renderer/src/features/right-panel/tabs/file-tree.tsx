import React, { useState } from 'react'
import { ChevronRight, Copy, ExternalLink } from '@/components/icons'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/icon-button'
import { cn } from '@/lib/utils'

type DirNode<T> = { kind: 'dir'; name: string; path: string; children: TreeNode<T>[] }
type FileNode<T> = { kind: 'file'; name: string; path: string; item: T }
export type TreeNode<T> = DirNode<T> | FileNode<T>

const sortNodes = <T,>(nodes: TreeNode<T>[]): TreeNode<T>[] =>
  [...nodes].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))

/** Folders that only hold one other folder are joined (src/renderer/features), so the tree stays shallow. */
function compact<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return sortNodes(
    nodes.map((n) => {
      if (n.kind === 'file') return n
      let cur = n
      while (cur.children.length === 1 && cur.children[0].kind === 'dir') {
        const only = cur.children[0] as DirNode<T>
        cur = { ...only, name: `${cur.name}/${only.name}` }
      }
      return { ...cur, children: compact(cur.children) }
    })
  )
}

export function buildTree<T extends { path: string }>(
  items: T[],
  compactFolders = true
): TreeNode<T>[] {
  const root: DirNode<T> = { kind: 'dir', name: '', path: '', children: [] }
  for (const item of items) {
    const parts = item.path.split('/')
    let dir = root
    parts.slice(0, -1).forEach((part, i) => {
      let next = dir.children.find((c): c is DirNode<T> => c.kind === 'dir' && c.name === part)
      if (!next) {
        next = { kind: 'dir', name: part, path: parts.slice(0, i + 1).join('/'), children: [] }
        dir.children.push(next)
      }
      dir = next
    })
    dir.children.push({ kind: 'file', name: parts[parts.length - 1], path: item.path, item })
  }
  return compactFolders ? compact(root.children) : sortNodes(root.children)
}

const countFiles = <T,>(n: TreeNode<T>): number =>
  n.kind === 'file' ? 1 : n.children.reduce((sum, c) => sum + countFiles(c), 0)

function Branch<T>({
  nodes,
  render,
  closed,
  toggle
}: {
  nodes: TreeNode<T>[]
  render: (item: T) => React.ReactNode
  closed: Set<string>
  toggle: (path: string) => void
}): React.JSX.Element {
  return (
    <>
      {nodes.map((n) => {
        if (n.kind === 'file') return <div key={n.path}>{render(n.item)}</div>
        const shut = closed.has(n.path)
        return (
          <div key={n.path}>
            <button
              type="button"
              aria-expanded={!shut}
              onClick={() => toggle(n.path)}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-left text-[12px] text-[#c9c9c6] transition-colors hover:bg-white/[0.05]"
            >
              <ChevronRight strokeWidth={2.35} className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !shut && 'rotate-90')} />
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-[#77776f]">{countFiles(n)}</span>
            </button>
            {!shut && (
              <div className="ml-[11px] space-y-1.5 border-l border-white/[0.07] pb-1 pl-2 pt-1">
                <Branch nodes={n.children} render={render} closed={closed} toggle={toggle} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Files grouped by folder. Folders open and close; `render` draws each file. */
export function FileTree<T extends { path: string }>({
  items,
  render
}: {
  items: T[]
  render: (item: T) => React.ReactNode
}): React.JSX.Element {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (path: string): void =>
    setClosed((cur) => {
      const next = new Set(cur)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  return (
    <div className="space-y-1.5">
      <Branch nodes={buildTree(items)} render={render} closed={closed} toggle={toggle} />
    </div>
  )
}

/** Copy a file's path, or open the file in the person's own editor. */
export function FileActions({
  path,
  canOpen = true,
  className
}: {
  path: string
  /** False for files that no longer exist on disk. */
  canOpen?: boolean
  className?: string
}): React.JSX.Element {
  const open = async (): Promise<void> => {
    const res = await window.api?.workspace.openFile(path)
    if (!res) toast.error('Opening files needs the desktop app')
    else if (!res.ok) toast.error(res.error ?? 'Could not open this file.')
  }
  return (
    <span className={cn('flex shrink-0 items-center', className)}>
      <IconButton
        title="Copy path"
        className="p-1"
        onClick={(e) => {
          e.stopPropagation()
          void navigator.clipboard.writeText(path).then(() => toast.success('Path copied'))
        }}
      >
        <Copy className="h-3 w-3" />
      </IconButton>
      {canOpen && (
        <IconButton
          title="Open in your editor"
          className="p-1"
          onClick={(e) => {
            e.stopPropagation()
            void open()
          }}
        >
          <ExternalLink className="h-3 w-3" />
        </IconButton>
      )}
    </span>
  )
}
