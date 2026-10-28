/**
 * What the terminal's prompt looks like on this computer. Commands run in cmd.exe on Windows and in a Unix shell
 * elsewhere (see src/main/terminal.ts), so the prompt follows: `C:\Users\you\app>` on Windows, `~/app %` on a Mac,
 * `~/app $` on Linux. Nothing here depends on the app, so it can be tested by itself.
 */
export type Platform = 'win32' | 'darwin' | 'linux' | (string & {})

/** The character that ends a prompt. */
export const promptGlyph = (platform: Platform): string =>
  platform === 'win32' ? '>' : platform === 'darwin' ? '%' : '$'

/** Where you are, written the way that platform's shell writes it. */
export function promptPath(cwd: string | null, platform: Platform): string {
  if (!cwd) return '…'
  if (platform === 'win32') return cwd.replace(/\//g, '\\') // a Windows prompt shows the whole path
  // a Unix prompt shows your home folder as ~ and does not run on forever
  const home = /^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/.exec(cwd)?.[1]
  const shown = home ? `~${cwd.slice(home.length)}` : cwd
  const parts = shown.split('/').filter(Boolean)
  return parts.length <= 3 ? shown : `…/${parts.slice(-2).join('/')}`
}

/** A command to try that exists on that platform's shell, for the empty-terminal hint. */
export const exampleCommand = (platform: Platform): string => (platform === 'win32' ? 'dir' : 'ls')
