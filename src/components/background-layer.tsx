import { cn } from "@/lib/utils"
import { useBackgroundImage } from "@/hooks/use-background-image"

/**
 * 沉浸模式背景层：本地背景图片服务出图后铺满窗口、交叉淡入轮换。
 * 服务预热期（约 15 秒）顶部显示“启动中”，连续失败转为“未连接”，
 * 出图后提示消失；背景不可用时界面保持主题背景色。
 */
export function BackgroundLayer({ active }: { active: boolean }) {
  const { layers, phase } = useBackgroundImage(active)

  if (!active) return null

  if (layers.length === 0) {
    if (phase === "starting") {
      return (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground/10 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm"
        >
          背景服务启动中，首次预热约需 15 秒…
        </div>
      )
    }
    if (phase === "disconnected") {
      return (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground/10 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm"
        >
          背景服务未连接，已回退纯色背景
        </div>
      )
    }
    return null
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 末尾为最新一层，始终淡入：首图从纯色背景过渡，后续图在前一张上交叉淡入 */}
      {layers.map((url, index) => (
        <img
          key={url}
          src={url}
          alt=""
          className={cn(
            "absolute inset-0 size-full object-cover",
            index === layers.length - 1 && "animate-in fade-in duration-1000",
          )}
        />
      ))}
      {/* 可读性遮罩：半透明主题色渐变，压住图片保证消息文字对比度 */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background/85" />
    </div>
  )
}
