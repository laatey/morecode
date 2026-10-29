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
    <svg {...base} viewBox="0 0 24 24" strokeWidth={1.7} {...props}>
      <path d="M2 12C2 8.31087 2 6.4663 2.81382 5.15877C3.1149 4.67502 3.48891 4.25427 3.91891 3.91554C5.08116 3 6.72077 3 10 3H14C17.2792 3 18.9188 3 20.0811 3.91554C20.5111 4.25427 20.8851 4.67502 21.1862 5.15877C22 6.4663 22 8.31087 22 12C22 15.6891 22 17.5337 21.1862 18.8412C20.8851 19.325 20.5111 19.7457 20.0811 20.0845C18.9188 21 17.2792 21 14 21H10C6.72077 21 5.08116 21 3.91891 20.0845C3.48891 19.7457 3.1149 19.325 2.81382 18.8412C2 17.5337 2 15.6891 2 12Z" />
      <path d="M9.5 3L9.5 21" />
      <path d="M5 7H6M5 10H6" />
    </svg>
  )
}

export function SidebarRightIcon(props: SvgProps): React.JSX.Element {
  return (
    <svg {...base} viewBox="0 0 24 24" strokeWidth={1.7} {...props}>
      <path d="M2 12C2 8.3109 2 6.46633 2.81382 5.1588C3.1149 4.67505 3.48891 4.2543 3.91891 3.91557C5.08116 3.00003 6.72077 3.00003 10 3.00003H14C17.2792 3.00003 18.9188 3.00003 20.0811 3.91557C20.5111 4.2543 20.8851 4.67505 21.1862 5.1588C22 6.46633 22 8.3109 22 12C22 15.6892 22 17.5337 21.1862 18.8413C20.8851 19.325 20.5111 19.7458 20.0811 20.0845C18.9188 21 17.2792 21 14 21H10C6.72077 21 5.08116 21 3.91891 20.0845C3.48891 19.7458 3.1149 19.325 2.81382 18.8413C2 17.5337 2 15.6892 2 12Z" />
      <path d="M14.5 3.00003L14.5 21" />
      <path d="M18 7.00006H19M18 10.0001H19" />
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
