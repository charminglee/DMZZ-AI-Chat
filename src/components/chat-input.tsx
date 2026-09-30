import { useLayoutEffect, useRef, useState } from "react"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface ChatInputProps {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  immersive: boolean
}

const MAX_HEIGHT = 200

export function ChatInput({ onSend, onStop, isStreaming, immersive }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming) return
    onSend(text)
    setValue("")
    // 保持输入焦点，便于连续对话
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <div className="shrink-0 bg-background pb-4 pt-1">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="rounded-3xl border bg-card shadow-sm transition-shadow focus-within:shadow-md">
          <Textarea
            ref={textareaRef}
            value={value}
            rows={1}
            placeholder="给 DMZZ AI 发送消息..."
            className="max-h-[200px] min-h-0 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            onChange={(e) => setValue(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              composingRef.current = false
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <span
              className={cn(
                "hidden pl-1.5 text-xs text-muted-foreground/70 transition-opacity duration-300 sm:block",
                immersive && "opacity-0",
              )}
            >
              Enter 发送 · Shift + Enter 换行
            </span>
            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                className="size-8 rounded-full"
                onClick={onStop}
                aria-label="停止生成"
                title="停止生成"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className={cn(
                  "size-8 rounded-full transition-opacity",
                  !value.trim() && "opacity-50",
                )}
                disabled={!value.trim()}
                onClick={submit}
                aria-label="发送"
                title="发送"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
