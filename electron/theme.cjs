const { BrowserWindow, ipcMain, nativeTheme } = require("electron")

// 与界面 --background 对应的近似值：浅色 oklch(1 0 0) / 深色 oklch(0.145 0 0)
const THEME_BG = { dark: "#0a0a0a", light: "#ffffff" }

function currentBackground() {
  return nativeTheme.shouldUseDarkColors ? THEME_BG.dark : THEME_BG.light
}

/**
 * 注册主题同步：渲染进程通过 preload 暴露的 desktop.setTheme 发来模式，
 * nativeTheme.themeSource 驱动原生标题栏明暗（Windows 标准边框），
 * 窗口底色同步更新，避免加载/切换/resize 时露出异色底。
 */
function registerThemeSync() {
  ipcMain.on("desktop:set-theme", (event, payload) => {
    const { mode } = payload ?? {}
    if (mode === "light" || mode === "dark" || mode === "system") {
      nativeTheme.themeSource = mode
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setBackgroundColor(currentBackground())
  })

  // 跟随系统模式下，系统主题变化时同步窗口底色（标题栏由 nativeTheme 自动跟随）
  nativeTheme.on("updated", () => {
    if (nativeTheme.themeSource !== "system") return
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(currentBackground())
    }
  })
}

module.exports = { THEME_BG, currentBackground, registerThemeSync }
