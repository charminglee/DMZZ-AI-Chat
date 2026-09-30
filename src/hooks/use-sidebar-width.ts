import { useCallback, useState } from "react"

const WIDTH_KEY = "dmzz-sidebar-width"
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 400
export const SIDEBAR_DEFAULT_WIDTH = 256

function clamp(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

function loadWidth(): number {
  const saved = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(saved) && saved > 0 ? clamp(saved) : SIDEBAR_DEFAULT_WIDTH
}

/** 侧边栏宽度：拖拽时实时更新，松开后持久化 */
export function useSidebarWidth() {
  const [width, setWidth] = useState(loadWidth)

  const setWidthClamped = useCallback((next: number) => {
    setWidth(clamp(next))
  }, [])

  const persist = useCallback(() => {
    setWidth((current) => {
      localStorage.setItem(WIDTH_KEY, String(current))
      return current
    })
  }, [])

  return { width, setWidth: setWidthClamped, persist }
}
