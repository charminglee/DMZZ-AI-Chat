import { Check, ChevronDown, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { MODELS } from "@/lib/types"

interface ChatHeaderProps {
  title: string
  model: string
  onModelChange: (id: string) => void
  dark: boolean
  onToggleTheme: () => void
}

export function ChatHeader({
  title,
  model,
  onModelChange,
  dark,
  onToggleTheme,
}: ChatHeaderProps) {
  const activeModel = MODELS.find((m) => m.id === model) ?? MODELS[0]

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger className="size-8" />
      <Separator orientation="vertical" className="mr-1 !h-5" />
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              {activeModel.name}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              选择模型
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODELS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => onModelChange(m.id)}
                className="gap-3"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] font-semibold">
                  {m.name.split(" ")[1] ?? "AI"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {m.name}
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
                {m.id === activeModel.id && (
                  <Check className="ml-auto size-4 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
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
