import { test, before } from 'node:test'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
let parsePageSelection, docKindFromName, docKindFromMime, readDocument, legacyOfficeHint
before(async () => {
  register('./ts-resolve-hooks.mjs', import.meta.url)
  ;({ parsePageSelection, docKindFromName, docKindFromMime, readDocument, legacyOfficeHint } = await import(pathToFileURL(join(process.cwd(), 'src/main/agent/documents.ts')).href))
})

const fx = (n) => join(process.cwd(), 'test/fixtures', n)
const have = existsSync(fx('t.docx'))

test('page selections', () => {
  assert.deepEqual(parsePageSelection('2-4,7', 10), [2, 3, 4, 7])
  assert.deepEqual(parsePageSelection(undefined, 3), [1, 2, 3])
  assert.deepEqual(parsePageSelection('5-99', 7), [5, 6, 7])
  assert.throws(() => parsePageSelection('abc', 3))
  assert.throws(() => parsePageSelection('9', 3))
})

test('kinds', () => {
  assert.equal(docKindFromName('a/B.PDF?x=1'), 'pdf')
  assert.equal(docKindFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.ok(legacyOfficeHint('x.xls').includes('xlsx'))
  assert.equal(legacyOfficeHint('x.txt'), null)
})

test('vector-only pdf comes back as a picture', { skip: !have }, async () => {
  const r = await readDocument(readFileSync(fx('vector.pdf')), 'pdf')
  assert.equal(r.images.length, 1)
  const png = Buffer.from(r.images[0].data, 'base64')
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.match(r.text, /attached as a picture/)
})

test('mixed pdf: text pages stay text, drawing page is drawn, ranges work', { skip: !have }, async () => {
  const all = await readDocument(readFileSync(fx('mixed.pdf')), 'pdf')
  assert.match(all.text, /Hello Gershon/)
  assert.match(all.text, /Third page text/)
  assert.equal(all.images.length, 1)
  const one = await readDocument(readFileSync(fx('mixed.pdf')), 'pdf', { pages: '3' })
  assert.doesNotMatch(one.text, /Hello Gershon/)
  assert.equal(one.images.length, 0)
  const forced = await readDocument(readFileSync(fx('mixed.pdf')), 'pdf', { pages: '1', render: true })
  assert.equal(forced.images.length, 1)
})

test('docx, xlsx, pptx', { skip: !have }, async () => {
  const d = await readDocument(readFileSync(fx('t.docx')), 'docx')
  assert.match(d.text, /# Report/)
  assert.match(d.text, /First paragraph/)
  const x = await readDocument(readFileSync(fx('t.xlsx')), 'xlsx')
  assert.match(x.text, /Sheet 1 of 2: Sales/)
  assert.match(x.text, /Pen \| 3/)
  assert.match(x.text, /Café & Co/)
  const p = await readDocument(readFileSync(fx('t.pptx')), 'pptx')
  assert.match(p.text, /Title slide/)
  assert.match(p.text, /Bullet two/)
  assert.match(p.text, /Speaker notes: Say hi/)
})
