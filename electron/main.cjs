const { app, BrowserWindow, shell } = require("electron")
const path = require("node:path")
const { currentBackground, registerThemeSync } = require("./theme.cjs")

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "DMZZ AI Chat",
    // 与主题一致的窗口底色，避免加载/切换时闪白
    backgroundColor: currentBackground(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once("ready-to-show", () => win.show())

  // 页面内的外部链接交给系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url)
    return { action: "deny" }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  }

  return win
}

function focusMainWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

// 单例模式：重复启动只唤醒已有窗口，不再开新实例
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    focusMainWindow()
  })

  registerThemeSync()

  app.whenReady().then(() => {
    createWindow()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else focusMainWindow()
    })
  })

  app.on("window-all-closed", () => {
    app.quit()
  })
}
