import { useEffect, useRef, useState } from "react"
import { Check, Copy, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/lib/types"

interface MessageListProps {
  conversation: Conversation
  isStreaming: boolean
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
      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
        <Sparkles className="size-4" />
      </AvatarFallback>
    </Avatar>
  )
}

function UserAvatar() {
  return (
    <Avatar className="size-8 shrink-0">
      <AvatarFallback className="bg-muted font-medium text-muted-foreground">
        我
      </AvatarFallback>
    </Avatar>
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label="复制全文"
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "已复制" : "复制"}
    </button>
  )
}

export function MessageList({ conversation, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const messages = conversation.messages
  const lastMessage = messages[messages.length - 1]
  const streamingMessageId =
    isStreaming && lastMessage?.role === "assistant" ? lastMessage.id : null

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
            return (
              <div key={message.id} className="flex justify-end gap-3">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap text-primary-foreground">
                  {message.content}
                </div>
                <UserAvatar />
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
                  <div className="mt-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton content={message.content} />
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
