import React from 'react'

type SvgProps = React.SVGProps<SVGSVGElement>

const base: SvgProps = {
  width: 17,
  height: 17,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

export function SidebarLeftIcon(props: SvgProps): React.JSX.Element {
  return (
    <svg {...base} viewBox="0 0 20 20" strokeWidth={1.6} {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" />
      <line x1="8.5" y1="3" x2="8.5" y2="17" strokeWidth={1.5} />
    </svg>
  )
}

export function SidebarRightIcon(props: SvgProps): React.JSX.Element {
  return (
    <svg {...base} viewBox="0 0 20 20" strokeWidth={1.6} {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" />
      <line x1="10.5" y1="3" x2="10.5" y2="17" strokeWidth={1.5} />
    </svg>
  )
}

export function ShareIcon(props: SvgProps): React.JSX.Element {
  return (
    <svg {...base} viewBox="0 0 24 24" strokeWidth={1.8} {...props}>
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      <polyline points="16 7 12 3 8 7" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
