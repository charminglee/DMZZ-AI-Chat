import { BookOpen, Code2, Lightbulb, PenLine, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface WelcomeScreenProps {
  onPick: (prompt: string) => void
  modelName: string
}

const SUGGESTIONS = [
  {
    icon: Code2,
    title: "写代码",
    description: "用 React 写一个防抖 Hook",
    prompt: "帮我用 React 写一个防抖 Hook，并解释一下防抖和节流的区别",
  },
  {
    icon: BookOpen,
    title: "学概念",
    description: "React 核心概念学习路线",
    prompt: "我想学 React，给我一条清晰的学习路线",
  },
  {
    icon: PenLine,
    title: "文案写作",
    description: "来一首关于代码的小诗",
    prompt: "写一首关于深夜写代码的小诗",
  },
  {
    icon: Lightbulb,
    title: "认识我",
    description: "这个应用是什么",
    prompt: "你是谁？介绍一下你自己",
  },
]

export function WelcomeScreen({ onPick, modelName }: WelcomeScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
        <Sparkles className="size-7" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        今天我能帮你什么？
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        当前模型 {modelName}
      </p>

      <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onPick(item.prompt)}
            className={cn(
              "group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:text-primary">
              <item.icon className="size-4.5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
