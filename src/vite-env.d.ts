/// <reference types="vite/client" />

type ThemeMode = "light" | "dark" | "system"

interface DesktopBridge {
  setTheme: (payload: { mode: ThemeMode }) => void
}

interface Window {
  /** Electron 环境注入（浏览器中为 undefined） */
  desktop?: DesktopBridge
}
