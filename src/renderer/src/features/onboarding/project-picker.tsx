import React, { useState } from 'react'
import { FolderOpen, FolderPlus, Loader2, X } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-store'
import type { Project } from '@/features/auth/auth-service'

const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Choose where to work: open a folder, pick a recent one, or start from a template. */
export function ProjectPicker({ onPick }: { onPick: (p: Project) => void }): React.JSX.Element {
  const { account, update } = useAuth()
  const desktop = Boolean(window.api?.workspace)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const allRecents = account?.recents ?? []
  const recents = allRecents.slice(0, 3)

  const browse = async (): Promise<void> => {
    const chosen = await window.api.workspace.choose()
    if (chosen) onPick({ name: chosen.name, path: chosen.root })
  }

  const openTyped = (e: React.FormEvent): void => {
    e.preventDefault()
    const clean = path.trim().replace(/[\\/]+$/, '')
    if (!clean) return
    onPick({ name: clean.split(/[\\/]/).pop() || clean, path: clean })
  }

  const create = (e: React.FormEvent): void => {
    e.preventDefault()
    const project = slug(name)
    if (!project) return
    setCreating(true)
    setTimeout(() => {
      toast.success(`Created ${project}`)
      onPick({ name: project, path: '' })
    }, 1200)
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-[13px] font-medium text-foreground">Open a folder</h3>
        {desktop ? (
          <button
            type="button"
            onClick={() => void browse()}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-border-strong px-4 py-3.5 text-left transition-colors hover:border-foreground/[0.3] hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <span>
              <span className="block text-[13.5px] text-foreground">Choose a folder on this computer</span>
              <span className="block text-[12.5px] text-muted-foreground">Your existing project, or any folder you like.</span>
            </span>
          </button>
        ) : (
          <form onSubmit={openTyped} className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              aria-label="Folder path"
              placeholder="C:\Projects\my-app"
              className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-foreground/[0.04] px-3 font-mono text-[13px] outline-none placeholder:text-faint-foreground focus:border-primary/70"
            />
            <button
              type="submit"
              disabled={!path.trim()}
              className="h-10 cursor-pointer rounded-[8px] bg-foreground/[0.1] px-4 text-[13px] text-foreground hover:bg-foreground/[0.15] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open
            </button>
          </form>
        )}
      </section>

      {recents.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-foreground">Recent</h3>
          <ul className="divide-y divide-border/50 rounded-[10px] border border-border">
            {recents.map((r) => (
              <li key={`${r.path}|${r.name}`} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left hover:bg-foreground/[0.04]"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] text-foreground">{r.name}</span>
                    {r.path && <span className="block truncate font-mono text-[11.5px] text-faint-foreground">{r.path}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${r.name} from recent`}
                  onClick={() => void update({ recents: allRecents.filter((x) => x !== r) })}
                  className="mr-2 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[6px] text-faint-foreground opacity-0 transition-opacity hover:bg-foreground/[0.08] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[13px] font-medium text-foreground">Or start something new</h3>
        <form onSubmit={create} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Project name"
            placeholder="Name your project"
            className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-foreground/[0.04] px-3 text-[14px] outline-none placeholder:text-faint-foreground focus:border-primary/70"
          />
          <Button type="submit" disabled={!slug(name) || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </section>
    </div>
  )
}
