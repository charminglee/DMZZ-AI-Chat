const { contextBridge, ipcRenderer } = require("electron")

// 隐藏窗口内页面 ↔ 主进程的唯一通道：把 /api/chat 的流式事件逐条上报。
// 页面主世界脚本通过 window.__dzmm.event(reqId, type, data) 调用。
contextBridge.exposeInMainWorld("__dzmm", {
  event: (reqId, type, data) => ipcRenderer.send("dzmm:stream-event", { reqId, type, data }),
})
