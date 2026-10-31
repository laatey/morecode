/** A routine the AI proposes (draft_routine). Nothing is scheduled until the person saves it. */

export type DraftCadence = 'hourly' | 'daily' | 'weekly'

export interface RoutineDraft {
  title: string
  prompt: string
  cadence: DraftCadence
  /** 24-hour HH:MM. Ignored for hourly routines. */
  time: string
  /** 0 = Sunday … 6 = Saturday. Only used by weekly routines. */
  weekday: number
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function validateRoutineDraft(input: Record<string, unknown>): RoutineDraft {
  const text = (key: string, max: number): string => {
    const v = input[key]
    if (typeof v !== 'string' || !v.trim() || v.length > max || v.includes('\0')) {
      throw new Error(`${key} must be non-empty text of at most ${max} characters.`)
    }
    return v.trim()
  }
  const cadence = input.cadence
  if (cadence !== 'hourly' && cadence !== 'daily' && cadence !== 'weekly') {
    throw new Error('cadence must be hourly, daily or weekly.')
  }
  const time = typeof input.time === 'string' && input.time.trim() ? input.time.trim() : '09:00'
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59)
    throw new Error('time must be 24-hour HH:MM, for example 09:00.')
  const weekday = input.weekday === undefined ? 1 : Number(input.weekday)
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    throw new Error('weekday must be 0 (Sunday) to 6 (Saturday).')
  return {
    title: text('title', 80),
    prompt: text('prompt', 4000),
    cadence,
    time: `${m[1].padStart(2, '0')}:${m[2]}`,
    weekday
  }
}

/** "Every hour", "Every day at 09:00", "Every Monday at 09:00". */
export function describeSchedule(d: Pick<RoutineDraft, 'cadence' | 'time' | 'weekday'>): string {
  if (d.cadence === 'hourly') return 'Every hour'
  if (d.cadence === 'daily') return `Every day at ${d.time}`
  return `Every ${DAYS[d.weekday] ?? 'Monday'} at ${d.time}`
}
