import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useAuth } from '@/features/auth/auth-store'
import { useWorkspace } from '@/features/workspace/workspace-store'
import { useSettings } from '@/features/settings/settings-store'
import { useNotify } from '@/features/settings/notifications'
import { recordPlans } from '@/features/right-panel/plan-history'
import { recordUsage } from '@/features/billing/usage-log'
import { mockAgent } from './agent/mock-agent'
import { makeRealRunner, type RealConfig } from './agent/real-agent'
import { isKaggleQwen, isMorlineGateway, resolveModel } from './models'
import { useChat, type Policy } from './use-chat'
import type { AgentRunner } from './types'
import type { Msg, TodoItem, ToolBlock } from './types'

type BaseChat = ReturnType<typeof useChat>
type ChatApi = Omit<BaseChat, 'retry' | 'edit'> & {
  /** Run the message before this reply again. */
  retry: (agentId: string) => void
  /** Replace a sent message and run it again from there. */
  edit: (userId: string, text: string) => void
  model: string
  setModel: (id: string) => void
  autoAccept: boolean
  setAutoAccept: (v: boolean | ((v: boolean) => boolean)) => void
  /** Send a text message using the current model and edit mode (used by the side panels). */
  ask: (prompt: string) => void
}
type Tool<K extends ToolBlock['kind']> = Extract<ToolBlock, { kind: K }>

const Ctx = createContext<ChatApi | null>(null)

/**
 * The open chat, so the side panels (Changes, Tasks, Plan, Terminal) see what the AI does.
 * When `chatId` changes the messages are swapped for that chat's; the rest of the app stays mounted.
 */
