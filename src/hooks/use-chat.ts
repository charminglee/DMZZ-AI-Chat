import { useCallback, useEffect, useRef, useState } from "react"
import { streamChatCompletion, type ChatTurn, type StreamHandle } from "@/lib/api"
import { streamSiteChat } from "@/lib/site-channel"
import type { ApiSettings, Conversation, Message } from "@/lib/types"

const STORAGE_KEY = "dzmm-chat-state-v1"
const DEFAULT_TITLE = "新对话"
const STOPPED_HINT = "*(已停止生成)*"

interface PersistedState {
  conversations: Conversation[]
  activeId: string | null
}

function uid(): string {
  return crypto.randomUUID()
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { conversations: [], activeId: null }
    const parsed = JSON.parse(raw) as PersistedState
    if (!Array.isArray(parsed.conversations)) {
      return { conversations: [], activeId: null }
    }
    return parsed
  } catch {
    return { conversations: [], activeId: null }
  }
}

function makeConversation(): Conversation {
  const now = Date.now()
  return { id: uid(), title: DEFAULT_TITLE, messages: [], createdAt: now, updatedAt: now }
}

function truncateTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean
}

export function useChat(settings: ApiSettings, userId: string) {
  const [{ conversations, activeId }, setState] = useState<PersistedState>(loadState)
  const [isStreaming, setIsStreaming] = useState(false)
  const streamRef = useRef<StreamHandle | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeId }))
  }, [conversations, activeId])

  useEffect(() => () => streamRef.current?.cancel(), [])

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  const patchConversation = useCallback(
    (id: string, patch: (conv: Conversation) => Conversation) => {
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === id ? patch(c) : c)),
      }))
    },
    [],
  )

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, patch: (m: Message) => Message) => {
      patchConversation(conversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      }))
    },
    [patchConversation],
  )

  const stopStreaming = useCallback(() => {
    streamRef.current?.cancel()
    streamRef.current = null
    setIsStreaming(false)
  }, [])

  const startAssistant = useCallback(
    (conversationId: string, history: ChatTurn[]) => {
      const assistantMessage: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      }

      patchConversation(conversationId, (conv) => ({
        ...conv,
        messages: [...conv.messages, assistantMessage],
        updatedAt: Date.now(),
      }))
      setIsStreaming(true)

      const onChunk = (chunk: string) => {
        patchMessage(conversationId, assistantMessage.id, (m) => ({
          ...m,
          content: m.content + chunk,
        }))
      }

      const onDone = () => {
        streamRef.current = null
        setIsStreaming(false)
        // 流被中途取消且内容为空时，补一个停止提示
        patchMessage(conversationId, assistantMessage.id, (m) =>
          m.content === "" ? { ...m, content: STOPPED_HINT } : m,
        )
      }

      const onError = (error: Error) => {
        streamRef.current = null
        setIsStreaming(false)
        patchMessage(conversationId, assistantMessage.id, (m) =>
          m.content === "" ? { ...m, content: `⚠️ ${error.message}` } : m,
        )
      }

      if (settings.mode === "web") {
        // 网页通道：站点对话 id 挂在本地对话上，首次发送时创建
        const siteChatId = conversations.find((c) => c.id === conversationId)?.siteChatId ?? null
        streamRef.current = streamSiteChat({
          settings,
          messages: history,
          siteChatId,
          onSiteChatId: (id) =>
            patchConversation(conversationId, (conv) => ({ ...conv, siteChatId: id })),
          onChunk,
          onDone,
          onError,
        })
      } else {
        streamRef.current = streamChatCompletion({
          settings,
          messages: history,
          conversationId,
          requestId: `dzmm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          onChunk,
          onDone,
          onError,
        })
      }
    },
    [conversations, patchConversation, patchMessage, settings, userId],
  )

  const sendMessage = useCallback(
    (content: string) => {
      const text = content.trim()
      if (!text || streamRef.current) return

      const userMessage: Message = {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      }

      let targetId = activeId
      if (!targetId || !conversations.some((c) => c.id === targetId)) {
        const conv = makeConversation()
        targetId = conv.id
        setState((prev) => ({
          conversations: [...prev.conversations, conv],
          activeId: conv.id,
        }))
      }

      // 送给模型的历史：既有消息 + 本轮用户输入（不含助手占位与错误提示行）
      const prior = conversations.find((c) => c.id === targetId)?.messages ?? []
      const history: ChatTurn[] = [...prior, userMessage]
        .filter((m) => !m.content.startsWith("⚠️"))
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      patchConversation(targetId, (conv) => ({
        ...conv,
        title: conv.title === DEFAULT_TITLE ? truncateTitle(text) : conv.title,
        messages: [...conv.messages, userMessage],
        updatedAt: Date.now(),
      }))

      startAssistant(targetId, history)
    },
    [activeId, conversations, patchConversation, startAssistant],
  )

  const newConversation = useCallback(() => {
    streamRef.current?.cancel()
    streamRef.current = null
    setIsStreaming(false)

    // 当前已是一个空白对话时，直接聚焦它即可
    const current = conversations.find((c) => c.id === activeId)
    if (current && current.messages.length === 0) return

    const conv = makeConversation()
    setState((prev) => ({
      // 顺带清掉遗留的空白对话，避免列表堆积
      conversations: [...prev.conversations.filter((c) => c.messages.length > 0), conv],
      activeId: conv.id,
    }))
  }, [activeId, conversations])

  const selectConversation = useCallback((id: string) => {
    streamRef.current?.cancel()
    streamRef.current = null
    setIsStreaming(false)
    setState((prev) => ({ ...prev, activeId: id }))
  }, [])

  const deleteConversation = useCallback((id: string) => {
    streamRef.current?.cancel()
    streamRef.current = null
    setIsStreaming(false)
    setState((prev) => {
      const rest = prev.conversations.filter((c) => c.id !== id)
      const latest = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const nextActive = prev.activeId === id ? (latest?.id ?? null) : prev.activeId
      return { conversations: rest, activeId: nextActive }
    })
  }, [])

  const renameConversation = useCallback(
    (id: string, title: string) => {
      const clean = title.trim()
      if (!clean) return
      patchConversation(id, (conv) => ({ ...conv, title: truncateTitle(clean) }))
    },
    [patchConversation],
  )

  /** 重新生成：回到最后一条用户消息，丢弃其后的助手回复并重新请求 */
  const regenerate = useCallback(() => {
    const conv = conversations.find((c) => c.id === activeId)
    if (!conv || streamRef.current) return

    let lastUserIndex = -1
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === "user") {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex < 0) return

    const kept = conv.messages.slice(0, lastUserIndex + 1)
    patchConversation(conv.id, (c) => ({ ...c, messages: kept, updatedAt: Date.now() }))

    const history: ChatTurn[] = kept
      .filter((m) => !m.content.startsWith("⚠️"))
      .map((m) => ({ role: m.role, content: m.content }))

    startAssistant(conv.id, history)
  }, [activeId, conversations, patchConversation, startAssistant])

  /** 编辑用户消息：替换内容，丢弃其后的所有消息并重新生成 */
  const editMessage = useCallback(
    (messageId: string, content: string) => {
      const conv = conversations.find((c) => c.id === activeId)
      const text = content.trim()
      if (!conv || !text || streamRef.current) return

      const index = conv.messages.findIndex((m) => m.id === messageId)
      if (index < 0) return

      const kept = conv.messages
        .slice(0, index + 1)
        .map((m) => (m.id === messageId ? { ...m, content: text } : m))
      patchConversation(conv.id, (c) => ({ ...c, messages: kept, updatedAt: Date.now() }))

      const history: ChatTurn[] = kept
        .filter((m) => !m.content.startsWith("⚠️"))
        .map((m) => ({ role: m.role, content: m.content }))

      startAssistant(conv.id, history)
    },
    [activeId, conversations, patchConversation, startAssistant],
  )

  return {
    conversations,
    activeConversation,
    activeId,
    isStreaming,
    sendMessage,
    stopStreaming,
    regenerate,
    editMessage,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
  }
}

export type ChatController = ReturnType<typeof useChat>
