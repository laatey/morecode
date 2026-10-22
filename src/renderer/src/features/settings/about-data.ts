import { HOSTED, hostedRequest } from '@/features/auth/http-auth-service'

export interface UpdateResult {
  current: string
  latest: string
  upToDate: boolean
}

/** Asks the MoreCode server for the newest release. Without a server there is nothing to compare with. */
export async function checkForUpdates(current: string): Promise<UpdateResult> {
  if (!HOSTED) return { current, latest: current, upToDate: true }
  const r = await hostedRequest<{ latest: string; upToDate: boolean }>('GET', `/v1/updates/latest?version=${encodeURIComponent(current)}`)
  return { current, latest: r.latest, upToDate: r.upToDate }
}

export interface BugReport {
  message: string
  diagnostics?: Record<string, string>
}

/** Sends the report to the server and returns a reference the person can quote to support. */
export async function sendBugReport(report: BugReport): Promise<string> {
  if (!HOSTED) throw new Error('Reports need a MoreCode server connection.')
  const r = await hostedRequest<{ id: string }>('POST', '/v1/feedback', { kind: 'bug', message: report.message, details: report.diagnostics })
  return `BUG-${r.id.slice(0, 6).toUpperCase()}`
}

export const DOCS_URL = 'https://morecode.app/docs'
export const SUPPORT_URL = 'https://morecode.app/support'

export interface Release {
  version: string
  date: string
  items: string[]
}

export const RELEASES: Release[] = [
  {
    version: '1.0.0',
    date: 'Today',
    items: [
      'Sign in, pick a project and start with a short tour',
      'Slash commands for usage, context, stats, model and status',
      'Changes, Tasks, Plan, Terminal, Browser and Docs in the right sidebar',
      'Settings, keyboard shortcuts, billing, notifications and a command palette'
    ]
  }
]
