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
import { forgetSessionEdit, recordSessionEdit, recordUsage } from '@/features/billing/usage-log'
import { mockAgent } from './agent/mock-agent'
import { makeRealRunner, type RealConfig } from './agent/real-agent'
import { useConnectors } from '@/features/connectors/connectors-store'
import { toast } from 'sonner'
import { routeFor } from './ai-route'
import { resolveModel } from './models'
import { useChat, type Policy } from './use-chat'
import type { AgentRunner } from './types'
import type { Attachment, Msg, TodoItem, ToolBlock } from './types'

type BaseChat = ReturnType<typeof useChat>
type ChatApi = Omit<BaseChat, 'retry' | 'edit' | 'send'> & {
  /** Send a message. Returns false when it was not sent (no messages left, or the plan lacks the model). */
  send: (
    prompt: string,
    images: string[],
    model: string,
    autoAccept: boolean,
    attachments?: Attachment[],
    shown?: string
  ) => boolean
  /** Run the message before this reply again. */
  retry: (agentId: string, modelOverride?: string) => void
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
  const { getMessages, saveMessages, active, groups } = useWorkspace()
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
  const { account, service, refreshAccount } = useAuth()
  const route = useMemo(
    () =>
      routeFor({
        model: resolveModel(settings.model),
        settings,
        account,
        hosted: service.hosted ?? null
      }),
    [settings, account, service.hosted]
  )
  const { forRun: connectorsForRun } = useConnectors()
  const config = useMemo<RealConfig>(() => {
    const projectPath = groups.find((group) => group.id === active.projectId)?.folder
    return {
      apiKey: route.apiKey,
      baseUrl: route.baseUrl,
      // only requests that go through the MoreCode server carry its run and time-zone headers
      hosted: route.kind === 'subscription' && Boolean(route.baseUrl),
      missing: route.missing,
      projectPath,
      chatId: active.id,
      style: account?.profile?.experience ?? 'some',
      connectors: connectorsForRun,
      onUsage: (u) => {
        recordUsage(account?.id ?? 'guest', {
          model: u.model,
          input: u.input,
          output: u.output,
          cacheRead: u.cacheRead,
          cacheWrite: u.cacheWrite,
          context: u.contextTokens,
          ms: u.ms
        })
        // a message through the plan was just counted by the server: show its count, not an estimate
        if (route.kind === 'subscription') refreshAccount()
      }
    }
  }, [route, account, active.id, active.projectId, groups, refreshAccount, connectorsForRun])
  const runner = useMemo<AgentRunner>(
    () =>
      typeof window !== 'undefined' && window.api?.agent
        ? makeRealRunner(() => config)
        : mockAgent,
    [config]
  )

  const chat = useChat(
    runner,
    first,
    chatId,
    getPolicy,
    (edit) => {
      recordSessionEdit(account?.id ?? 'guest', edit.id, edit.added, edit.removed)
    },
    (id) => {
      forgetSessionEdit(account?.id ?? 'guest', id)
    }
  )
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
  const { spendMessage, openPlanDialog } = useAuth()
  /** May this message go? Subscription messages must be on a model the plan includes and count against its limit. */
  const admit = useCallback((): boolean => {
    if (route.blocked) {
      toast.error(route.blocked)
      openPlanDialog('upgrade')
      return false
    }
    return !route.metered || spendMessage()
  }, [route, spendMessage, openPlanDialog])
  const sendMessage = useCallback(
    (
      prompt: string,
      images: string[],
      model: string,
      autoAccept: boolean,
      attachments?: Attachment[],
      shown?: string
    ): boolean => {
      if (!admit()) return false
      send(prompt, images, model, autoAccept, attachments, shown)
      return true
    },
    [send, admit]
  )
  const ask = useCallback(
    (prompt: string) => void sendMessage(prompt, [], model, autoAccept),
    [sendMessage, model, autoAccept]
  )
  const retry = useCallback(
    (agentId: string, modelOverride?: string) => {
      if (admit()) retryRun(agentId, modelOverride ?? model, autoAccept)
    },
    [retryRun, model, autoAccept, admit]
  )
  const edit = useCallback(
    (userId: string, text: string) => {
      if (admit()) editRun(userId, text, model, autoAccept)
    },
    [editRun, model, autoAccept, admit]
  )
  const value = useMemo<ChatApi>(
    () => ({ ...chat, send: sendMessage, retry, edit, model, setModel, autoAccept, setAutoAccept, ask }),
    [chat, sendMessage, retry, edit, model, setModel, autoAccept, setAutoAccept, ask]
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
