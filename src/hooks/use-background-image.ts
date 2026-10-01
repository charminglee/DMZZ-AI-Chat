import { useEffect, useRef, useState } from "react"

/** 背景轮换间隔 */
const ROTATE_MS = 5000
/** 窗口尺寸变化后的防抖，停止拖动后再取新图 */
const RESIZE_DEBOUNCE_MS = 300
/** 高分屏下按 DPR 请求更清晰的图，封顶 2 避免超过服务端像素上限 */
const MAX_DPR = 2

/** 连续失败达到此次数后，提示从“启动中”转为“未连接”（对齐服务约 15 秒的预热窗口） */
const FAIL_THRESHOLD = 3

export type BackgroundPhase = "starting" | "disconnected" | "ready"

/**
 * 沉浸模式背景图：激活时立即取一张，之后每 5 秒轮换一张。
 *
 * layers 为最多两个 blob URL（末尾为最新），渲染层叠放做交叉淡入；
 * phase 表示服务连接状态（预热期显示“启动中”，连续失败显示“未连接”，
 * 出图后为 ready），调用方据此给出可见提示。
 * 浏览器环境（无 window.desktop）时 layers 恒为空、phase 恒为 disconnected。
 */
export function useBackgroundImage(active: boolean): { layers: string[]; phase: BackgroundPhase } {
  const [layers, setLayers] = useState<string[]>([])
  const [phase, setPhase] = useState<BackgroundPhase>("starting")
  // setLayers 的镜像：pushLayer 需要同步读旧层计算 revoke，不能把副作用放进 updater
  const layersRef = useRef<string[]>([])

  useEffect(() => {
    const getImage = window.desktop?.background?.getImage
    if (!active || !getImage) {
      layersRef.current.forEach((url) => URL.revokeObjectURL(url))
      layersRef.current = []
      setLayers([])
      setPhase(getImage ? "starting" : "disconnected")
      return
    }

    let disposed = false
    let inFlight = false
    let failCount = 0

    const requestSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      return {
        width: Math.round(window.innerWidth * dpr),
        height: Math.round(window.innerHeight * dpr),
      }
    }

    const pushLayer = (url: string) => {
      // 保留上一张作淡入衬底，更早的已完成使命，释放
      const stale = layersRef.current.slice(0, -1)
      layersRef.current = [...layersRef.current.slice(-1), url]
      setLayers(layersRef.current)
      stale.forEach((u) => URL.revokeObjectURL(u))
    }

    const tick = async () => {
      if (inFlight || disposed) return
      inFlight = true
      // 未提交到层的 URL 由本次调用负责释放
      let pendingUrl: string | undefined
      try {
        const { width, height } = requestSize()
        const png = await getImage(width, height)
        if (disposed) return
        const url = URL.createObjectURL(new Blob([png], { type: "image/png" }))
        pendingUrl = url
        // 先解码完成再上屏，避免淡入动画开始时图片还没就绪
        const img = new Image()
        img.src = url
        await img.decode()
        if (disposed) {
          URL.revokeObjectURL(url)
          return
        }
        pendingUrl = undefined
        pushLayer(url)
        failCount = 0
        setPhase("ready")
      } catch {
        // 服务未启动 / 解码失败：释放未上屏的图，保持现有背景，等下一轮再试
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        failCount += 1
        setPhase(failCount >= FAIL_THRESHOLD ? "disconnected" : "starting")
      } finally {
        inFlight = false
      }
    }

    void tick()
    const rotate = window.setInterval(() => void tick(), ROTATE_MS)

    // 窗口尺寸变化后按新尺寸取图（尺寸每次都取实时值，轮换自然会跟上）
    let resizeTimer: number | undefined
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => void tick(), RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener("resize", onResize)

    return () => {
      disposed = true
      window.clearInterval(rotate)
      window.clearTimeout(resizeTimer)
      window.removeEventListener("resize", onResize)
      layersRef.current.forEach((url) => URL.revokeObjectURL(url))
      layersRef.current = []
      setLayers([])
      setPhase("starting")
    }
  }, [active])

  return active ? { layers, phase } : { layers: [], phase: "starting" }
}
