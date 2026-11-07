import React, { useState } from 'react'
import { Check } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Btn, Group, Pick, Row } from '../kit'
import { IMPORT_PROMPT, parseImport, type ImportScope } from '../../../../../shared/memory-import'

type Review = { id: number; text: string; scope: ImportScope; checked: boolean }
type Outcome = { added: number; duplicates: number; rejected: { text: string; reason: string }[] }
type Api = Window['api']['memory']
type Done = Awaited<ReturnType<Api['import']>>

/**
 * "Bring your memory from another AI": copy a prompt, paste the answer, review, import.
 * Nothing is saved until the person confirms the list.
 */
export function MemoryImport({
  api,
  projectPath,
  projectName,
  onImported
}: {
  api: Api
  projectPath?: string
  projectName: string | null
  onImported: (view: Extract<Done, { ok: true }>['view']) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [review, setReview] = useState<Review[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const close = (): void => {
    setOpen(false)
    setPasted('')
    setReview(null)
    setError(null)
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not copy. Select the prompt above and copy it by hand.')
    }
  }

  const startReview = (): void => {
    setError(null)
    const found = parseImport(pasted)
    if (found.length === 0) {
      setError('No notes found in that text. Paste the full answer from the other AI, one fact per line.')
      return
    }
    // project notes need a project to live in; without one they become notes for every chat
    setReview(found.map((f, i) => ({ id: i, text: f.text, scope: f.scope === 'project' && projectPath ? 'project' : 'global', checked: true })))
  }

  const picked = review?.filter((r) => r.checked) ?? []
  const patch = (id: number, p: Partial<Review>): void => setReview((cur) => cur?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null)

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await api.import(projectPath, picked.map((r) => ({ scope: r.scope, text: r.text })))
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onImported(res.view)
    setOutcome({ added: res.added, duplicates: res.duplicates, rejected: res.rejected })
    close()
  }

  const scopeOptions = [
    { value: 'global', label: 'Everywhere' },
    { value: 'project', label: projectName ? `Project: ${projectName}` : 'Project (none selected)', disabled: !projectPath }
  ] as { value: ImportScope; label: string; disabled?: boolean }[]

  return (
    <Group note="Your notes stay on this computer. The pasted text is only read here, and you review every note before it is saved.">
      <Row
        title="Import from another AI"
        description="Bring your memory from ChatGPT, Gemini or another AI: copy a prompt, ask it, then paste its answer here."
      >
        {!open && <Btn variant="default" onClick={() => { setOutcome(null); setOpen(true) }}>Start import</Btn>}
      </Row>

      {outcome && !open && (
        <div className="space-y-1 text-[12px]">
          <p className="text-soft-foreground">
            Imported {outcome.added} note{outcome.added === 1 ? '' : 's'}.
            {outcome.duplicates > 0 && ` ${outcome.duplicates} already saved.`}
            {outcome.rejected.length > 0 && ` ${outcome.rejected.length} skipped.`}
          </p>
          {outcome.rejected.map((r, i) => (
            <p key={i} className="text-muted-foreground">
              “{r.text}{r.text.length >= 120 ? '…' : ''}”: {r.reason}
            </p>
          ))}
        </div>
      )}

      {open && !review && (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-foreground">1. Copy this prompt into the other AI</p>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-scrim/20 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{IMPORT_PROMPT}</pre>
            <div className="mt-2">
              <Btn variant="default" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy prompt'}</Btn>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-foreground">2. Paste its answer here</p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              aria-label="Answer from the other AI"
              placeholder={'## Preferences\n- Replies in short sentences\n## Projects\n- Acme web: React, TypeScript, pnpm'}
              className="w-full resize-y rounded-md border border-border bg-transparent px-2.5 py-2 text-[12.5px] leading-5 text-foreground outline-none placeholder:text-faint-foreground focus:border-border-strong"
            />
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="default" onClick={close}>Cancel</Btn>
            <Btn variant="primary" disabled={!pasted.trim()} onClick={startReview}>Review notes</Btn>
          </div>
        </div>
      )}

      {open && review && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-foreground">
              {review.length} note{review.length === 1 ? '' : 's'} found · {picked.length} selected
            </p>
            <button
              type="button"
              className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => setReview(review.map((r) => ({ ...r, checked: picked.length !== review.length })))}
            >
              {picked.length === review.length ? 'Select none' : 'Select all'}
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-auto pr-1">
            {review.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5 rounded-md px-1 py-1 hover:bg-foreground/[0.03]">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={r.checked}
                  aria-label={`Import: ${r.text}`}
                  onClick={() => patch(r.id, { checked: !r.checked })}
                  className={cn(
                    'mt-[3px] flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors',
                    r.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong hover:border-foreground/40'
                  )}
                >
                  {r.checked && <Check className="h-3 w-3 stroke-[2.5]" />}
                </button>
                <p className={cn('min-w-0 flex-1 text-[12.5px] leading-5', r.checked ? 'text-soft-foreground' : 'text-faint-foreground line-through')}>{r.text}</p>
                <Pick value={r.scope} options={scopeOptions} onChange={(v) => patch(r.id, { scope: v })} />
              </div>
            ))}
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="default" onClick={() => setReview(null)}>Back</Btn>
            <Btn variant="primary" busy={busy} disabled={picked.length === 0} onClick={() => void run()}>
              Import {picked.length} note{picked.length === 1 ? '' : 's'}
            </Btn>
          </div>
        </div>
      )}
    </Group>
  )
}
