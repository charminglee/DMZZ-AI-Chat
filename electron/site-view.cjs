const { WebContentsView, ipcMain, shell } = require("electron")

/**
 * 主区内嵌浏览器视图（广场页）：
 * Electron 44 的 <webview> 标签 guest 视图尺寸同步损坏（恒为默认 ~150px，
 * 静态/动态创建、0 值回跳、autosize 等强制手法均无效），改用主进程
 * WebContentsView：渲染进程上报容器边界（site-view:bounds），这里直接 setBounds。
 *
 * 分区与 electron/dzmm.cjs 的隐藏站点窗口一致（persist:dzmm），共享站点登录态。
 * 注意：WebContentsView 层级永远在渲染层之上，设置弹窗等需要盖住它时，
 * 由渲染层显式 setVisible(false)（App 按 active 状态控制）。
 */

let view = null
let getMainWindow = () => null

function ensureView() {
  if (view && !view.webContents.isDestroyed()) return view
  view = new WebContentsView({
    webPreferences: {
      partition: "persist:dzmm", // 与隐藏窗口共享 cookie，登录态直接可用
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // 视图内的 target=_blank 链接交给系统浏览器，不在应用内弹出
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url)
    return { action: "deny" }
  })
  // 加载状态转发给渲染层（驱动加载遮罩/错误页）
  const forward = (type, data) => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      main.webContents.send("site-view:state", { type, data })
    }
  }
  view.webContents.on("did-start-loading", () => forward("did-start-loading"))
  view.webContents.on("did-stop-loading", () => forward("did-stop-loading"))
  view.webContents.on("did-fail-load", (_e, errorCode, _desc, _url, isMainFrame) => {
    forward("did-fail-load", { errorCode, isMainFrame })
  })
  return view
}

function initSiteViewBridge(mainWindowGetter) {
  getMainWindow = mainWindowGetter

  // 加载目标页并把视图挂到窗口上（默认隐藏，可见性由渲染层按 active 驱动）
  ipcMain.handle("site-view:show", (_e, url) => {
    const win = mainWindowGetter()
    if (!win || win.isDestroyed()) return
    const v = ensureView()
    // 目标页不同才导航，保留用户站内浏览状态
    if (v.webContents.getURL() !== url) {
      v.webContents.loadURL(url).catch(() => {})
    }
    if (!win.contentView.children.includes(v)) {
      win.contentView.addChildView(v)
    }
    v.setVisible(false)
  })

  ipcMain.handle("site-view:visible", (_e, visible) => {
    if (!view || view.webContents.isDestroyed()) return
    view.setVisible(Boolean(visible))
  })

  ipcMain.handle("site-view:bounds", (_e, rect) => {
    if (!view || view.webContents.isDestroyed()) return
    view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    })
  })

  ipcMain.handle("site-view:reload", () => {
    if (!view || view.webContents.isDestroyed()) return
    view.webContents.reload()
  })
}

module.exports = { initSiteViewBridge }
