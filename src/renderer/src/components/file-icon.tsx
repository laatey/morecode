import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Folder } from '@/components/icons'
import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
} from '@pierre/trees'
import { cn } from '@/lib/utils'

// File icons come from @pierre/trees (its "complete" set). Every use goes through this file,
// so changing the icon set means changing only this file.
// Pierre ships no folder icon (its tree uses a chevron only), so folders use a plain outline folder.
const box = 'inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full'
const fileIconResolver = createFileTreeIconResolver('complete')

// The sprite is put in the page once; each icon is then a single <use> pointing at it.
let spriteReady = false
function ensureSprite(): void {
  if (spriteReady || typeof document === 'undefined' || !document.body) return
  spriteReady = true
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  host.innerHTML = getBuiltInSpriteSheet('complete')
  document.body.appendChild(host)
}

// Pierre colours its icons inside the tree only. Outside the tree we set the colour ourselves:
// Pierre's own variable wins if it is defined, otherwise the fallback below is used.
const colours: Record<string, string> = {
  typescript: '#3b82f6',
  javascript: '#e5c07b',
  react: '#38bdf8',
  json: '#d4b24c',
  css: '#60a5fa',
  sass: '#ec6fa6',
  html: '#f0743c',
  markdown: '#4ade80',
  python: '#4b8bbe',
  go: '#22b8cf',
  rust: '#e08a5a',
  ruby: '#e5484d',
  swift: '#fa7343',
  vue: '#41b883',
  svelte: '#ff5a1f',
  astro: '#a78bfa',
  nextjs: '#e5e7eb',
  docker: '#38a3ee',
  git: '#f1502f',
  npm: '#e5484d',
  yml: '#c084fc',
  image: '#a78bfa',
  svg: '#f59e0b',
  zip: '#d4a24c',
  bash: '#86efac',
  database: '#94a3b8',
  table: '#4ade80',
  claude: '#d97757',
  eslint: '#8b5cf6',
  prettier: '#f472b6',
  vite: '#a78bfa',
  tailwind: '#38bdf8'
}

function tokenFor(name: string): string {
  return fileIconResolver.resolveIcon('file-tree-icon-file', name).token ?? 'default'
}

/** The icon for a file, chosen from its name. */
export function FileIcon({ name, className }: { name: string; className?: string }): React.JSX.Element {
  ensureSprite()
  const token = tokenFor(name)
  const fallback = colours[token] ?? 'var(--muted-foreground, #8b8f98)'
  return (
    <span
      aria-hidden
      className={cn(box, className)}
      style={{ color: `var(--trees-file-icon-color-${token}, ${fallback})` }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <use href={`#file-tree-builtin-${token}`} />
      </svg>
    </span>
  )
}

/** The icon for a folder. */
export function FolderIcon({ className }: { name?: string; className?: string }): React.JSX.Element {
  return (
    <span aria-hidden className={cn(box, className)} style={{ color: 'var(--muted-foreground, #8b8f98)' }}>
      <Folder strokeWidth={1.6} />
    </span>
  )
}

/** The same file icon as an HTML string, for places built by hand (the chips in the message box). */
export function fileIconHtml(name: string): string {
  ensureSprite()
  return renderToStaticMarkup(<FileIcon name={name} className="mr-1" />)
}
