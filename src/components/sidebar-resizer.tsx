import { useRef } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface SidebarResizerProps {
  width: number
  onWidthChange: (width: number) => void
  onWidthCommit: () => void
}

const DRAG_THRESHOLD = 3

/**
 * 侧边栏宽度拖拽把手：
 * - 按住拖拽 → 实时调整宽度
 * - 原地点按（未拖动）→ 折叠/展开（保留原 SidebarRail 的行为）
 */
export function SidebarResizer({ width, onWidthChange, onWidthCommit }: SidebarResizerProps) {
  const { state, toggleSidebar } = useSidebar()
  const start = useRef({ x: 0, width: 0, moved: false })
  const dragging = useRef(false)

  const endDrag = (target: HTMLElement, pointerId: number) => {
    if (!dragging.current) return
    dragging.current = false
    document.documentElement.classList.remove("sidebar-resizing")
    try {
      target.releasePointerCapture?.(pointerId)
    } catch {
      /* 指针已释放 */
    }
    if (start.current.moved) onWidthCommit()
    else toggleSidebar()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整侧边栏宽度，点击折叠"
      title="拖拽调整宽度 / 点击折叠"
      data-slot="sidebar-resizer"
      className={cn(
        "absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize sm:flex",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors",
        "hover:after:bg-sidebar-border active:after:bg-sidebar-ring",
        "group-data-[collapsible=icon]:hidden",
      )}
      onPointerDown={(event) => {
        if (state === "collapsed") return
        event.preventDefault()
        dragging.current = true
        start.current = { x: event.clientX, width, moved: false }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* 合成事件下不可捕获，移动事件仍可正常触发 */
        }
        document.documentElement.classList.add("sidebar-resizing")
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        const dx = event.clientX - start.current.x
        if (Math.abs(dx) > DRAG_THRESHOLD) start.current.moved = true
        if (start.current.moved) onWidthChange(start.current.width + dx)
      }}
      onPointerUp={(event) => endDrag(event.currentTarget, event.pointerId)}
      onPointerCancel={(event) => endDrag(event.currentTarget, event.pointerId)}
    />
  )
}
