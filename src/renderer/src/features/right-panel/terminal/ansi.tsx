import React from 'react'

const COLORS: Record<number, string> = {
  30: '#6b6b68',
  31: '#f0746c',
  32: '#5fd17a',
  33: '#e8b365',
  34: '#6ea8fe',
  35: '#c792ea',
  36: '#56d4dd',
  37: '#d6d6d3',
  90: '#8d8d8a',
  91: '#ff8f87',
  92: '#7ee495',
  93: '#f3c987',
  94: '#8dbaff',
  95: '#d9aef5',
  96: '#7ae3ea',
  97: '#ffffff'
}

interface Style {
  color?: string
  bold?: boolean
  dim?: boolean
}

// every escape sequence that is not a colour/style (cursor moves, clears, titles) is dropped
// eslint-disable-next-line no-control-regex
const OTHER_ESCAPES = /\u001b\[[0-9;?]*[A-LN-Za-z]|\u001b\][^\u0007]*\u0007/g
// eslint-disable-next-line no-control-regex
const SGR = /\u001b\[([0-9;]*)m/g

function apply(style: Style, codes: number[]): Style {
  let next = { ...style }
  for (const c of codes) {
    if (c === 0) next = {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 22) next = { ...next, bold: false, dim: false }
    else if (c === 39) next.color = undefined
    else if (COLORS[c]) next.color = COLORS[c]
  }
  return next
}

/** Progress bars rewrite the same line with \r; keep only what the line ends up showing. */
const settleCarriageReturns = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.includes('\r') ? (line.split('\r').filter(Boolean).pop() ?? '') : line))
    .join('\n')

/** Turn terminal output with colour codes into styled spans. */
export function Ansi({ text }: { text: string }): React.JSX.Element {
  const clean = settleCarriageReturns(text).replace(OTHER_ESCAPES, '')
  const out: React.ReactNode[] = []
  let style: Style = {}
  let last = 0
  let key = 0
  const push = (piece: string): void => {
    if (!piece) return
    out.push(
      <span
        key={key++}
        style={{
          color: style.color,
          fontWeight: style.bold ? 600 : undefined,
          opacity: style.dim ? 0.65 : undefined
        }}
      >
        {piece}
      </span>
    )
  }
  for (const m of clean.matchAll(SGR)) {
    push(clean.slice(last, m.index))
    style = apply(style, m[1] === '' ? [0] : m[1].split(';').map(Number))
    last = (m.index ?? 0) + m[0].length
  }
  push(clean.slice(last))
  return <>{out}</>
}
