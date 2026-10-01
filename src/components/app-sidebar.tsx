import { useEffect, useMemo, useRef, useState } from "react"
import {
  Camera,
  Check,
  IdCard,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Store,
  Sun,
  Trash2,
  UserPen,
} from "lucide-react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { UserAvatarDialog, UserNameDialog } from "@/components/user-profile-dialogs"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarResizer } from "@/components/sidebar-resizer"
import { getSiteCredits, type SiteCredits } from "@/lib/site-channel"
import { cn } from "@/lib/utils"
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

/**
 * 侧栏顶层视图入口（新建对话 / 角色卡 / 后续新增入口）的统一选中样式：
 * 仅当前视图用品牌主色填充，其余入口保持默认样式。
 */
function viewEntryClass(active: boolean): string {
  return active
    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/80 active:text-primary-foreground"
    : ""
}

interface AppSidebarProps {
  chat: ChatController
  theme: {
    dark: boolean
    mode: ThemeMode
    setMode: (mode: ThemeMode) => void
    toggle: () => void
  }
  onOpenSettings: () => void
  sidebarWidth: {
    width: number
    setWidth: (width: number) => void
    persist: () => void
  }
  immersive: boolean
  userName: string
  avatar: string
  onUpdateProfile: (patch: { userName?: string; avatar?: string }) => void
  /** 主区视图：对话 / 角色卡 / 广场 */
  activeView: "chat" | "cards" | "plaza"
  onOpenCards: () => void
  onOpenPlaza: () => void
  /** 切回对话视图并执行操作（侧栏入口统一走这里） */
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
}

