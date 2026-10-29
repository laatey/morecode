import assert from 'node:assert/strict'
import { test } from 'node:test'
import { environmentOf, workspaceKey } from '../src/renderer/src/features/workspace/environment.ts'

const groups = [
  { id: 'p1', folder: 'C:/code/a' },
  { id: 'p2', folder: 'C:/code/b' },
  { id: 'old' } // label-only project from an older version
]

test('a chat with no project is loose and never reuses a project folder', () => {
  const env = environmentOf({ projectId: null }, groups)
  assert.equal(env.kind, 'loose')
  assert.equal(workspaceKey('c9', env), 'chat:c9')
})

test('a chat in a project follows that project folder', () => {
  const env = environmentOf({ projectId: 'p2' }, groups)
  assert.deepEqual(env, { kind: 'project', projectId: 'p2', folder: 'C:/code/b' })
  assert.equal(workspaceKey('c1', env), 'project:C:/code/b')
})

test('two chats in one project share the folder; loose chats never share one', () => {
  const a = workspaceKey('c1', environmentOf({ projectId: 'p1' }, groups))
  const b = workspaceKey('c2', environmentOf({ projectId: 'p1' }, groups))
  assert.equal(a, b)
  assert.notEqual(workspaceKey('c1', { kind: 'loose' }), workspaceKey('c2', { kind: 'loose' }))
})

test('a removed project turns its chats loose; a label-only project is unlinked, not borrowed', () => {
  assert.equal(environmentOf({ projectId: 'gone' }, groups).kind, 'loose')
  const env = environmentOf({ projectId: 'old' }, groups)
  assert.equal(env.kind, 'unlinked')
  assert.equal(workspaceKey('c3', env), 'chat:c3')
})
