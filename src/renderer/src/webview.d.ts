import type * as React from 'react'

/** Teaches TypeScript about Electron's <webview> tag, which the Browser tab uses. */
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: boolean
      }
    }
  }
}
