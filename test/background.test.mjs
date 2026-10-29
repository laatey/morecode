import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startJob, waitForJob, takeNew, stopJob, dropJob, getJob } from '../src/main/agent/background.ts'

const sig = () => new AbortController().signal
const node = (code) => `node -e "${code}"`

test('a server keeps running and its output can be read later', async () => {
  const job = startJob(node("console.log('booting');setTimeout(()=>console.log('ready on 3000'),700);setInterval(()=>{},1000)"), process.cwd())
  assert.equal(await waitForJob(job, 5, 'READY', sig()), 'matched')
  assert.equal(job.exited, false)
  const { text } = takeNew(job)
  assert.match(text, /booting/)
  assert.match(text, /ready on 3000/)
  assert.equal(takeNew(job).text, '')
  await stopJob(job)
  assert.equal(job.exited, true)
  assert.equal(job.stopped, true)
})

test('waiting returns early when the command exits, and reports the exit code', async () => {
  const job = startJob(node("console.log('hi');process.exit(3)"), process.cwd())
  assert.equal(await waitForJob(job, 10, undefined, sig()), 'exited')
  assert.equal(job.exitCode, 3)
  assert.match(takeNew(job).text, /hi/)
  dropJob(job.id)
  assert.equal(getJob(job.id), undefined)
})

test('a wait that runs out of time leaves the job running', async () => {
  const job = startJob(node('setInterval(()=>{},1000)'), process.cwd())
  assert.equal(await waitForJob(job, 0.3, undefined, sig()), 'timeout')
  assert.equal(job.exited, false)
  await stopJob(job)
})

test('stopping the run ends a wait but not the job', async () => {
  const job = startJob(node('setInterval(()=>{},1000)'), process.cwd())
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 100)
  assert.equal(await waitForJob(job, 10, undefined, ac.signal), 'aborted')
  assert.equal(job.exited, false)
  await stopJob(job)
})
