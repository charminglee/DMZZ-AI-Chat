import { useEffect, useLayoutEffect, useRef, useState } from "react"
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

/** 单批新增文本超过此长度（整段跳变）时不做晕开动画，避免大面积闪烁 */
const MAX_INK_CHARS = 240

/**
 * 流式正文：每批新到达的文本做「墨迹晕开」淡入，光标跟随正文末尾。
 *
 * 实现要点（对 Markdown 渲染的纯文本做临时装饰，不改动任何字符）：
 * - 新片段被临时包成 <span class="stream-ink">，下一批到达前在 effect 清理里还原；
 * - React 就地更新文本节点，若它已被写入新内容则只需移除装饰 span（此时残缺字符
 *   已包含在新文本里），只有未被改写时才把拆出去的后缀拼回，保证文本零丢失；
 * - 光标为手动创建的元素（React 不感知），避免与就地更新/结构变化互相干扰。
 */
function StreamingBody({ content, streaming }: { content: string; streaming: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement | null>(null)
  /** 已提交到 DOM 的内容，作为增量计算基准 */
  const committedRef = useRef("")
  const splitRef = useRef<{ node: Text; span: HTMLSpanElement; prefix: string } | null>(null)

  const restore = () => {
    const split = splitRef.current
    if (!split) return
    splitRef.current = null
    const { node, span, prefix } = split
    if (node.parentNode && node.data === prefix) {
      node.data = prefix + (span.textContent ?? "")
    }
    span.remove()
  }

  useLayoutEffect(() => {
    const host = hostRef.current
    const prev = committedRef.current
    committedRef.current = content
    if (!host) return

    let caret = caretRef.current
    if (!caret) {
      caret = document.createElement("span")
      caret.setAttribute("aria-hidden", "true")
      caretRef.current = caret
    }
    caret.className = streaming ? "stream-caret is-live" : "stream-caret is-done"

    const delta = content.startsWith(prev) ? content.slice(prev.length) : ""
    if (streaming && delta.length > 0 && delta.length <= MAX_INK_CHARS) {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
      let node: Text | null = null
      for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
        const text = t as Text
        if (text.data.length > 0) node = text
      }
      if (node) {
        // 渲染层会剥掉 markdown 标记（**、- 等），用「与增量末尾的最长共同后缀」
        // 定位正文里真正新增的可见文字
        const data = node.data
        let take = 0
        for (let len = Math.min(delta.length, data.length); len > 0; len--) {
          if (data.endsWith(delta.slice(-len))) {
            take = len
            break
          }
        }
        if (take > 0) {
          const span = document.createElement("span")
          span.className = "stream-ink"
          span.textContent = data.slice(-take)
          const prefix = data.slice(0, -take)
          node.data = prefix
          node.after(span)
          splitRef.current = { node, span, prefix }
        }
      }
    }

    // 光标移到正文末尾：代码块内落在代码行尾；引用/列表等容器钻进最后一个子块，
    // 其余落在最后一个块级元素末尾，保证光标始终贴着末行文字
    const markdownRoot = host.lastElementChild
    let lastBlock = markdownRoot?.lastElementChild ?? markdownRoot
    if (lastBlock) {
      const inner = lastBlock.lastElementChild
      if (inner && (inner.tagName === "P" || inner.tagName === "LI")) lastBlock = inner
      const code = lastBlock.querySelector("pre > code")
      ;(code ?? lastBlock).appendChild(caret)
    } else if (markdownRoot) {
      markdownRoot.appendChild(caret)
    } else {
      host.appendChild(caret)
    }

    return restore
  }, [content, streaming])

  useEffect(
    () => () => {
      caretRef.current?.remove()
      caretRef.current = null
    },
    [],
  )

  return (
    <div ref={hostRef} data-slot="stream-body">
      <Markdown content={content} />
    </div>
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
                  <StreamingBody content={message.content} streaming={isStreamingMessage} />
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
