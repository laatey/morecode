import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answersForModel, cleanAnswers, validateQuestions } from '../src/shared/question.ts'
import { describeSchedule, validateRoutineDraft } from '../src/shared/routine-draft.ts'

const q = (over = {}) => ({
  question: 'Which database?',
  header: 'Data',
  options: [{ label: 'SQLite (Recommended)', description: 'No setup' }, { label: 'Postgres' }],
  ...over
})

test('questions are checked before they reach the screen', () => {
  const items = validateQuestions({
    questions: [q(), q({ question: 'Pick some', multi_select: true, options: ['a', 'b', 'c'] })]
  })
  assert.equal(items.length, 2)
  assert.equal(items[0].options[0].description, 'No setup')
  assert.equal(items[1].multi, true)
  assert.deepEqual(
    items[1].options.map((o) => o.label),
    ['a', 'b', 'c']
  )
  assert.throws(() => validateQuestions({ questions: [] }), /1 to 3/)
  assert.throws(
    () => validateQuestions({ questions: [q({ options: [{ label: 'only one' }] })] }),
    /2 to 4/
  )
  assert.throws(() => validateQuestions({ questions: [q({ question: '' })] }), /required/)
  assert.throws(() => validateQuestions({ questions: [q({ header: 'x'.repeat(40) })] }), /header/)
  assert.throws(() => validateQuestions({ questions: [q(), q(), q(), q()] }), /1 to 3/)
})

test('answers from the screen are cleaned and matched to what was asked', () => {
  const items = validateQuestions({ questions: [q()] })
  const ok = cleanAnswers(
    [
      { question: 'Which database?', answer: 'Postgres' },
      { question: 'Made up', answer: 'x' },
      { nope: 1 }
    ],
    items
  )
  assert.deepEqual(ok, [{ question: 'Which database?', answer: 'Postgres' }])
  assert.equal(cleanAnswers(null, items), null)
  assert.equal(cleanAnswers([{ question: 'Made up', answer: 'x' }], items), null)
  assert.equal(
    cleanAnswers([{ question: 'Which database?', answer: 'y'.repeat(5000) }], items)[0].answer
      .length,
    2000
  )
  assert.match(answersForModel(ok), /Which database\?\n {2}→ Postgres/)
})

test('a routine draft is validated and described', () => {
  const d = validateRoutineDraft({
    title: ' Morning check ',
    prompt: 'Run the tests and report.',
    cadence: 'weekly',
    time: '9:05',
    weekday: 5
  })
  assert.deepEqual(d, {
    title: 'Morning check',
    prompt: 'Run the tests and report.',
    cadence: 'weekly',
    time: '09:05',
    weekday: 5
  })
  assert.equal(describeSchedule(d), 'Every Friday at 09:05')
  assert.equal(
    describeSchedule({ cadence: 'daily', time: '18:30', weekday: 1 }),
    'Every day at 18:30'
  )
  assert.equal(describeSchedule({ cadence: 'hourly', time: '09:00', weekday: 1 }), 'Every hour')
  assert.equal(validateRoutineDraft({ title: 't', prompt: 'p', cadence: 'daily' }).time, '09:00')
  assert.throws(
    () => validateRoutineDraft({ title: 't', prompt: 'p', cadence: 'monthly' }),
    /cadence/
  )
  assert.throws(
    () => validateRoutineDraft({ title: 't', prompt: 'p', cadence: 'daily', time: '25:00' }),
    /time/
  )
  assert.throws(
    () => validateRoutineDraft({ title: 't', prompt: 'p', cadence: 'weekly', weekday: 9 }),
    /weekday/
  )
  assert.throws(() => validateRoutineDraft({ title: '', prompt: 'p', cadence: 'daily' }), /title/)
})
