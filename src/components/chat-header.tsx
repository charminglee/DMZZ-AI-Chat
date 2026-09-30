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
import { findGroup, resolveVariant, sizeSummary, type ModelGroup } from "@/lib/model-groups"
import { cn } from "@/lib/utils"

interface ChatHeaderProps {
  title: string
  model: string
  modelGroups: ModelGroup[]
  modelsLoading: boolean
  onModelChange: (id: string) => void
  onOpenSettings: () => void
  dark: boolean
  onToggleTheme: () => void
}

export function ChatHeader({
  title,
  model,
  modelGroups,
  modelsLoading,
  onModelChange,
  onOpenSettings,
  dark,
  onToggleTheme,
}: ChatHeaderProps) {
  const current = findGroup(modelGroups, model)
  const currentGroup = current?.group
  const currentSize = current?.variant.size

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="max-w-44 truncate">
                {currentGroup ? `${currentGroup.name} · ${currentSize}` : "选择模型"}
              </span>
              {modelsLoading ? (
                <Loader2 className="size-3.5 animate-spin opacity-60" />
              ) : (
                <ChevronDown className="size-3.5 opacity-60" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
            {currentGroup && currentGroup.variants.length > 1 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  上下文长度
                </DropdownMenuLabel>
                <div className="px-1.5 pb-1.5">
                  <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
                    {currentGroup.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => onModelChange(variant.id)}
                        className={cn(
                          "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          variant.id === model
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {variant.size}
                      </button>
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              选择模型（{modelGroups.length}）
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {modelGroups.length === 0 ? (
              <DropdownMenuItem disabled>
                暂无可用模型，请到设置中刷新列表
              </DropdownMenuItem>
            ) : (
              modelGroups.map((group) => (
                <DropdownMenuItem
                  key={group.key}
                  onClick={() => onModelChange(resolveVariant(group, currentSize).id)}
                  className="gap-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{group.name}</span>
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {sizeSummary(group)}
                    </span>
                  </span>
                  {group.key === currentGroup?.key && (
                    <Check className="size-4 shrink-0" />
                  )}
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
