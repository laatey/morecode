import React, { useState } from 'react'
import { X } from 'lucide-react'
import { Btn, Group, Page, Pick, Row, TextInput } from '../kit'
import { useSettings, type Rule, type Settings } from '../settings-store'

const RULE_OPTIONS: { value: Rule; label: string }[] = [
  { value: 'ask', label: 'Ask me' },
  { value: 'allow', label: 'Allow' },
  { value: 'block', label: 'Never allow' }
]

const ROWS: { key: keyof Settings['rules']; title: string; description: string }[] = [
  { key: 'commands', title: 'Run commands', description: 'Things like running tests or starting your app.' },
  { key: 'install', title: 'Install packages', description: 'Add new libraries to your project.' },
  { key: 'remove', title: 'Delete files', description: 'Remove files or folders from your project.' },
  { key: 'network', title: 'Use the internet', description: 'Look things up or download files.' }
]

export function PermissionsPage(): React.JSX.Element {
  const { settings, set } = useSettings()
  const [draft, setDraft] = useState('')
  const add = (): void => {
    const c = draft.trim()
    if (c && !settings.allowedCommands.includes(c)) set({ allowedCommands: [...settings.allowedCommands, c] })
    setDraft('')
  }

  const r = settings.rules
  const trusted = settings.autoAccept && r.commands === 'allow' && r.install === 'allow' && r.network === 'allow'
  const setTrusted = (on: boolean): void =>
    set({
      autoAccept: on,
      rules: { ...r, commands: on ? 'allow' : 'ask', install: on ? 'allow' : 'ask', network: on ? 'allow' : 'ask' }
    })

  return (
    <Page title="Permissions" description="Decide what the AI can do on its own and when it should check with you first.">
      <Group title="Trust">
        <Row
          title="Trust the AI"
          description="Edits, commands, installs and internet access run without asking. Deleting files still asks. Turn it off to choose each one below."
        >
          <Pick
            value={trusted ? 'trusted' : 'careful'}
            onChange={(v) => setTrusted(v === 'trusted')}
            options={[
              { value: 'careful', label: 'Ask me' },
              { value: 'trusted', label: 'Trusted' }
            ]}
          />
        </Row>
      </Group>

      <Group title="When the AI wants to…">
        <Row title="Edit files" description="Ask me shows each change for you to keep or undo. Allow applies changes straight away.">
          <Pick
            value={settings.autoAccept ? 'allow' : 'ask'}
            onChange={(v) => set({ autoAccept: v === 'allow' })}
            options={[
              { value: 'ask', label: 'Ask me' },
              { value: 'allow', label: 'Allow' }
            ]}
          />
        </Row>
        {ROWS.map((r) => (
          <Row key={r.key} title={r.title} description={r.description}>
            <Pick
              value={settings.rules[r.key]}
              onChange={(v) => set({ rules: { ...settings.rules, [r.key]: v } })}
              options={RULE_OPTIONS}
            />
          </Row>
        ))}
      </Group>

      <Group
        title="Always-allowed commands"
        note="Commands in this list run without asking, even when “Run commands” is set to Ask me."
      >
        {settings.allowedCommands.length === 0 ? (
          <p className="py-3 text-[12px] leading-5 text-[#8e8e8a]">
            Nothing yet. When the AI asks to run a command, choose “Always allow” and it appears here.
          </p>
        ) : (
          settings.allowedCommands.map((c) => (
            <div key={c} className="flex items-center gap-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#d6d6d3]">{c}</code>
              <button
                type="button"
                aria-label={`Remove ${c}`}
                onClick={() => set({ allowedCommands: settings.allowedCommands.filter((x) => x !== c) })}
                className="grid h-6 w-6 cursor-pointer place-items-center rounded-[5px] text-[#8e8e8a] transition-colors hover:bg-white/[0.08] hover:text-[#ececea]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
        <form
          className="flex items-center gap-2 py-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <TextInput
            aria-label="Add a command"
            placeholder="npm run lint"
            className="font-mono"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Btn type="submit" disabled={!draft.trim()}>
            Add
          </Btn>
        </form>
      </Group>
    </Page>
  )
}
