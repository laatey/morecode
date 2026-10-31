/** The questions the AI can put to the person while it works (the ask_user tool). */

export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionItem {
  /** A one or two word tag, shown small above the question. */
  header?: string
  question: string
  options: QuestionOption[]
  /** The person may pick more than one option. */
  multi?: boolean
}

export interface QuestionAnswer {
  question: string
  answer: string
}

const text = (v: unknown, max: number, what: string, optional = false): string => {
  if (v === undefined || v === null || v === '') {
    if (optional) return ''
    throw new Error(`${what} is required.`)
  }
  if (typeof v !== 'string' || v.includes('\0') || v.length > max) {
    throw new Error(`${what} must be text of at most ${max} characters.`)
  }
  const t = v.trim()
  if (!t && !optional) throw new Error(`${what} is required.`)
  return t
}

/** Checks what the model sent. Throws a message the model can act on. */
export function validateQuestions(input: Record<string, unknown>): QuestionItem[] {
  const raw = input.questions
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) {
    throw new Error('Send 1 to 3 questions in “questions”.')
  }
  return raw.map((q, n): QuestionItem => {
    const x = (q ?? {}) as Record<string, unknown>
    const label = `Question ${n + 1}`
    const options = Array.isArray(x.options) ? x.options : []
    if (options.length < 2 || options.length > 4) throw new Error(`${label} needs 2 to 4 options.`)
    const header = text(x.header, 24, `${label} header`, true)
    return {
      ...(header ? { header } : {}),
      question: text(x.question, 300, `${label} text`),
      options: options.map((o, k) => {
        const y = (typeof o === 'string' ? { label: o } : (o ?? {})) as Record<string, unknown>
        const description = text(y.description, 200, `${label} option ${k + 1} description`, true)
        return {
          label: text(y.label, 80, `${label} option ${k + 1}`),
          ...(description ? { description } : {})
        }
      }),
      ...(x.multi_select === true || x.multi === true ? { multi: true } : {})
    }
  })
}

/** Answers coming back from the screen: plain strings, capped, nothing else. */
export function cleanAnswers(raw: unknown, items: QuestionItem[]): QuestionAnswer[] | null {
  if (!Array.isArray(raw)) return null
  const out: QuestionAnswer[] = []
  for (const a of raw) {
    const x = a as Partial<QuestionAnswer> | null
    if (!x || typeof x.question !== 'string' || typeof x.answer !== 'string') continue
    if (!items.some((i) => i.question === x.question)) continue
    out.push({ question: x.question, answer: x.answer.slice(0, 2000) })
  }
  return out.length ? out : null
}

/** What the model reads once the person has answered. */
export function answersForModel(answers: QuestionAnswer[]): string {
  return `The person answered:\n${answers.map((a) => `- ${a.question}\n  → ${a.answer}`).join('\n')}\nContinue with these answers. Do not ask the same thing again.`
}

export const SKIPPED_FOR_MODEL =
  'The person skipped the question without answering. Make the most sensible choice yourself and say what you assumed, or, if you truly cannot go on, ask in plain text.'
