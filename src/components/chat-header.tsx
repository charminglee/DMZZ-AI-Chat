import { Check, ChevronDown, Loader2, Moon, Settings2, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ModelInfo } from "@/lib/types"

interface ChatHeaderProps {
  title: string
  model: string
  models: ModelInfo[]
  modelsLoading: boolean
  onModelChange: (id: string) => void
  onOpenSettings: () => void
  dark: boolean
  onToggleTheme: () => void
}

export function ChatHeader({
  title,
  model,
  models,
  modelsLoading,
  onModelChange,
  onOpenSettings,
  dark,
  onToggleTheme,
}: ChatHeaderProps) {
  const activeModel = models.find((m) => m.id === model)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="max-w-44 truncate">{activeModel?.name ?? "选择模型"}</span>
              {modelsLoading ? (
                <Loader2 className="size-3.5 animate-spin opacity-60" />
              ) : (
                <ChevronDown className="size-3.5 opacity-60" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              选择模型（{models.length}）
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {models.length === 0 ? (
              <DropdownMenuItem disabled>
                暂无可用模型，请到设置中刷新列表
              </DropdownMenuItem>
            ) : (
              models.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => onModelChange(m.id)}
                  className="gap-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{m.name}</span>
                      {m.badge && (
                        <span className="rounded bg-primary/10 px-1 py-px text-[10px] font-normal text-primary">
                          {m.badge}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {m.description}
                    </span>
                  </span>
                  {m.id === model && <Check className="ml-auto size-4 shrink-0" />}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings} className="gap-2">
              <Settings2 className="size-4" />
              设置…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onToggleTheme}
          aria-label="切换主题"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
