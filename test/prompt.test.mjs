import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  exampleCommand,
  promptGlyph,
  promptPath
} from '../src/renderer/src/features/right-panel/terminal/prompt.ts'

test('each platform ends its prompt the way its own shell does', () => {
  assert.equal(promptGlyph('win32'), '>')
  assert.equal(promptGlyph('darwin'), '%')
  assert.equal(promptGlyph('linux'), '$')
  assert.equal(promptGlyph('freebsd'), '$')
})

test('Windows shows the whole path with backslashes', () => {
  assert.equal(
    promptPath('C:\\Users\\ama\\code\\acme-web\\src', 'win32'),
    'C:\\Users\\ama\\code\\acme-web\\src'
  )
  assert.equal(promptPath('C:/Users/ama/app', 'win32'), 'C:\\Users\\ama\\app')
})

test('Mac and Linux show home as ~ and keep long paths short', () => {
  assert.equal(promptPath('/Users/ama', 'darwin'), '~')
  assert.equal(promptPath('/Users/ama/app', 'darwin'), '~/app')
  assert.equal(promptPath('/home/ama/code/acme/web/src', 'linux'), '…/web/src')
  assert.equal(promptPath('/srv/app', 'linux'), '/srv/app')
  assert.equal(promptPath('/Users/amanda', 'darwin'), '~')
})

test('nothing is shown as an ellipsis before the folder is known', () => {
  assert.equal(promptPath(null, 'win32'), '…')
  assert.equal(promptPath(null, 'linux'), '…')
})

test('the example command exists on that shell', () => {
  assert.equal(exampleCommand('win32'), 'dir')
  assert.equal(exampleCommand('darwin'), 'ls')
})
