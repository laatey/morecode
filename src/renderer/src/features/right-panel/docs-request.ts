/** Lets other parts of the app ask the Docs tab to open a file (the tab may not be on screen yet). */
let pending: { path: string; edit: boolean } | null = null

export function requestOpenDoc(path: string, edit = false): void {
  pending = { path, edit }
  window.dispatchEvent(new Event('docs:open'))
}

export function takeDocRequest(): { path: string; edit: boolean } | null {
  const p = pending
  pending = null
  return p
}

export const NOTES_FILE = 'AGENTS.md'

export const NOTES_STARTER = `# Project notes

Notes for the AI (and for new teammates). The AI reads this file at the start of every chat.

## What this project is

One or two sentences.

## How it is organised

- \`src/\` the app code
- \`docs/\` guides

## Commands

- Install: \`npm install\`
- Run: \`npm run dev\`
- Check: \`npm run typecheck\`

## Conventions

- Keep changes small and explain them in plain language.
- Add or update tests for new behaviour.
`
