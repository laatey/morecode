import assert from 'node:assert/strict'
import { test } from 'node:test'

const SRC = '../src/renderer/src/lib/secrets.ts'
const NAME = 'morecode:keys:v1'

/** A fresh copy of the module and a fake window, so each test starts clean. */
async function setup({ available = true, stored = {}, legacy = {}, setWorks = true } = {}) {
  const store = new Map(Object.entries(stored))
  const plain = new Map(Object.entries(legacy))
  const written = []
  globalThis.localStorage = {
    getItem: (k) => plain.get(k) ?? null,
    setItem: (k, v) => plain.set(k, v),
    removeItem: (k) => plain.delete(k)
  }
  globalThis.window = {
    api: {
      secrets: {
        available: async () => available,
        get: async (n) => store.get(n) ?? null,
        set: async (n, v) => {
          written.push([n, v])
          if (!setWorks) return false
          v === null ? store.delete(n) : store.set(n, v)
          return true
        }
      }
    }
  }
  const mod = await import(`${SRC}?t=${Math.random()}`)
  return { ...mod, store, plain, written }
}

test('without an encrypted store, nothing moves and plain storage is left alone', async () => {
  const t = await setup({ available: false, legacy: { [NAME]: '{"a":"sk-1"}' } })
  await t.loadSecrets([NAME], { [NAME]: NAME })
  assert.equal(t.secrets.secure, false)
  assert.equal(t.plain.get(NAME), '{"a":"sk-1"}')
  t.secrets.set(NAME, 'x')
  assert.equal(t.written.length, 0)
})

test('plain text from an older version is moved into the encrypted store and wiped', async () => {
  const t = await setup({ legacy: { [NAME]: '{"a":"sk-1"}' } })
  await t.loadSecrets([NAME], { [NAME]: NAME })
  assert.equal(t.secrets.secure, true)
  assert.equal(t.secrets.get(NAME), '{"a":"sk-1"}')
  assert.equal(t.store.get(NAME), '{"a":"sk-1"}')
  assert.equal(t.plain.has(NAME), false)
})

test('if the encrypted store cannot save, the plain copy is kept rather than lost', async () => {
  const t = await setup({ legacy: { [NAME]: '{"a":"sk-1"}' }, setWorks: false })
  await t.loadSecrets([NAME], { [NAME]: NAME })
  assert.equal(t.plain.get(NAME), '{"a":"sk-1"}')
  assert.equal(t.secrets.get(NAME), null)
})

test('an encrypted value wins over a leftover plain one, which is then wiped', async () => {
  const t = await setup({ stored: { [NAME]: 'new' }, legacy: { [NAME]: 'old' } })
  await t.loadSecrets([NAME], { [NAME]: NAME })
  assert.equal(t.secrets.get(NAME), 'new')
  assert.equal(t.plain.has(NAME), false)
})

test('setting and clearing a secret reaches the encrypted store', async () => {
  const t = await setup()
  await t.loadSecrets([NAME])
  t.secrets.set(NAME, 'abc')
  assert.equal(t.secrets.get(NAME), 'abc')
  t.secrets.set(NAME, null)
  assert.equal(t.secrets.get(NAME), null)
  assert.deepEqual(t.written, [
    [NAME, 'abc'],
    [NAME, null]
  ])
})
