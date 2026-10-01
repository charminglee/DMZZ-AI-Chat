/// <reference types="vite/client" />

type ThemeMode = "light" | "dark" | "system"

interface DesktopBridge {
  setTheme: (payload: { mode: ThemeMode }) => void
  /** 本地背景图片服务（仅 Electron 环境注入；服务未启动时 getImage 会 reject） */
  background?: {
    getImage(width: number, height: number): Promise<ArrayBuffer>
  }
  /** dzmm.ai 网页通道（仅 Electron 环境注入） */
  dzmm?: import("./lib/site-channel").DzmmBridge
  /** 主区内嵌浏览器视图（广场页；主进程 WebContentsView 渲染） */
  siteView?: {
    /** 加载目标页并把视图挂到窗口（默认隐藏，可见性由 setVisible 驱动） */
    show(url: string): Promise<void>
    /** 上报渲染层容器边界（相对窗口内容区的 CSS 像素） */
    setBounds(rect: { x: number; y: number; width: number; height: number }): Promise<void>
    setVisible(visible: boolean): Promise<void>
    reload(): Promise<void>
    /** 订阅加载状态事件；返回取消订阅函数 */
    onState(callback: (event: { type: string; data?: { errorCode?: number; isMainFrame?: boolean } }) => void): () => void
  }
}

interface Window {
  /** Electron 环境注入（浏览器中为 undefined） */
  desktop?: DesktopBridge
}
