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
}

interface Window {
  /** Electron 环境注入（浏览器中为 undefined） */
  desktop?: DesktopBridge
}
