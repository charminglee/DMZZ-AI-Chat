import { useEffect, useRef, useState } from "react"
import { Check, Copy, Pencil, RotateCcw, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"
import type { Conversation, Message } from "@/lib/types"

interface MessageListProps {
  conversation: Conversation
  isStreaming: boolean
  onRegenerate: () => void
  onEditMessage: (messageId: string, content: string) => void
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-2" aria-label="正在思考">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}

function AssistantAvatar() {
  return (
    <Avatar className="size-8 shrink-0">
      <AvatarFallback className="brand-gradient text-white">
        <Sparkles className="size-4" />
      </AvatarFallback>
    </Avatar>
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label={copied ? "已复制" : "复制"}
      title={copied ? "已复制" : "复制"}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function MessageList({
  conversation,
  isStreaming,
  onRegenerate,
  onEditMessage,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const composingRef = useRef(false)

  const startEdit = (message: Message) => {
    setEditingId(message.id)
    setDraft(message.content)
  }

  const commitEdit = () => {
    if (editingId && draft.trim()) onEditMessage(editingId, draft)
    setEditingId(null)
  }

  const messages = conversation.messages
  const lastMessage = messages[messages.length - 1]
  const streamingMessageId =
    isStreaming && lastMessage?.role === "assistant" ? lastMessage.id : null
  const lastAssistantId = lastMessage?.role === "assistant" ? lastMessage.id : null

  useEffect(() => {
    stickToBottom.current = true
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [conversation.id])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottom.current) return
    el.scrollTo({ top: el.scrollHeight })
  }, [messages, streamingMessageId])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < 120
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {messages.map((message) => {
          const isStreamingMessage = message.id === streamingMessageId

          if (message.role === "user") {
            const isEditing = message.id === editingId
            return (
              <div key={message.id} className="group flex flex-col items-end gap-1">
                {isEditing ? (
                  <div className="w-full max-w-[85%] rounded-2xl border bg-card p-2 shadow-sm">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value)
                        e.currentTarget.style.height = "auto"
                        e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 200)}px`
                      }}
                      onFocus={(e) => {
                        const len = e.currentTarget.value.length
                        e.currentTarget.setSelectionRange(len, len)
                      }}
                      onCompositionStart={() => {
                        composingRef.current = true
                      }}
                      onCompositionEnd={() => {
                        composingRef.current = false
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault()
                          setEditingId(null)
                        }
                        if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
                          e.preventDefault()
                          commitEdit()
                        }
                      }}
                      className="max-h-[200px] min-h-0 w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-7 outline-none"
                    />
                    <div className="mt-1 flex items-center justify-between px-1">
                      <span className="text-xs text-muted-foreground/70">
                        Enter 保存 · Esc 取消
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={!draft.trim()}
                          onClick={commitEdit}
                          className="h-7 rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap text-primary-foreground">
                    {message.content}
                  </div>
                )}
                {!isEditing && !isStreaming && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton content={message.content} />
                    <button
                      type="button"
                      aria-label="编辑"
                      title="编辑"
                      onClick={() => startEdit(message)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={message.id} className="group flex gap-3">
              <AssistantAvatar />
              <div className="min-w-0 flex-1 pt-1">
                {message.content === "" && isStreamingMessage ? (
                  <TypingDots />
                ) : (
                  <>
                    <Markdown content={message.content} />
                    {isStreamingMessage && (
                      <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse rounded-sm bg-foreground/70" />
                    )}
                  </>
                )}
                {!isStreamingMessage && message.content !== "" && (
                  <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton content={message.content} />
                    {message.id === lastAssistantId && !isStreaming && (
                      <button
                        type="button"
                        aria-label="重新生成"
                        title="重新生成"
                        onClick={onRegenerate}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div className={cn("h-px", streamingMessageId && "animate-pulse")} />
      </div>
    </div>
  )
}
