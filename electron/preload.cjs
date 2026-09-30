const { contextBridge, ipcRenderer } = require("electron")

// 仅暴露最小接口：把主题模式同步给主进程（驱动原生标题栏与窗口底色）
contextBridge.exposeInMainWorld("desktop", {
  setTheme: (payload) => ipcRenderer.send("desktop:set-theme", payload),
})
