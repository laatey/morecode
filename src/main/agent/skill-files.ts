import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'

/**
 * Skills are stored by the app as text files in memory. A skill that ships scripts (for example a
 * drawing engine in Python) needs them on disk so the AI can run them. When a skill is read, its bundle
 * is written to <root>/<skill id>/ and the AI is told that folder. The folder is a run-time copy: the
 * app's saved skill stays the source of truth, and the copy is rebuilt whenever the skill changes.
 */

const STAMP = '.morecode-skill.json'

/** A folder name that cannot climb out of the skills folder, whatever the skill is called. */
export function safeSkillId(id: string): string {
  const s = id.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  return s.slice(0, 80) || 'skill'
}

/** Bundle paths come from an uploaded file, so treat them as untrusted. Null means "do not write this one". */
export function safeBundlePath(p: string): string | null {
  const clean = p.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || /^[a-zA-Z]:/.test(clean) || clean.includes('\0')) return null
  const parts = clean.split('/')
  if (parts.some((x) => x === '..' || x === '' || x === '.')) return null
  if (parts[parts.length - 1] === STAMP) return null
  return parts.join('/')
}

const hashOf = (bundle: Record<string, string>): string => {
  const h = createHash('sha256')
  for (const k of Object.keys(bundle).sort()) h.update(k).update('\0').update(bundle[k]).update('\0')
  return h.digest('hex')
}

/**
 * Write the skill's files to <root>/<id>/ and return the absolute folder. Skips the write when the
 * copy on disk already matches. Throws if the folder cannot be written; callers should carry on
 * without a path in that case (read_skill still works from memory).
 */
export function materializeSkill(root: string, skill: { id: string; bundle?: Record<string, string> }): string {
  mkdirSync(root, { recursive: true })
  const base = realpathSync(root)
  const dir = join(base, safeSkillId(skill.id))
  const bundle = skill.bundle ?? {}
  const hash = hashOf(bundle)
  const stamp = join(dir, STAMP)
  try {
    if (existsSync(stamp) && (JSON.parse(readFileSync(stamp, 'utf8')) as { hash?: string }).hash === hash) return dir
  } catch {
    /* unreadable stamp: rebuild */
  }
  // the folder is ours alone, so a changed skill is replaced whole rather than merged with stale files
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [name, text] of Object.entries(bundle)) {
    const clean = safeBundlePath(name)
    if (!clean) continue
    const target = resolve(dir, clean)
    if (!target.startsWith(dir + sep)) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text, 'utf8')
  }
  writeFileSync(stamp, JSON.stringify({ id: skill.id, hash }), 'utf8')
  return dir
}

/** If `abs` is inside the skills folder, say which skill folder and which file. */
export function locateInSkills(root: string | undefined, abs: string): { folder: string; file: string } | null {
  if (!root || !existsSync(root)) return null
  let base: string
  try {
    base = realpathSync(root)
  } catch {
    return null
  }
  const r = relative(base, resolve(abs))
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  const [folder, ...rest] = r.split(sep)
  return rest.length ? { folder, file: rest.join('/') } : { folder, file: '' }
}

/**
 * What the AI is told along with the path. The point is to keep read_skill as the one way to learn what a
 * skill says (so it is shown to the person and cannot be skipped), and to keep the folder for running.
 */
export function skillDirNote(dir: string): string {
  return [
    `Skill directory: ${dir}`,
    'Relative paths in these instructions (scripts/, references/, examples/) are relative to that directory.',
    'Use it only to run a script or open a data file these instructions tell you to use, for example: python "<Skill directory>/scripts/build_set.py" ...',
    'Keep calling read_skill (with a path) for anything you need to read, including SKILL.md, references and script source. Do not read, list or search that directory with other tools, do not change anything in it, and do not go looking in other skill folders.',
    'Write results to the working folder, never into the skill directory.'
  ].join('\n')
}
