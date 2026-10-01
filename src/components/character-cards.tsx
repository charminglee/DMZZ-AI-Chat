import { useRef, useState } from "react"
import {
  BadgeCheck,
  Heart,
  IdCard,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { SiteCard } from "@/lib/types"

interface CharacterCardsProps {
  cards: SiteCard[]
  /** 按 ID 添加/刷新（失败抛错，由弹窗展示） */
  onAdd: (id: number) => Promise<{ card: SiteCard; existed: boolean }>
  onRemove: (id: number) => void
  /** 当前网页通道正在使用的站点角色卡 ID（settings.siteCardId 字符串） */
  currentCardId: string
  onStartChat: (card: SiteCard) => void
}

/** 12345 → 1.2万 */
function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`
  return String(n)
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })
}

/**
 * 角色卡头像/立绘：直接显示站点图；加载失败（签名链过期等）回退为首字渐变头像。
 * 外框与图片样式可通过 className / imgClassName 定制（列表竖版立绘、详情圆形方图等）。
 */
function CardAvatar({
  card,
  className,
  imgClassName,
}: {
  card: SiteCard
  className?: string
  imgClassName?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      {card.avatar && !failed ? (
        <img
          src={card.avatar}
          alt={card.name}
          onError={() => setFailed(true)}
          className={cn("size-full object-cover", imgClassName)}
        />
      ) : (
        <span className="brand-gradient flex size-full items-center justify-center text-3xl font-medium text-white">
          {card.name.slice(0, 1)}
        </span>
      )}
    </div>
  )
}

function TagList({ tags, max }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null
  const limit = max ?? tags.length
  const shown = tags.slice(0, limit)
  return (
    <div className={`flex min-w-0 items-center gap-1 ${max === undefined ? "flex-wrap" : "overflow-hidden"}`}>
      {shown.map((tag) => (
        <Badge key={tag} variant="secondary" className="max-w-24 shrink-0 px-1.5 py-0 text-[10px] font-normal">
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
      {tags.length > limit && (
        <span className="shrink-0 text-[10px] text-muted-foreground">+{tags.length - limit}</span>
      )}
    </div>
  )
}

/** 添加角色卡：手动输入卡牌 ID，从 dzmm.ai 拉取卡牌信息 */
function AddCardDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (id: number) => Promise<{ card: SiteCard; existed: boolean }>
}) {
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const id = Number(value.trim())
  const valid = /^\d+$/.test(value.trim()) && id > 0

  const submit = async () => {
    if (!valid || loading) return
    setLoading(true)
    setError(null)
    try {
      await onAdd(id)
      setValue("")
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
          setValue("")
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>添加角色卡</DialogTitle>
          <DialogDescription>
            输入 dzmm.ai 角色卡 ID（角色页地址 dzmm.ai/character/&lt;ID&gt; 里的数字）。
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          inputMode="numeric"
          placeholder="例如 3640722"
          value={value}
          disabled={loading}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button disabled={!valid || loading} onClick={() => void submit()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {loading ? "获取中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CharacterCards({ cards, onAdd, onRemove, currentCardId, onStartChat }: CharacterCardsProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<SiteCard | null>(null)
  const [deleting, setDeleting] = useState<SiteCard | null>(null)
  const [refreshing, setRefreshing] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 「刷新/错误」临时提示，2.5 秒后收起
  const noticeTimer = useRef<number | undefined>(undefined)

  const showNotice = (text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500)
  }

  const refresh = async (card: SiteCard) => {
    setRefreshing(card.id)
    try {
      await onAdd(card.id)
      showNotice(`已刷新「${card.name}」的信息`)
    } catch (e) {
      showNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              角色卡
              {cards.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">{cards.length}</span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              通过卡牌 ID 添加 dzmm.ai 角色卡，选中后可在网页通道与其对话
            </p>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            添加角色卡
          </Button>
        </div>

        {notice && (
          <p className="mt-3 animate-in fade-in rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {notice}
          </p>
        )}

        {cards.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="brand-gradient flex size-14 items-center justify-center rounded-2xl text-white shadow-lg shadow-[var(--brand-glow)]">
              <IdCard className="size-7" />
            </div>
            <p className="text-sm font-medium">还没有角色卡</p>
            <p className="max-w-xs text-xs leading-5 text-muted-foreground">
              在 dzmm.ai 打开喜欢的角色页，复制地址里的数字 ID，即可在这里创建属于自己的角色卡
            </p>
            <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              添加角色卡
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {cards.map((card) => {
              const inUse = currentCardId === String(card.id)
              return (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(card)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setDetail(card)
                    }
                  }}
                  className={cn(
                    "group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-all",
                    "hover:border-ring/60 hover:shadow-md",
                    inUse && "border-primary/50 ring-1 ring-primary/25",
                  )}
                >
                  {/* 竖版立绘：名称与作者叠加在底部渐变上 */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    <CardAvatar
                      card={card}
                      className="size-full rounded-none"
                      imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    {inUse && (
                      <Badge className="absolute top-2 left-2 gap-0.5 px-1.5 py-0 text-[10px] font-normal shadow">
                        <BadgeCheck className="size-3" />
                        使用中
                      </Badge>
                    )}
                    {/* 更多操作：悬浮在立绘右上角，避免占用信息区宽度 */}
                    <span onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="更多操作"
                            title="更多操作"
                            className="absolute top-2 right-2 size-7 rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"
                          >
                            {refreshing === card.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => void refresh(card)}>
                            <RefreshCw className="size-4" />
                            刷新信息
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(card)}>
                            <Trash2 className="size-4" />
                            移除角色卡
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pt-8 pb-2.5">
                      <h3 className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere] text-white">
                        {card.name}
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] text-white/70">
                        {card.creator || "未知作者"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/70">#{card.id}</p>
                    </div>
                  </div>

                  {/* 信息区 */}
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <TagList tags={card.tags} max={3} />
                    <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                      {card.description || "（这张角色卡没有公开简介）"}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex shrink-0 items-center gap-0.5">
                          <Heart className="size-3" />
                          {formatCount(card.likes)}
                        </span>
                        <span className="truncate">热度 {formatCount(card.popularity)}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 shrink-0 px-2.5 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartChat(card)
                        }}
                      >
                        开始对话
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AddCardDialog open={addOpen} onOpenChange={setAddOpen} onAdd={onAdd} />

      {/* 角色卡详情 */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                {/* min-w-0：网格子项默认最小宽度为内容宽度，长标题会撑破弹窗宽度；
                    pr-10：为右上角关闭按钮留出足够间距（按钮占右侧约 36px） */}
                <DialogTitle className="flex min-w-0 items-center gap-2 pr-10">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{detail.name}</span>
                </DialogTitle>
                <DialogDescription className="min-w-0 [overflow-wrap:anywhere]">
                  {detail.creator || "未知作者"}
                  {formatDate(detail.publishedAt) ? ` · 发布于 ${formatDate(detail.publishedAt)}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex gap-4">
                <CardAvatar card={detail} className="size-24" />
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  <TagList tags={detail.tags} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="size-3.5" />
                      {formatCount(detail.likes)} 喜欢
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-3.5" />
                      {formatCount(detail.comments)} 评论
                    </span>
                    <span>热度 {formatCount(detail.popularity)}</span>
                    <span>#{detail.id}</span>
                  </div>
                </div>
              </div>

              <div className="max-h-64 min-w-0 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                {/* overflow-wrap:anywhere：简介里可能有超长不可断行串（URL 等），否则横向溢出 */}
                <p className="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere] text-muted-foreground">
                  {detail.description || "（这张角色卡没有公开简介）"}
                </p>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setDeleting(detail)
                    setDetail(null)
                  }}
                >
                  <Trash2 className="size-4" />
                  移除
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    onStartChat(detail)
                    setDetail(null)
                  }}
                >
                  <MessageSquare className="size-4" />
                  开始对话
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 移除确认 */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>移除角色卡</DialogTitle>
            <DialogDescription>
              确定要从列表中移除「{deleting?.name}」吗？站点上的角色卡不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) onRemove(deleting.id)
                setDeleting(null)
              }}
            >
              <Trash2 className="size-4" />
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
