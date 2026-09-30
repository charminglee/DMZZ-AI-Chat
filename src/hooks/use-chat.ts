import { useCallback, useEffect, useRef, useState } from "react"
import { streamMockReply, type MockStreamHandle } from "@/lib/mock-ai"
import { MODELS, type Conversation, type Message } from "@/lib/types"

const STORAGE_KEY = "dmzz-chat-state-v1"
const MODEL_KEY = "dmzz-chat-model"
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

function loadModel(): string {
  const saved = localStorage.getItem(MODEL_KEY)
  return saved && MODELS.some((m) => m.id === saved) ? saved : MODELS[0].id
}

function makeConversation(): Conversation {
  const now = Date.now()
  return { id: uid(), title: DEFAULT_TITLE, messages: [], createdAt: now, updatedAt: now }
}

function truncateTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean
}

export function useChat() {
  const [{ conversations, activeId }, setState] = useState<PersistedState>(loadState)
  const [model, setModel] = useState<string>(loadModel)
  const [isStreaming, setIsStreaming] = useState(false)
  const streamRef = useRef<MockStreamHandle | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeId }))
  }, [conversations, activeId])

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model)
  }, [model])

  useEffect(() => () => streamRef.current?.cancel(), [])

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null

  const patchConversation = useCallback(
    (id: string, patch: (conv: Conversation) => Conversation) => {
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === id ? patch(c) : c)),
      }))
    },
    [],
  )

  const stopStreaming = useCallback(() => {
    streamRef.current?.cancel()
    streamRef.current = null
    setIsStreaming(false)
  }, [])

  const startStream = useCallback(
    (conversationId: string, prompt: string) => {
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

      streamRef.current = streamMockReply(
        prompt,
        (chunk) => {
          patchConversation(conversationId, (conv) => ({
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === assistantMessage.id ? { ...m, content: m.content + chunk } : m,
            ),
          }))
        },
        () => {
          streamRef.current = null
          setIsStreaming(false)
          // 若流被中途取消导致内容为空，补一个停止提示
          patchConversation(conversationId, (conv) => ({
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === assistantMessage.id && m.content === ""
                ? { ...m, content: STOPPED_HINT }
                : m,
            ),
          }))
        },
      )
    },
    [patchConversation],
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

      patchConversation(targetId, (conv) => ({
        ...conv,
        title: conv.title === DEFAULT_TITLE ? truncateTitle(text) : conv.title,
        messages: [...conv.messages, userMessage],
        updatedAt: Date.now(),
      }))

      startStream(targetId, text)
    },
    [activeId, conversations, patchConversation, startStream],
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

  return {
    conversations,
    activeConversation,
    activeId,
    model,
    setModel,
    isStreaming,
    sendMessage,
    stopStreaming,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
  }
}

export type ChatController = ReturnType<typeof useChat>