export function AppSidebar({ chat, theme, onOpenSettings, sidebarWidth, immersive, userName, avatar, onUpdateProfile, activeView, onOpenCards, onOpenPlaza, onNewConversation, onSelectConversation }: AppSidebarProps) {
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<Conversation | null>(null)
  // 站点积分/VIP 信息：菜单打开时拉取（site-channel 内有 5 分钟缓存）
  const [credits, setCredits] = useState<SiteCredits | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"
  const firstRender = useRef(true)

  // 收起/展开动画期间给根元素打标记：让文本改为硬裁切（见 index.css），
  // 避免省略号逐帧重排导致文字"跳动"
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.documentElement.classList.add("sidebar-animating")
    const timer = window.setTimeout(() => {
      document.documentElement.classList.remove("sidebar-animating")
    }, 260)
    return () => window.clearTimeout(timer)
  }, [state])

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

  /** 折叠态弹出列表：按最近更新排序 */
  const recentConversations = useMemo(
    () => [...chat.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [chat.conversations],
  )

  const confirmRename = () => {
    if (renaming) chat.renameConversation(renaming.id, renameValue)
    setRenaming(null)
  }

  /** 菜单打开时刷新站点积分信息（失败静默：不展示该区块即可） */
  const refreshCredits = () => {
    if (creditsLoading) return
    setCreditsLoading(true)
    getSiteCredits()
      .then((data) => setCredits(data))
      .catch(() => setCredits({ loggedIn: false, error: "读取失败" }))
      .finally(() => setCreditsLoading(false))
  }

  return (
    <>
    <Sidebar
      collapsible="icon"
      className={cn(
        // 合并宽度与透明度过渡：直接写 transition-opacity 会覆盖组件自带的
        // transition-[left,right,width]，导致收起动画消失
        "transition-[left,right,width,opacity]",
        immersive && "pointer-events-none opacity-0",
      )}
    >
      {/* 图标模式下补足内边距，让头部总高与展开态一致（64px），
          品牌方块与下方按钮在折叠/展开时零位移 */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* 品牌 Logo 即侧栏开关：悬停切换为收起/展开图标 */}
            <SidebarMenuButton
              size="lg"
              data-fix-height
              tooltip={collapsed ? "展开侧边栏" : "收起侧边栏"}
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              onClick={toggleSidebar}
              className="pl-0 transition-transform active:scale-[0.97] group-data-[collapsible=icon]:overflow-visible"
            >
              <div className="group/icon relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg brand-gradient text-white shadow-sm shadow-[var(--brand-glow)]">
                <Sparkles
                  className={cn(
                    "absolute size-4 transition-all duration-300 ease-out",
                    collapsed
                      ? "scale-50 -rotate-90 opacity-0"
                      : "group-hover/icon:scale-50 group-hover/icon:-rotate-90 group-hover/icon:opacity-0",
                  )}
                />
                <PanelLeftClose
                  className={cn(
                    "absolute size-4 scale-50 rotate-90 opacity-0 transition-all duration-300 ease-out",
                    !collapsed &&
                      "group-hover/icon:rotate-0 group-hover/icon:scale-100 group-hover/icon:opacity-100",
                  )}
                />
                <PanelLeftOpen
                  className={cn(
                    "absolute size-4 scale-50 opacity-0 transition-all duration-300 ease-out",
                    collapsed && "scale-100 opacity-100 group-hover/icon:scale-110",
                  )}
                />
              </div>
              <div className="sidebar-text flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="text-base font-semibold">DZMM AI</span>
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
                  onClick={onNewConversation}
                  className={viewEntryClass(activeView === "chat")}
                >
                  <Plus />
                  <span className="sidebar-text">新建对话</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="角色卡"
                  onClick={onOpenCards}
                  className={cn("mt-2", viewEntryClass(activeView === "cards"))}
                >
                  <IdCard />
                  <span className="sidebar-text">角色卡</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="广场"
                  onClick={onOpenPlaza}
                  className={cn("mt-2", viewEntryClass(activeView === "plaza"))}
                >
                  <Store />
                  <span className="sidebar-text">广场</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {/* 搜索：与「新建对话」同款收起逻辑——容器随侧栏一起收窄、
                输入框被 overflow 裁掉，放大镜位置全程不变。
                折叠态整块作为按钮：点击展开侧栏并聚焦输入框 */}
            <div
              role={collapsed ? "button" : undefined}
              tabIndex={collapsed ? 0 : undefined}
              aria-label={collapsed ? "搜索对话" : undefined}
              title={collapsed ? "搜索对话" : undefined}
              onClick={() => {
                if (!collapsed) return
                toggleSidebar()
                requestAnimationFrame(() => searchInputRef.current?.focus())
              }}
              onKeyDown={(e) => {
                if (collapsed && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  toggleSidebar()
                  requestAnimationFrame(() => searchInputRef.current?.focus())
                }
              }}
              className={cn(
                "relative mt-2 h-8 overflow-hidden transition-colors duration-200",
                collapsed
                  ? "cursor-pointer rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  : "rounded-lg border border-input bg-transparent dark:bg-input/30 focus-within:border-ring",
              )}
            >
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索对话..."
                tabIndex={collapsed ? -1 : undefined}
                className={cn(
                  "h-8 border-0 bg-transparent pl-8 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
                  collapsed && "pointer-events-none",
                )}
              />
            </div>

            {/* 折叠态：单个"最近对话"入口，与上方按钮同为 8px 间距；点击从右侧弹出列表 */}
            <div
              key={`recent-${collapsed ? "icon" : "full"}`}
              className="hidden animate-in fade-in duration-200 group-data-[collapsible=icon]:block"
            >
              <Popover open={recentOpen} onOpenChange={setRecentOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="最近对话"
                    title="最近对话"
                    className={cn(
                      "mt-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                    )}
                  >
                    <MessageSquare className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" sideOffset={8} className="w-72 p-0">
                  <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    最近对话
                  </p>
                  <div className="max-h-80 overflow-y-auto p-1">
                    {recentConversations.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                        还没有对话记录
                      </p>
                    ) : (
                      recentConversations.map((conv) => (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => {
                            onSelectConversation(conv.id)
                            setRecentOpen(false)
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            activeView === "chat" && conv.id === chat.activeId && "bg-accent font-medium text-accent-foreground",
                          )}
                        >
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{conv.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="flex min-h-0 flex-1 flex-col gap-0 pb-0">
          <SidebarGroupContent className="min-h-0 flex-1">
            <div className="h-full overflow-y-auto pb-2">
              {/* 展开态：按日期分组的完整列表（key 触发重挂载以重放渐入动画） */}
              <div
                key={`list-${collapsed ? "icon" : "full"}`}
                className="animate-in fade-in duration-200 group-data-[collapsible=icon]:hidden"
              >
                {groups.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
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
                      <SidebarGroupLabel className="px-2">{group.label}</SidebarGroupLabel>
                      <SidebarMenu>
                        {group.items.map((conv) => (
                          <SidebarMenuItem key={conv.id}>
                            <SidebarMenuButton
                              isActive={activeView === "chat" && conv.id === chat.activeId}
                              tooltip={conv.title}
                              onClick={() => onSelectConversation(conv.id)}
                            >
                              <MessageSquare />
                              <span className="sidebar-text truncate">{conv.title}</span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover>
                                  <MoreHorizontal />
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start" className="w-40">
                                <DropdownMenuItem onClick={() => setRenaming(conv)}>
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
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu onOpenChange={(open) => open && refreshCredits()}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  data-fix-height
                  className="pl-0 group-data-[collapsible=icon]:overflow-visible"
                >
                  <Avatar className="size-8">
                    {avatar && <AvatarImage src={avatar} alt={userName} className="object-cover" />}
                    <AvatarFallback className="user-gradient text-xs font-medium text-white">
                      {userName.slice(0, 1) || "友"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="sidebar-text flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="text-xs text-muted-foreground">本地账户</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-52">
                <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
                  {userName} · 本地账户
                </DropdownMenuLabel>
                {creditsLoading && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">正在获取站点积分信息…</p>
                )}
                {credits?.loggedIn && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground">积分余额</span>
                      <span className="truncate text-right font-medium">{credits.balance ?? "--"}</span>
                      <span className="text-muted-foreground">VIP 等级</span>
                      <span className="truncate text-right font-medium">{credits.vipLevel ?? "--"}</span>
                      <span className="text-muted-foreground">升级还差</span>
                      <span className="truncate text-right font-medium">
                        {credits.creditsToNext ? `${credits.creditsToNext} 积分` : "--"}
                      </span>
                      <span className="text-muted-foreground">VIP 到期</span>
                      <span className="truncate text-right font-medium">{credits.vipExpiry ?? "--"}</span>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setNameDialogOpen(true)}>
                  <UserPen className="size-4" />
                  修改称呼
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAvatarDialogOpen(true)}>
                  <Camera className="size-4" />
                  修改头像
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  主题
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme.mode}
                  onValueChange={(value) => theme.setMode(value as ThemeMode)}
                >
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="size-4" />
                    跟随系统
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="size-4" />
                    浅色
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="size-4" />
                    深色
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                {/* 折叠为图标栏时齿轮按钮不显示，菜单内保留设置入口 */}
                {collapsed && (
                  <>
                    <DropdownMenuItem onClick={onOpenSettings}>
                      <Settings className="size-4" />
                      设置
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem disabled>
                  <LogOut className="size-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* 设置入口：常驻在访客卡片右侧 */}
            <SidebarMenuAction
              aria-label="设置"
              title="设置"
              className="peer-data-[size=lg]/menu-button:top-3.5"
              onClick={onOpenSettings}
            >
              <Settings />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarResizer
        width={sidebarWidth.width}
        onWidthChange={sidebarWidth.setWidth}
        onWidthCommit={sidebarWidth.persist}
      />
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

      <UserNameDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        current={userName}
        onSave={(name) => onUpdateProfile({ userName: name })}
      />

      <UserAvatarDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        current={avatar}
        onSave={(next) => onUpdateProfile({ avatar: next })}
      />

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
