import React from 'react'

/** A small "letters in a rounded square" badge, the way editors draw JS, TS, CSS and similar files. */
function Badge({ label, color, size = 7.2 }: { label: string; color: string; size?: number }): React.JSX.Element {
  return (
    <>
      <rect x="1" y="1" width="14" height="14" rx="3.6" fill="#2b2a24" stroke={color} strokeOpacity="0.55" strokeWidth="1" />
      <text x="8" y="11.1" textAnchor="middle" fontSize={size} fontWeight="700" fontFamily="system-ui, sans-serif" fill={color}>
        {label}
      </text>
    </>
  )
}

const Braces = ({ color }: { color: string }): React.JSX.Element => (
  <path
    d="M5.6 2.5C4.2 2.5 3.8 3.3 3.8 4.4v1.3c0 .8-.5 1.3-1.3 1.6v1.4c.8.3 1.3.8 1.3 1.6v1.3c0 1.1.4 1.9 1.8 1.9M10.4 2.5c1.4 0 1.8.8 1.8 1.9v1.3c0 .8.5 1.3 1.3 1.6v1.4c-.8.3-1.3.8-1.3 1.6v1.3c0 1.1-.4 1.9-1.8 1.9"
    fill="none"
    stroke={color}
    strokeWidth="1.3"
    strokeLinecap="round"
    transform="translate(0 .1)"
  />
)

const Whale = (): React.JSX.Element => (
  <g fill="#2f9bf0">
    <rect x="3.2" y="5.2" width="1.9" height="1.7" rx=".2" />
    <rect x="5.4" y="5.2" width="1.9" height="1.7" rx=".2" />
    <rect x="7.6" y="5.2" width="1.9" height="1.7" rx=".2" />
    <rect x="5.4" y="3.2" width="1.9" height="1.7" rx=".2" />
    <rect x="7.6" y="3.2" width="1.9" height="1.7" rx=".2" />
    <rect x="7.6" y="1.3" width="0" height="0" />
    <path d="M1 7.5h11.6c.4-.8.9-1.3 1.7-1.5.5.5.6 1.2.4 1.8-.7 2.7-3.2 4.2-6.6 4.2C4.4 12 1.9 10.6 1 7.5Z" />
  </g>
)

const File = (): React.JSX.Element => (
  <path d="M4 1.6h5l3.2 3.2v8.9c0 .4-.3.7-.7.7H4a.7.7 0 0 1-.7-.7V2.3c0-.4.3-.7.7-.7Z" fill="#8c8c88" fillOpacity=".85" />
)

const ImageGlyph = (): React.JSX.Element => (
  <g fill="none" stroke="#7bc98f" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <circle cx="5.7" cy="6.3" r="1" />
    <path d="m2.6 11.6 3.3-3 2.4 2.1 1.9-1.6 3 2.5" />
  </g>
)

/** Which badge a file name gets. The first match wins. */
function pick(name: string): React.JSX.Element {
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.endsWith('.dockerfile')) return <Whale />
  if (lower === 'package.json' || lower === 'package-lock.json' || ext === 'json' || ext === 'jsonc') return <Braces color="#f0883e" />
  if (['js', 'mjs', 'cjs'].includes(ext)) return <Badge label="JS" color="#f0c93b" />
  if (['ts', 'mts', 'cts'].includes(ext)) return <Badge label="TS" color="#4aa3f5" />
  if (ext === 'jsx') return <Badge label="JSX" color="#5fd0e8" size={5.4} />
  if (ext === 'tsx') return <Badge label="TSX" color="#4aa3f5" size={5.4} />
  if (ext === 'css' || ext === 'scss' || ext === 'less') return <Badge label="CSS" color="#6c9ff5" size={5.4} />
  if (ext === 'html' || ext === 'htm') return <Badge label="HTM" color="#f08a4b" size={5.4} />
  if (ext === 'md' || ext === 'mdx') return <Badge label="MD" color="#9bb7d4" />
  if (ext === 'py') return <Badge label="PY" color="#5aa7e6" />
  if (ext === 'yml' || ext === 'yaml') return <Badge label="YML" color="#e0707a" size={5.4} />
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'ps1') return <Badge label="SH" color="#8fd18f" />
  if (ext === 'sql') return <Badge label="SQL" color="#e3b35a" size={5.4} />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(ext)) return <ImageGlyph />
  return <File />
}

/** The icon for a file, chosen from its name. */
export function FileIcon({ name, className }: { name: string; className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className ?? 'h-4 w-4 shrink-0'}>
      {pick(name)}
    </svg>
  )
}
