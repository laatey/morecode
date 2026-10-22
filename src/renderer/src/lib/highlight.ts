import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import bash from 'highlight.js/lib/languages/bash'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import ini from 'highlight.js/lib/languages/ini'
import diff from 'highlight.js/lib/languages/diff'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('diff', diff)

const byExt: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  json: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'css',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini',
  env: 'ini',
  conf: 'ini',
  cfg: 'ini'
}

export function languageFor(path: string): string | null {
  const name = path.split('/').pop()!.toLowerCase()
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === '.gitignore' || name === '.dockerignore' || name === '.npmignore') return 'bash'
  if (name.startsWith('.env')) return 'ini'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return byExt[ext] ?? null
}

const byName: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'css',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  py: 'python',
  python: 'python',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini',
  env: 'ini',
  diff: 'diff',
  patch: 'diff'
}

/** Language for a markdown fence label such as ```ts or ```dockerfile. */
export function languageForName(name?: string | null): string | null {
  return name ? (byName[name.toLowerCase()] ?? null) : null
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Highlight `lines` as one block (so multi-line strings and comments colour correctly), then hand
 * back one HTML string per line. Spans that cross a line break are closed and reopened.
 */
export function highlightLines(lines: string[], language: string | null): string[] {
  if (!language) return lines.map(escapeHtml)
  let html: string
  try {
    html = hljs.highlight(lines.join('\n'), { language, ignoreIllegals: true }).value
  } catch {
    return lines.map(escapeHtml)
  }
  const out: string[] = []
  const open: string[] = []
  let current = ''
  const re = /<span[^>]*>|<\/span>|\n|[^<\n]+|</g
  for (const m of html.matchAll(re)) {
    const t = m[0]
    if (t === '\n') {
      out.push(current + '</span>'.repeat(open.length))
      current = open.join('')
    } else if (t.startsWith('<span')) {
      open.push(t)
      current += t
    } else if (t === '</span>') {
      open.pop()
      current += t
    } else current += t
  }
  out.push(current + '</span>'.repeat(open.length))
  // Guard against any drift: never return a different number of lines than we were given.
  return out.length === lines.length ? out : lines.map(escapeHtml)
}
