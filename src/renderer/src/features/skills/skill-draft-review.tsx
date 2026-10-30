import React, { useState } from 'react'
import { FileText } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useSkills } from './skills-store'
import {
  skillDraftCollision,
  validateSkillDraft,
  type SkillDraft
} from '../../../../shared/skill-draft'

/** Drafts remain in the conversation until the person explicitly saves them. */
export function SkillDraftReview({ draft }: { draft: SkillDraft }): React.JSX.Element {
  const skills = useSkills()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState(draft.name)
  const [id, setId] = useState(draft.id)
  const [instructions, setInstructions] = useState(draft.instructions)
  const [error, setError] = useState('')
  if (dismissed)
    return <div className="py-1 text-xs text-muted-foreground">Skill draft dismissed</div>
  const save = (): void => {
    try {
      const value = validateSkillDraft({ ...draft, name, id, instructions })
      if (skillDraftCollision(value.id, skills.all, skills.commands))
        throw new Error('That command already exists. Choose another command name.')
      skills.saveSkill({
        ...value,
        category: 'Quality',
        icon: 'docs',
        triggers: [],
        files: [],
        source: 'custom',
        author: 'You',
        version: '1.0.0'
      })
      setSaved(true)
      setOpen(false)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the skill.')
    }
  }
  const field =
    'w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-ring'
  return (
    <div className="my-2 border-l border-border pl-3 text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </span>
        {saved ? (
          <span className="text-muted-foreground">Saved · /{id}</span>
        ) : (
          <Button size="xs" variant="outline" onClick={() => setOpen(!open)}>
            {open ? 'Close review' : 'Review skill'}
          </Button>
        )}
      </div>
      {open && !saved && (
        <div className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span>Name</span>
            <input
              aria-label="Skill name"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span>Command</span>
            <input
              aria-label="Skill command"
              className={field}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span>Instructions</span>
            <textarea
              aria-label="Skill instructions"
              className={`${field} min-h-32 resize-y`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
            <Button size="xs" onClick={save}>
              Save skill
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