export function ChatProvider({
  chatId,
  children
}: {
  chatId: string
  children: React.ReactNode
}): React.JSX.Element {
  const { getMessages, saveMessages } = useWorkspace()
  const [first] = useState(() => getMessages(chatId))
  const { settings, set } = useSettings()
  const notify = useNotify()

  // the agent reads the person's permission settings fresh each time it asks
  const policy = useRef<Policy | null>(null)
  useEffect(() => {
    policy.current = {
      rules: settings.rules,
      allowed: settings.allowedCommands,
      remember: (command) => {
        if (!settings.allowedCommands.includes(command)) {
          set({ allowedCommands: [...settings.allowedCommands, command] })
        }
      },
      notify: (title, body) => notify('permission', title, body)
    }
  })
  const getPolicy = useCallback(() => policy.current as Policy, [])

  // The real AI in the desktop app; a scripted demo only in a plain browser, where there is no file access.
  const { account, service } = useAuth()
  const config = useRef<RealConfig>({ apiKey: null, style: 'some', onUsage: () => undefined })
  useEffect(() => {
    const useKaggle = isKaggleQwen(settings.model)
    const useMorlineGateway = isMorlineGateway(settings.model)
    config.current = {
      // your own key goes straight to the AI; otherwise the MoreCode server does it under your plan
      apiKey: useKaggle
        ? settings.kaggleToken || null
        : useMorlineGateway
          ? settings.morlineGatewayKey || null
        : (account?.apiKey ?? service.hosted?.token() ?? null),
      baseUrl: useKaggle
        ? settings.kaggleEndpoint || undefined
        : useMorlineGateway
          ? settings.morlineGatewayUrl || undefined
        : !account?.apiKey && service.hosted
          ? `${service.hosted.url}/v1/ai`
          : undefined,
      hosted: !useKaggle && !useMorlineGateway && !account?.apiKey && Boolean(service.hosted),
      forceModel: useKaggle
        ? undefined
        : !account?.apiKey && service.hosted && account?.plan === 'free'
          ? 'claude-haiku-5-5'
          : undefined,
      style: account?.profile?.experience ?? 'some',
      onUsage: (u) => {
        if (account) {
          recordUsage(account.id, {
            model: u.model,
            input: u.input,
            output: u.output,
            cacheRead: u.cacheRead,
            cacheWrite: u.cacheWrite,
            context: u.contextTokens,
            ms: u.ms
          })
        }
      }
    }
  })
  const runner = useMemo<AgentRunner>(
    () =>
      typeof window !== 'undefined' && window.api?.agent
        ? makeRealRunner(() => config.current)
        : mockAgent,
    []
  )

  const chat = useChat(runner, first, chatId, getPolicy)
  const { load, owner, messages } = chat

  // before paint, so the old chat never flashes
  useLayoutEffect(() => {
    if (owner !== chatId) load(chatId, getMessages(chatId))
  }, [chatId, owner, load, getMessages])

  // only save messages that belong to the open chat
  useEffect(() => {
    if (owner === chatId) saveMessages(chatId, messages)
  }, [chatId, owner, messages, saveMessages])

  // keep every plan the AI makes, so older ones can be read and run again from the Plan tab
  useEffect(() => {
    if (owner !== chatId) return
    const plans = messages.flatMap((m) =>
      m.role === 'agent'
        ? m.parts.flatMap((p) => (p.type === 'tool' && p.tool.kind === 'plan' ? [p.tool] : []))
        : []
    )
    if (plans.length) recordPlans(chatId, plans)
  }, [chatId, owner, messages])

  // model and edit mode are saved settings, so they survive a restart
  const model = resolveModel(settings.model)
  const autoAccept = settings.autoAccept
  const setModel = useCallback((id: string) => set({ model: id }), [set])
  const setAutoAccept = useCallback(
    (v: boolean | ((v: boolean) => boolean)) =>
      set({ autoAccept: typeof v === 'function' ? v(settings.autoAccept) : v }),
    [set, settings.autoAccept]
  )
  const { send, retry: retryRun, edit: editRun } = chat
  const { spendMessage } = useAuth()
  const ask = useCallback(
    (prompt: string) => {
      if (isKaggleQwen(model) || isMorlineGateway(model) || spendMessage()) send(prompt, [], model, autoAccept)
    },
    [send, model, autoAccept, spendMessage]
  )
  const retry = useCallback(
    (agentId: string) => {
      if (isKaggleQwen(model) || isMorlineGateway(model) || spendMessage()) retryRun(agentId, model, autoAccept)
    },
    [retryRun, model, autoAccept, spendMessage]
  )
  const edit = useCallback(
    (userId: string, text: string) => {
      if (isKaggleQwen(model) || isMorlineGateway(model) || spendMessage()) editRun(userId, text, model, autoAccept)
    },
    [editRun, model, autoAccept, spendMessage]
  )
  const value = useMemo<ChatApi>(
    () => ({ ...chat, retry, edit, model, setModel, autoAccept, setAutoAccept, ask }),
    [chat, retry, edit, model, setModel, autoAccept, setAutoAccept, ask]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatContext(): ChatApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useChatContext must be used inside <ChatProvider>')
  return ctx
}

export interface ChatInsights {
  /** Every file edit, oldest first. */
  edits: Tool<'edit'>[]
  /** Commands the agent ran, oldest first. */
  commands: Tool<'command'>[]
  /** The most recent task list, if any. */
  todos: TodoItem[]
  /** The most recent plan, if any. */
  plan: Tool<'plan'> | null
}

const toolsOf = (messages: Msg[]): ToolBlock[] =>
  messages.flatMap((m) =>
    m.role === 'agent' ? m.parts.flatMap((p) => (p.type === 'tool' ? [p.tool] : [])) : []
  )

/** Things the side panels show, pulled out of the message history. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChatInsights(): ChatInsights {
  const { messages } = useChatContext()
  return useMemo(() => {
    const tools = toolsOf(messages)
    const edits = tools.filter((t): t is Tool<'edit'> => t.kind === 'edit')
    const commands = tools.filter((t): t is Tool<'command'> => t.kind === 'command')
    const lists = tools.filter((t): t is Tool<'todos'> => t.kind === 'todos')
    const plans = tools.filter((t): t is Tool<'plan'> => t.kind === 'plan')
    return {
      edits,
      commands,
      todos: lists.length ? lists[lists.length - 1].items : [],
      plan: plans.length ? plans[plans.length - 1] : null
    }
  }, [messages])
}
