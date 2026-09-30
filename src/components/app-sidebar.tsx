import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { ChatController } from "@/hooks/use-chat"
import type { Conversation } from "@/lib/types"

const DAY = 86_400_000

function groupLabelOf(timestamp: number): string {
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  if (timestamp >= startOfToday) return "今天"
  if (timestamp >= startOfToday - DAY) return "昨天"
  if (timestamp >= startOfToday - 7 * DAY) return "近 7 天"
  return "更早"
}

const GROUP_ORDER = ["今天", "昨天", "近 7 天", "更早"]

interface AppSidebarProps {
  chat: ChatController
  dark: boolean
  onToggleTheme: () => void
}

export function AppSidebar({ chat, dark, onToggleTheme }: AppSidebarProps) {
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deleting, setDeleting] = useState<Conversation | null>(null)

  useEffect(() => {
    if (renaming) setRenameValue(renaming.title)
  }, [renaming])

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = keyword
      ? chat.conversations.filter((c) => c.title.toLowerCase().includes(keyword))
      : chat.conversations

    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt)
    const map = new Map<string, Conversation[]>()
    for (const conv of sorted) {
      const label = keyword ? "搜索结果" : groupLabelOf(conv.updatedAt)
      const bucket = map.get(label) ?? []
      bucket.push(conv)
      map.set(label, bucket)
    }
    const order = keyword ? ["搜索结果"] : GROUP_ORDER
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, items: map.get(label) ?? [] }))
  }, [chat.conversations, query])

  const confirmRename = () => {
    if (renaming) chat.renameConversation(renaming.id, renameValue)
    setRenaming(null)
  }

  return (
    <>
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                <Sparkles className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-base font-semibold">DMZZ AI</span>
                <span className="text-xs text-muted-foreground">智能对话助手</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="新建对话"
                  onClick={chat.newConversation}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus />
                  <span>新建对话</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="relative mt-2 group-data-[collapsible=icon]:hidden">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索对话..."
                className="h-8 pl-8 text-sm"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="flex min-h-0 flex-1 flex-col gap-0 pb-0">
          <SidebarGroupContent className="min-h-0 flex-1">
            <div className="h-full overflow-y-auto px-2 pb-2">
              {groups.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center group-data-[collapsible=icon]:hidden">
                  <MessageSquare className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {query ? "没有匹配的对话" : "还没有对话记录"}
                  </p>
                  {!query && (
                    <p className="text-xs text-muted-foreground/70">
                      点击上方「新建对话」开始
                    </p>
                  )}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-2">
                    <SidebarGroupLabel className="px-2 group-data-[collapsible=icon]:hidden">
                      {group.label}
                    </SidebarGroupLabel>
                    <SidebarMenu>
                      {group.items.map((conv) => (
                        <SidebarMenuItem key={conv.id}>
                          <SidebarMenuButton
                            isActive={conv.id === chat.activeId}
                            tooltip={conv.title}
                            onClick={() => chat.selectConversation(conv.id)}
                          >
                            <MessageSquare />
                            <span className="truncate">{conv.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction
                                showOnHover
                                className="group-data-[collapsible=icon]:hidden"
                              >
                                <MoreHorizontal />
                              </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start" className="w-40">
                              <DropdownMenuItem
                                onClick={() => setRenaming(conv)}
                              >
                                <Pencil className="size-4" />
                                重命名
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleting(conv)}
                              >
                                <Trash2 className="size-4" />
                                删除对话
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                ))
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-gradient-to-br from-sky-500 to-indigo-500 text-xs font-medium text-white">
                      访客
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-medium">访客用户</span>
                    <span className="text-xs text-muted-foreground">
                      guest@dmzz.ai
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  guest@dmzz.ai
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onToggleTheme}>
                  {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {dark ? "切换到浅色模式" : "切换到深色模式"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Settings className="size-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <LogOut className="size-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      </Sidebar>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名对话</DialogTitle>
            <DialogDescription>为这个对话起一个好认的名字。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename()
            }}
            placeholder="对话名称"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>
              <Check className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除对话</DialogTitle>
            <DialogDescription>
              确定要删除「{deleting?.title}」吗？删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) chat.deleteConversation(deleting.id)
                setDeleting(null)
              }}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
