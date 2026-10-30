import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('window keeps the original integrated title bar with 38px overlay controls', () => {
  const source = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const constants = source.slice(source.indexOf('const BG_COLOR'), source.indexOf('function createWindow'))
  const construction = source.slice(source.indexOf('  const mainWindow = new BrowserWindow'), source.indexOf('  // maximizing'))
  let options
  class WindowStub {
    constructor(value) { options = value }
    setAppDetails() {}
  }
  const create = new Function('BrowserWindow', 'state', 'existsSync', 'iconPath', 'join', '__dirname', 'process', 'const MIN_WIDTH = 600, MIN_HEIGHT = 400;\n' + constants + construction)
  for (const platform of ['win32', 'linux', 'darwin']) {
    create(WindowStub, {}, () => false, '', () => '', '', { platform })
    assert.equal(options.titleBarStyle, 'hidden')
    assert.equal(options.titleBarOverlay.height, 38)
    assert.equal(options.titleBarOverlay.color, options.backgroundColor)
  }
})