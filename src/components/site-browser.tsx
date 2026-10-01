import { useEffect, useRef, useState } from "react"
import { Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** 广场页地址（按近 7 天最高评分排序） */
export const PLAZA_URL = "https://www.dzmm.ai/?t=highest_rated_7d"

/**
 * 内置浏览器视图（广场页）：
 * Electron 44 的 <webview> 标签 guest 尺寸同步损坏（恒为默认 ~150px），
 * 改由主进程 WebContentsView 渲染页面内容（见 electron/site-view.cjs）。
 * 本组件只负责：上报宿主容器边界给主进程 setBounds、按 active 开关视图可见性、
 * 以及展示加载/错误遮罩。分区 persist:dzmm 与隐藏站点窗口共享登录态。
 */
export function SiteBrowser({ url, active }: { url: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const isDesktop = Boolean(window.desktop?.siteView)

  // 加载目标页 + 订阅加载状态（视图常驻，仅首次 show 导航）
  useEffect(() => {
    if (!isDesktop) return
    const bridge = window.desktop!.siteView!
    void bridge.show(url)
    return bridge.onState((event) => {
      if (event.type === "did-start-loading") {
        setLoading(true)
        setFailed(false)
      } else if (event.type === "did-stop-loading") {
        setLoading(false)
      } else if (event.type === "did-fail-load") {
        // 只认主框架失败；-3 (ABORTED) 是被新加载打断，不算失败
        if (event.data?.isMainFrame === false) return
        if (event.data?.errorCode === -3) return
        setLoading(false)
        setFailed(true)
      }
    })
  }, [url, isDesktop])

  // 边界同步：容器尺寸/位置变化（窗口缩放、侧栏拖宽、视图显隐）时上报主进程
  useEffect(() => {
    if (!isDesktop) return
    const host = hostRef.current
    if (!host) return
    const bridge = window.desktop!.siteView!
    const sync = () => {
      const rect = host.getBoundingClientRect()
      const bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      void bridge.setBounds(bounds)
      // 容器没有面积（视图被隐藏）时一并隐藏 WebContentsView
      void bridge.setVisible(active && bounds.width > 0 && bounds.height > 0)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(host)
    return () => observer.disconnect()
  }, [active, isDesktop])

  const retry = () => {
    setFailed(false)
    setLoading(true)
    void window.desktop?.siteView?.reload()
  }

  if (!isDesktop) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">广场功能仅桌面版可用（需通过 Electron 启动）</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      {/* 实际内容由主进程 WebContentsView 绘制在渲染层之上，这里只是占位定位区 */}
      <div ref={hostRef} className="h-full w-full" />
      {active && loading && !failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {active && failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
          <p className="text-sm text-muted-foreground">广场页面加载失败，请检查网络后重试</p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCw className="size-4" />
            重新加载
          </Button>
        </div>
      )}
    </div>
  )
}
