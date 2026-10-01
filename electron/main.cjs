const { app, BrowserWindow, ipcMain, shell } = require("electron")
const { spawn } = require("node:child_process")
const net = require("node:net")
const path = require("node:path")
const { currentBackground, registerThemeSync } = require("./theme.cjs")
const { initDzmmBridge } = require("./dzmm.cjs")
const { initSiteViewBridge } = require("./site-view.cjs")

let mainWindow = null

// 本地背景图片服务（NteBackgroundImageServer，见 ModManager/docs/background-image-service.md）。
// 服务未设置 CORS 头，由主进程代为请求，renderer 通过 preload IPC 获取 PNG。
ipcMain.handle("background:get", async (_event, width, height) => {
  const url = new URL("http://127.0.0.1:48126/background")
  url.searchParams.set("width", String(width))
  url.searchParams.set("height", String(height))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`背景服务返回 HTTP ${response.status}: ${await response.text()}`)
  }
  return response.arrayBuffer()
})

// ---- 背景服务生命周期托管 ----
// 应用启动时拉起服务（预热约 15 秒后可用），退出时关闭。
// exe 必须以 build\Release 为工作目录启动（共享同目录 python 环境）。
const BG_SERVICE_EXE = "E:\\Projects\\ModManager\\build\\Release\\NteBackgroundImageServer.exe"
const BG_SERVICE_CWD = "E:\\Projects\\ModManager\\build\\Release"
const BG_SERVICE_PORT = 48126

/** 仅记录应用自己 spawn 的实例；外部实例（用户手动启动/上次残留）不托管、退出时不杀 */
let bgServiceProc = null

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

async function ensureBackgroundService() {
  // 已有实例在监听则直接复用，避免无单例互斥体的 exe 多开抢端口
  if (await isPortOpen(BG_SERVICE_PORT)) return
  try {
    bgServiceProc = spawn(BG_SERVICE_EXE, [], {
      cwd: BG_SERVICE_CWD,
      stdio: "ignore",
      windowsHide: true,
    })
    bgServiceProc.once("exit", () => {
      bgServiceProc = null
    })
    bgServiceProc.once("error", () => {
      bgServiceProc = null
    })
  } catch (error) {
    console.warn("背景服务启动失败:", error.message)
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "DZMM AI Chat",
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

  // 隐藏的站点窗口会一直存在，window-all-closed 不会触发；
  // 主窗口关闭即退出应用（先于 closed 清引用，避免桥接层拿到悬垂窗口）
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null
    app.quit()
  })

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

  mainWindow = win
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
  initDzmmBridge(() => mainWindow)
  initSiteViewBridge(() => mainWindow)

  app.whenReady().then(() => {
    createWindow()
    ensureBackgroundService()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else focusMainWindow()
    })
  })

  app.on("will-quit", () => {
    if (bgServiceProc) bgServiceProc.kill()
  })

  app.on("window-all-closed", () => {
    app.quit()
  })
}
