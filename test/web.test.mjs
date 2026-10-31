import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  htmlToText,
  isLocalUrl,
  normalizeUrl,
  parseBing,
  parseDuckDuckGo,
  webFetch,
  webSearch
} from '../src/main/agent/web.ts'

const DDG = `
<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freact.dev%2Freference%2Freact%2FuseEffect&amp;rut=abc">useEffect &ndash; React</a></h2>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">Lets you <b>synchronize</b> a component with an external system.</a></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/y.js?ad_domain=shop.example&amp;u=1">Buy things</a>
<a class="result__snippet" href="x">An ad snippet</a></div>
<div class="result"><a class="result__a" href="https://example.com/direct">Direct link</a>
<a class="result__snippet" href="x">Second &amp; last</a></div>`

test('DuckDuckGo results are read, ads dropped, links unwrapped', () => {
  const hits = parseDuckDuckGo(DDG)
  assert.equal(hits.length, 2)
  assert.deepEqual(hits[0], {
    title: 'useEffect – React',
    url: 'https://react.dev/reference/react/useEffect',
    snippet: 'Lets you synchronize a component with an external system.'
  })
  assert.equal(hits[1].url, 'https://example.com/direct')
  assert.equal(hits[1].snippet, 'Second & last')
})

test('Bing results are read and tracking links decoded', () => {
  const real = 'https://nodejs.org/api/fs.html'
  const u = 'a1' + Buffer.from(real).toString('base64url')
  const html = `<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;u=${u}&amp;ntb=1">fs | Node.js</a></h2><div class="b_caption"><p>The fs module &amp; files.</p></div></li>
  <li class="b_algo"><h2><a href="https://example.org/x">Plain</a></h2></li></ol>`
  const hits = parseBing(html)
  assert.equal(hits[0].url, real)
  assert.equal(hits[0].snippet, 'The fs module & files.')
  assert.equal(hits[1].url, 'https://example.org/x')
})

test('a page becomes readable text with headings and lists', () => {
  const { title, text } = htmlToText(
    `<html><head><title>Docs &amp; more</title><style>p{}</style></head><body><nav>menu</nav><h1>Setup</h1><p>Install it.</p><ul><li>one</li><li>two</li></ul><script>evil()</script></body></html>`
  )
  assert.equal(title, 'Docs & more')
  assert.match(text, /# Setup/)
  assert.match(text, /- one\n- two/)
  assert.doesNotMatch(text, /evil|p\{\}/)
})

test('addresses are checked and tidied', () => {
  assert.equal(normalizeUrl('react.dev'), 'https://react.dev/')
  assert.equal(normalizeUrl('localhost:5173'), 'http://localhost:5173/')
  assert.throws(() => normalizeUrl('file:///etc/passwd'), /http and https/)
  assert.throws(() => normalizeUrl('  '), /required/)
  assert.ok(isLocalUrl('http://localhost:3000/x'))
  assert.ok(!isLocalUrl('https://localhost.evil.com/'))
})

const reply = (body, init = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init })

test('search falls back to Bing when DuckDuckGo gives nothing', async () => {
  const seen = []
  const f = async (url) => {
    seen.push(String(url))
    return String(url).includes('duckduckgo')
      ? reply('<html>nothing</html>')
      : reply('<li class="b_algo"><h2><a href="https://example.org/a">A</a></h2></li>')
  }
  const hits = await webSearch('node test runner', new AbortController().signal, f)
  assert.equal(hits.length, 1)
  assert.equal(seen.length, 2)
})

test('search says so when the service is blocking requests', async () => {
  const f = async () =>
    reply('<html>Unfortunately, bots use DuckDuckGo too. anomaly</html>', { status: 202 })
  await assert.rejects(() => webSearch('x', new AbortController().signal, f), /limiting requests/)
})

test('fetch reads a page, refuses files and reports errors', async () => {
  const ok = async () => reply('<html><title>T</title><body><p>Hello world</p></body></html>')
  const page = await webFetch('https://x.test/a', new AbortController().signal, 20000, ok)
  assert.equal(page.title, 'T')
  assert.match(page.text, /Hello world/)
  assert.equal(page.clipped, false)
  const pdf = async () => reply('%PDF', { headers: { 'content-type': 'application/pdf' } })
  await assert.rejects(
    () => webFetch('https://x.test/a.pdf', new AbortController().signal, 20000, pdf),
    /not a page/
  )
  const gone = async () => new Response('no', { status: 404, statusText: 'Not Found' })
  await assert.rejects(
    () => webFetch('https://x.test/b', new AbortController().signal, 20000, gone),
    /404/
  )
  const big = async () => reply(`<p>${'a'.repeat(5000)}</p>`)
  const cut = await webFetch('https://x.test/c', new AbortController().signal, 1000, big)
  assert.equal(cut.text.length, 1000)
  assert.equal(cut.clipped, true)
})
